import crypto from 'node:crypto';
import { createClient } from 'redis';

import prisma from '../../config/prisma.js';
import env from '../../config/env.js';
import { ALARM } from '../../config/constants.js';
import * as alarmService from '../../services/alarm.service.js';
import { generate } from '../../services/gemini.service.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { badRequest, conflict, forbidden, notFound } from '../../utils/AppError.js';
import * as v from '../../utils/validate.js';

// عميل Redis لمنع تكرار الـ Snooze (P2) — ضغطتان سريعتان = نداء AI واحد
const snoozeRedis = createClient({ url: env.redisUrl, socket: { connectTimeout: 2000 } });
snoozeRedis.on('error', () => {});
if (!snoozeRedis.isOpen) snoozeRedis.connect().catch(() => {});

/** منع التكرار: يسمح بنداء واحد لكل غفوة خلال 3 ثوانٍ */
const tryLockSnooze = async (userId, alarmId) => {
  try {
    const key = `alarm:snooze:${userId}:${alarmId ?? 'generic'}`;
    const got = await snoozeRedis.set(key, '1', { NX: true, EX: 3 });
    return got === 'OK';
  } catch {
    return true; // لو Redis وقع → يسمح (لا نكسر المنبه)
  }
};

/**
 * ════════════════════════════════════════════════════════════
 *  منبه المعركة
 * ════════════════════════════════════════════════════════════
 */

/**
 * توقيع مسألة الاستيقاظ.
 *
 * لماذا HMAC لا Base64 عادي؟
 *   Base64 قابل للفك والتعديل — أي مستخدم يقرأ الإجابة أو يزوّرها.
 *   التوقيع يمنع ذلك: الخادم وحده يستطيع إنشاء token صالح.
 */
const signTask = (answer) => {
  const payload = JSON.stringify({ a: answer, t: Date.now() });
  const body = Buffer.from(payload).toString('base64url');
  const sig = crypto
    .createHmac('sha256', env.jwt.accessSecret)
    .update(body)
    .digest('base64url');

  return `${body}.${sig}`;
};

const verifyTask = (token) => {
  const [body, sig] = String(token ?? '').split('.');
  if (!body || !sig) return null;

  const expected = crypto
    .createHmac('sha256', env.jwt.accessSecret)
    .update(body)
    .digest('base64url');

  // مقارنة ثابتة الزمن — تمنع كشف التوقيع بالتخمين
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString());
  } catch {
    return null;
  }
};

const validDays = (days) =>
  [...new Set(days)]
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    .sort((x, y) => x - y);

//////////////////////////////////////////////////////
// إدارة المنبهات
//////////////////////////////////////////////////////

export const listAlarms = asyncHandler(async (req, res) => {
  const userId = req.user.userId;

  const [alarms, user, lastLog] = await Promise.all([
    prisma.battleAlarm.findMany({ where: { userId }, orderBy: { time: 'asc' } }),
    prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } }),
    prisma.wakeLog.findFirst({ where: { userId }, orderBy: { date: 'desc' } }),
  ]);

  const weekday = alarmService.localWeekdayOf(user.timezone);

  res.json({
    success: true,
    timezone: user.timezone,
    localTime: alarmService.localTimeOf(user.timezone),
    todayWeekday: weekday,
    settings: {
      graceMinutes: ALARM.GRACE_MINUTES,
      wakeSparks: ALARM.WAKE_SPARKS,
      snoozeAllowed: ALARM.SNOOZE_ALLOWED,
      maxAlarms: ALARM.MAX_ALARMS,
    },
    lastWake: lastLog
      ? { date: lastLog.date, result: lastLog.result, time: lastLog.scheduledTime }
      : null,
    alarms: alarms.map((a) => ({
      ...a,
      /** هل يرنّ اليوم؟ الواجهة تبرزه */
      firesToday: a.isActive && a.days.includes(weekday),
    })),
    /** التطبيق يجدول المنبهات محلياً — الخادم لا يرنّ */
    note: 'جدول هذه المنبهات محلياً في التطبيق',
  });
});

export const createAlarm = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { time, days, label, requireProof = true } = req.body ?? {};

  if (!alarmService.isValidTime(time)) {
    throw badRequest('صيغة الوقت يجب أن تكون HH:mm مثل 06:00');
  }

  if (!Array.isArray(days) || days.length === 0) {
    throw badRequest('اختر يوماً واحداً على الأقل');
  }

  const clean = validDays(days);
  if (clean.length === 0) {
    throw badRequest('أيام غير صالحة — الأحد = 0 والسبت = 6');
  }

  const count = await prisma.battleAlarm.count({ where: { userId } });
  if (count >= ALARM.MAX_ALARMS) {
    throw conflict(`الحد الأقصى ${ALARM.MAX_ALARMS} منبهات`, 'MAX_ALARMS');
  }

  // منبه بنفس الوقت واليوم = تكرار بلا فائدة
  const duplicate = await prisma.battleAlarm.findFirst({
    where: { userId, time, days: { hasSome: clean } },
    select: { id: true },
  });

  if (duplicate) {
    throw conflict('لديك منبه في نفس الوقت واليوم', 'DUPLICATE_ALARM');
  }

  const alarm = await prisma.battleAlarm.create({
    /**
     * ️ كان `Boolean(requireProof)` — وأي نصّ غير فارغ يصير true،
     *    بما فيه "false". والعكس أخطر: من يرسل 0 أو "" يُلغي
     *    مهمة الاستيقاظ فيصير المنبه قابلاً للإسكات بضغطة.
     */
    data: {
      userId,
      time,
      days: clean,
      requireProof: v.optionalBool(requireProof, 'مهمة الاستيقاظ', true),
    },
  });

  res.status(201).json({ success: true, alarm });
});

export const updateAlarm = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { time, days, isActive, requireProof } = req.body ?? {};

  const alarm = await prisma.battleAlarm.findFirst({
    where: { id, userId: req.user.userId },
    select: { id: true },
  });

  if (!alarm) throw notFound('المنبه غير موجود');

  const data = {};

  if (time !== undefined) {
    if (!alarmService.isValidTime(time)) throw badRequest('صيغة وقت غير صالحة');
    data.time = time;
  }

  if (days !== undefined) {
    const clean = validDays(days);
    if (clean.length === 0) throw badRequest('أيام غير صالحة');
    data.days = clean;
  }

  if (isActive !== undefined) {
    data.isActive = v.optionalBool(isActive, 'التفعيل', true);
  }
  if (requireProof !== undefined) {
    data.requireProof = v.optionalBool(requireProof, 'مهمة الاستيقاظ', true);
  }

  if (Object.keys(data).length === 0) throw badRequest('لا يوجد ما يُحدَّث');

  const updated = await prisma.battleAlarm.update({ where: { id }, data });

  res.json({ success: true, alarm: updated });
});

export const deleteAlarm = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const alarm = await prisma.battleAlarm.findFirst({
    where: { id, userId: req.user.userId },
    select: { id: true },
  });

  if (!alarm) throw notFound('المنبه غير موجود');

  await prisma.battleAlarm.delete({ where: { id } });

  res.json({ success: true, message: 'حُذف المنبه' });
});

//////////////////////////////////////////////////////
// الرنين والاستيقاظ
//////////////////////////////////////////////////////

/**
 * التطبيق يستدعيه حين يرنّ المنبه.
 * السؤال يُولَّد في الخادم — لا يمكن قراءته من الكود المحلي.
 */
export const getWakeTask = asyncHandler(async (req, res) => {
  const { question, answer } = alarmService.generateWakeTask();

  res.json({
    success: true,
    task: { question, token: signTask(answer) },
    snoozeAllowed: ALARM.SNOOZE_ALLOWED,
    graceMinutes: ALARM.GRACE_MINUTES,
    message: 'حل المسألة لإيقاف المنبه',
  });
});

/**
 * ════════════════════════════════════════════════════════════
 *  المنبه الذكي (رؤية «بال») — غفوة + إثبات عشوائي + تسجيل
 * ════════════════════════════════════════════════════════════
 */

/**
 * 1) غفوة → نداء AI حقيقي (باسم الرفيق) → رسالة صوتية تُقرأ في التطبيق
 *
 * ⚠️ لا يوجد أي نص وهمي هنا: الرسالة تأتي من Gemini حصراً.
 *    لو الـ AI غير متاح → خطأ صريح (502) — التطبيق يعرف يتعامل
 *    (يستخدم المسألة الحسابية المحلية من mobile-alarm).
 */
export const snoozeAlarm = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { count = 1, alarmId } = req.body ?? {};

  // ═══ P2: منع الضغط المزدوج (double-tap) — نداء AI واحد لكل غفوة ═══
  const locked = await tryLockSnooze(userId, alarmId);
  if (!locked) {
    return res.status(429).json({
      success: false,
      code: 'SNOOZE_IN_PROGRESS',
      message: 'الغفوة قيد المعالجة — ثانية واحدة',
    });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true, companionName: true, timezone: true },
  });

  const snoozeCount = Math.max(1, Number(count) || 1);

  // بناء سياق اليوم الحقيقي للمستخدم (أول مهمة + ستريك)
  let todayContext = '';
  try {
    const [task, wake] = await Promise.all([
      prisma.task.findFirst({
        where: { userId, isCompleted: false },
        orderBy: { startTime: 'asc' },
        select: { title: true, startTime: true },
      }),
      prisma.user.findUnique({ where: { id: userId }, select: { currentStreak: true } }),
    ]);
    todayContext = [
      task ? `أول مهمة اليوم: «${task.title}»${task.startTime ? ` الساعة ${task.startTime}` : ''}` : 'لا مهام مجدولة اليوم',
      `سلسلة الأيام: ${wake?.currentStreak ?? 0}`,
    ].join(' · ');
  } catch { /* السياق إضافي — لا يكسر النداء */ }

  // ═══ نداء Gemini الحقيقي — إجباري لا اختياري ═══
  const companion = user?.companionName || 'رفيقك';
  const username = user?.username || 'يا بطل';
  const system = `أنت «${companion}» — الرفيق الساخر المحفّز في تطبيق «بال». تخاطب «${username}». ردّك صوتي يُقرأ بصوت عالٍ — قصير جداً (سطر أو سطران)، بنبرة مصرية ساخرة وداعمة تحفّز على القيام فوراً. ممنوع اللوم القاسي.`;

  const prompt = `المستخدم ضغط «غفوة» المنبه للمرة رقم ${snoozeCount}. السياق: ${todayContext}. حفّزه بكوميديا خفيفة ليقوم الآن.`;

  let ai;
  try {
    ai = await generate(system, [], prompt, { maxTokens: 200, temperature: 0.95 });
  } catch (e) {
    // خطأ صريح — لا فولباك وهمي: التطبيق يتعامل (مسألة محلية)
    return res.status(502).json({
      success: false,
      code: e.code === 'GEMINI_QUOTA' ? 'GEMINI_QUOTA' : 'AI_UNAVAILABLE',
      message: 'الرفيق غير متاح الآن — حلّ المسألة الحسابية لإيقاف المنبه',
      offlineFallback: 'MATH', // التطبيق يعرض المسألة المحلية من mobile-alarm
    });
  }

  const text = ai?.text?.trim();
  if (!text) {
    return res.status(502).json({
      success: false,
      code: 'AI_EMPTY_RESPONSE',
      message: 'الرفيق لم يرد — حلّ المسألة الحسابية لإيقاف المنبه',
      offlineFallback: 'MATH',
    });
  }

  return res.json({
    success: true,
    snoozeCount,
    message: text,          // نص الـ AI — يُقرأ صوتياً في التطبيق (TTS)
    canStop: false,         // المنبه لا يقف بالغفوة أبداً
  });
});

/** 2) طلب إثبات الاستيقاظ — السيرفر يختار عشوائياً (مسألة أو تصوير) */
export const requestWakeProof = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { alarmId, scheduledTime } = req.body ?? {};

  if (!alarmService.isValidTime(scheduledTime)) {
    throw badRequest('scheduledTime مطلوب بصيغة HH:mm');
  }

  // اختيار عشوائي — العميل لا يحدد (قرار المالك)
  const pick = Math.random() < 0.5 ? 'MATH' : 'PHOTO';

  if (pick === 'MATH') {
    const { question, answer } = alarmService.generateWakeTask();
    return res.json({
      success: true,
      proofType: 'MATH',
      question,
      token: signTask(answer), // توقيع HMAC — مثل getWakeTask بالضبط
      alarmId: alarmId ?? null,
      scheduledTime,
    });
  }

  // التصوير: نطلب تأكيد الصورة (الفرونت يرفع صورة — نتحقق من الإضاءة لاحقاً بالـ AI)
  const proofId = crypto.randomUUID();
  return res.json({
    success: true,
    proofType: 'PHOTO',
    proofId,
    instructions: 'صوّر كوب ماء أو مكتبك في الضوء لإثبات استيقاظك',
    alarmId: alarmId ?? null,
    scheduledTime,
  });
});

/** 3) تأكيد التصوير → تسجيل استيقاظ (مسار PHOTO) */
export const confirmPhotoProof = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { alarmId, scheduledTime, responseSec, isDark } = req.body ?? {};

  if (!alarmService.isValidTime(scheduledTime)) {
    throw badRequest('scheduledTime مطلوب بصيغة HH:mm');
  }

  // الصورة مظلمة = تحايل → يُرفض
  if (isDark === true) {
    return res.status(400).json({
      success: false,
      code: 'DARK_PHOTO',
      message: 'الصورة مظلمة — ولّع النور وصوّر المكتب صح',
    });
  }

  const result = await alarmService.recordWake(userId, {
    alarmId: alarmId ?? null,
    scheduledTime,
    responseSec: Number(responseSec) || null,
  });

  return res.json({ success: true, ...result });
});

export const solveWakeTask = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { token, answer, alarmId, scheduledTime, responseSec } = req.body ?? {};

  if (!alarmService.isValidTime(scheduledTime)) {
    throw badRequest('scheduledTime مطلوب بصيغة HH:mm');
  }

  const payload = verifyTask(token);
  if (!payload) throw badRequest('token غير صالح أو مُعدَّل', 'INVALID_TOKEN');

  // مهلة 5 دقائق للمسألة — بعدها اطلب جديدة
  if (Date.now() - payload.t > 5 * 60_000) {
    throw badRequest('انتهت مهلة المسألة — اطلب واحدة جديدة', 'TASK_EXPIRED');
  }

  if (Number(answer) !== payload.a) {
    return res.status(400).json({
      success: false,
      correct: false,
      code: 'WRONG_ANSWER',
      message: 'إجابة خاطئة — حاول مرة أخرى',
    });
  }

  // المنبه إن أُرسل يجب أن يكون للمستخدم نفسه
  if (alarmId) {
    const owned = await prisma.battleAlarm.findFirst({
      where: { id: alarmId, userId },
      select: { id: true },
    });
    if (!owned) throw notFound('المنبه غير موجود');
  }

  const result = await alarmService.recordWake(userId, {
    alarmId,
    scheduledTime,
    responseSec,
  });

  res.json({ success: true, correct: true, ...result });
});

export const reportMissed = asyncHandler(async (req, res) => {
  const { alarmId, scheduledTime } = req.body ?? {};

  if (!alarmService.isValidTime(scheduledTime)) {
    throw badRequest('scheduledTime مطلوب بصيغة HH:mm');
  }

  const result = await alarmService.recordMissed(req.user.userId, {
    alarmId,
    scheduledTime,
  });

  res.json({ success: true, ...result });
});

//////////////////////////////////////////////////////
// السجل
//////////////////////////////////////////////////////

export const getWakeHistory = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const limit = Math.min(Number(req.query.limit) || 30, 90);

  const [logs, alarms] = await Promise.all([
    prisma.wakeLog.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
      take: limit,
    }),
    prisma.battleAlarm.findMany({
      where: { userId },
      select: { wakeStreak: true, longestWakeStreak: true },
    }),
  ]);

  const woke = logs.filter((l) => l.result === 'WOKE').length;

  res.json({
    success: true,
    stats: {
      total: logs.length,
      woke,
      missed: logs.length - woke,
      successRate: logs.length > 0 ? Math.round((woke / logs.length) * 100) : 0,
      currentStreak: alarms.length > 0 ? Math.max(...alarms.map((a) => a.wakeStreak)) : 0,
      longestStreak:
        alarms.length > 0 ? Math.max(...alarms.map((a) => a.longestWakeStreak)) : 0,
      avgResponseSec: (() => {
        const withTime = logs.filter((l) => l.responseSec != null);
        return withTime.length > 0
          ? Math.round(
              withTime.reduce((s, l) => s + l.responseSec, 0) / withTime.length,
            )
          : null;
      })(),
    },
    logs,
  });
});

//////////////////////////////////////////////////////
// تحدي الاستيقاظ الجماعي
//////////////////////////////////////////////////////

export const listChallenges = asyncHandler(async (req, res) => {
  const userId = req.user.userId;

  // تسوية المنتهية عند الفتح — لا حاجة لمجدول
  await alarmService.settleExpiredChallenges();

  const memberships = await prisma.clanMember.findMany({
    where: { userId },
    select: { clanId: true },
  });

  const challenges = await prisma.wakeChallenge.findMany({
    where: { clanId: { in: memberships.map((m) => m.clanId) } },
    include: {
      clan: { select: { id: true, name: true, type: true } },
      participants: {
        include: {
          user: { select: { id: true, username: true, profileImage: true } },
        },
        orderBy: { successDays: 'desc' },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  res.json({
    success: true,
    challenges: challenges.map((c) => ({
      id: c.id,
      title: c.title,
      clan: c.clan,
      targetTime: c.targetTime,
      durationDays: c.durationDays,
      startDate: c.startDate,
      endDate: c.endDate,
      status: c.status,
      rewardSparks: c.rewardSparks,
      maxMisses: ALARM.CHALLENGE_MAX_MISSES,
      isHost: c.hostId === userId,
      joined: c.participants.some((p) => p.userId === userId),
      participants: c.participants.map((p) => ({
        ...p.user,
        successDays: p.successDays,
        missedDays: p.missedDays,
        isEliminated: p.isEliminated,
      })),
    })),
  });
});

export const createChallenge = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const {
    clanId,
    title,
    challengeType = 'COORDINATED_WAKE',
    targetTime,
    targetHours,
    durationDays,
    durationHours = 24,
    rewardSparks,
  } = req.body ?? {};

  const member = await prisma.clanMember.findUnique({
    where: { userId_clanId: { userId, clanId } },
    select: { id: true },
  });

  if (!member) throw forbidden('أنت لست عضواً في هذه العشيرة');

  const clan = await prisma.clan.findUnique({
    where: { id: clanId },
    select: { type: true, leaderId: true },
  });

  if (clan.type === 'GLOBAL') {
    throw forbidden('التحديات للعشائر الخاصة فقط', 'GLOBAL_CLAN_NO_CHALLENGES');
  }

  if (clan.leaderId !== userId) {
    throw forbidden('المالك فقط ينشئ التحديات', 'NOT_CLAN_OWNER');
  }

  const active = await prisma.wakeChallenge.findFirst({
    where: { clanId, status: 'ACTIVE' },
    select: { id: true },
  });

  if (active) throw conflict('يوجد تحدٍّ نشط بالفعل', 'CHALLENGE_ACTIVE');

  let cleanTargetTime = null;
  let targetMinutes = null;

  if (challengeType === 'COORDINATED_WAKE') {
    if (!targetTime || !alarmService.isValidTime(targetTime)) {
      throw badRequest('صيغة وقت الاستيقاظ يجب أن تكون HH:mm (مثل 05:00)');
    }
    cleanTargetTime = targetTime;
  } else if (challengeType === 'FOCUS_MARATHON') {
    const hours = Number(targetHours) || 5;
    targetMinutes = Math.min(Math.max(hours * 60, 60), 1440); // 1-24 hours
  }

  const days = Number.isInteger(durationDays)
    ? Math.min(Math.max(durationDays, 1), 30)
    : 7;

  const start = new Date(new Date().toISOString().slice(0, 10));
  const end = new Date(start);
  end.setDate(end.getDate() + days - 1);

  const challenge = await prisma.$transaction(async (tx) => {
    const created = await tx.wakeChallenge.create({
      data: {
        clanId,
        hostId: userId,
        challengeType,
        title:
          v.optionalString(title, 'عنوان التحدي', { max: 100 }) ??
          (challengeType === 'FOCUS_MARATHON'
            ? `ماراثون تركيز ${(targetMinutes / 60).toFixed(0)} ساعات`
            : `تحدي الاستيقاظ الجماعي ${cleanTargetTime}`),
        targetTime: cleanTargetTime,
        targetMinutes,
        durationDays: days,
        durationHours: Number(durationHours) || 24,
        startDate: start,
        endDate: end,
        rewardSparks: Number(rewardSparks) || ALARM.CHALLENGE_REWARD_SPARKS,
      },
    });

    await tx.wakeChallengeParticipant.create({
      data: { challengeId: created.id, userId },
    });

    // لو كان تحدي استيقاظ: نضبط منبه القائد فوراً
    if (challengeType === 'COORDINATED_WAKE' && cleanTargetTime) {
      await tx.battleAlarm.upsert({
        where: { userId_time: { userId, time: cleanTargetTime } },
        update: { isActive: true },
        create: {
          userId,
          time: cleanTargetTime,
          days: [0, 1, 2, 3, 4, 5, 6],
          isActive: true,
        },
      });
    }

    return created;
  });

  res.status(201).json({
    success: true,
    challenge,
    message: `تم إنشاء التحدي بنجاح: ${challenge.title}`,
  });
});

export const joinChallenge = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { id } = req.params;

  const challenge = await prisma.wakeChallenge.findUnique({
    where: { id },
    select: { id: true, clanId: true, status: true, targetTime: true, challengeType: true },
  });

  if (!challenge) throw notFound('التحدي غير موجود');
  if (challenge.status !== 'ACTIVE') throw badRequest('انتهى التحدي');

  const member = await prisma.clanMember.findUnique({
    where: { userId_clanId: { userId, clanId: challenge.clanId } },
    select: { id: true },
  });

  if (!member) throw forbidden('أنت لست عضواً في هذه العشيرة');

  let scheduledAlarm = null;

  await prisma.$transaction(async (tx) => {
    await tx.wakeChallengeParticipant.upsert({
      where: { challengeId_userId: { challengeId: id, userId } },
      update: {},
      create: { challengeId: id, userId },
    });

    // ⏰ الجدولة التلقائية لمنبه الاستيقاظ في هاتف العضو الذي وافق
    if (challenge.challengeType === 'COORDINATED_WAKE' && challenge.targetTime) {
      scheduledAlarm = await tx.battleAlarm.upsert({
        where: { userId_time: { userId, time: challenge.targetTime } },
        update: { isActive: true },
        create: {
          userId,
          time: challenge.targetTime,
          days: [0, 1, 2, 3, 4, 5, 6],
          isActive: true,
        },
      });
    }
  });

  res.json({
    success: true,
    message: challenge.targetTime
      ? `قبلت التحدي! تم ضبط منبه هاتفك تلقائياً على ${challenge.targetTime} ⏰`
      : 'انضممت لتحدي التركيز بنجاح ',
    scheduledAlarm,
  });
});

export const getScoreboard = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await alarmService.getChallengeScoreboard(id);
  res.json({ success: true, ...result });
});

export const leaveChallenge = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const { count } = await prisma.wakeChallengeParticipant.deleteMany({
    where: { challengeId: id, userId: req.user.userId },
  });

  if (count === 0) throw notFound('أنت لست في هذا التحدي');

  res.json({ success: true, message: 'غادرت التحدي' });
});
