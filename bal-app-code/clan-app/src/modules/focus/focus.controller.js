import prisma from '../../config/prisma.js';
import { FOCUS_CHECK, LIMITS, PULSE } from '../../config/constants.js';
import * as achievementService from '../../services/achievement.service.js';
import * as focusCheckService from '../../services/focusCheck.service.js';
import { getPulseState } from '../../services/pulse.service.js';
import * as sparksService from '../../services/sparks.service.js';
import * as streakService from '../../services/streak.service.js';
import * as analyticsService from '../../services/analytics.service.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { badRequest, conflict, notFound } from '../../utils/AppError.js';

/**
 * ════════════════════════════════════════════════════════════
 *  محرك التركيز
 * ════════════════════════════════════════════════════════════
 *
 * القاعدة الحاكمة: الخادم لا يصدّق العميل.
 * العميل يبلّغ بمدة، والخادم يحسبها بنفسه ويأخذ الأصغر.
 */

const MIN_SESSION = 5;
const MAX_SESSION = 240;

/** المدة المنقضية فعلياً بالدقائق */
const elapsedMinutes = (startedAt, now = new Date()) =>
  Math.floor((now - new Date(startedAt)) / 60_000);

/**
 * التحقق من المدة — قلب الحماية ضد الغش.
 *
 * ثلاثة سقوف:
 *   1. ما أبلغ عنه العميل (قد يكون عمل أوفلاين)
 *   2. الزمن المنقضي فعلياً منذ البدء
 *   3. المدة المخططة عند البدء
 *
 * نأخذ الأصغر. لا يمكن لأحد أن يدّعي 10 ساعات في جلسة 30 دقيقة.
 */
const verifyDuration = (session, clientReportedMin) => {
  const elapsed = elapsedMinutes(session.startedAt);
  const reported = Number.isFinite(clientReportedMin)
    ? Math.max(0, Math.floor(clientReportedMin))
    : elapsed;

  // ═══ الدورة المخصصة: السقف = التركيز الفعلي (totalFocusMin) لا الزمن الكلي ═══
  // الراحة مش تركيز — لا تُحتسب في الدقائق المعتمدة ولا في الشرارات
  const cap = session.totalFocusMin ?? session.plannedMin;

  // +1 دقيقة تسامح لفروق الساعات بين الجهاز والخادم
  return Math.max(0, Math.min(reported, elapsed + 1, cap));
};

//////////////////////////////////////////////////////
// بدء جلسة
//////////////////////////////////////////////////////

export const startSession = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const {
    plannedMin,
    taskId,
    strictMode = false,
    type = 'SOLO',
    /** مدة فترة التركيز الواحدة — يحددها مالك الغرفة في الجلسات الجماعية */
    focusBlockMin,
    audioTrackId,
    audioTitle,
    /** ═══ الدورة المخصصة (رؤية «بال») ═══ */
    focusMin,   // مدة كل فترة تركيز
    restMin,    // مدة الراحة بين الدورات (1-10 صارم)
    cycles,     // عدد الدورات
  } = req.body ?? {};

  // ═══ دورة مخصصة: (تركيز + راحة) × تكرار، وآخر دورة = لوبي بلا راحة ═══
  let sessionMinutes = Number(plannedMin);
  let sessionTotalFocus = null;
  let sessionRest = null;
  let sessionCycles = null;
  let cycleTable = null;

  if (restMin !== undefined || cycles !== undefined || focusMin !== undefined) {
    const fMin = Number(focusMin);
    const rMin = Number(restMin);
    const cNum = Number(cycles);

    if (!Number.isInteger(fMin) || fMin < 5 || fMin > 120) {
      throw badRequest('مدة التركيز يجب أن تكون بين 5 و 120 دقيقة');
    }
    // 🔴 قيد صارم (رؤية المالك): الراحة ممنوع تتجاوز 10 دقائق — السيرفر يرفض
    if (!Number.isInteger(rMin) || rMin < 1 || rMin > 10) {
      throw badRequest('الراحة يجب أن تكون من 1 إلى 10 دقائق — ممنوع أكثر (قيد صارم)');
    }
    if (!Number.isInteger(cNum) || cNum < 1 || cNum > 8) {
      throw badRequest('عدد الدورات يجب أن يكون بين 1 و 8');
    }

    sessionTotalFocus = fMin * cNum;                       // التركيز الفعلي فقط
    sessionMinutes = sessionTotalFocus + rMin * (cNum - 1); // آخر دورة بلا راحة (لوبي)
    sessionRest = rMin;
    sessionCycles = cNum;

    // جدول الدورة للواجهة
    cycleTable = [];
    for (let i = 0; i < cNum; i++) {
      cycleTable.push({
        cycle: i + 1,
        phase: i === cNum - 1 ? 'FOCUS_END_LOBBY' : 'FOCUS',
        focusMin: fMin,
        restMin: i === cNum - 1 ? 0 : rMin,
      });
    }
  }

  const minutes = Number(sessionMinutes);
  if (!Number.isInteger(minutes) || minutes < MIN_SESSION || minutes > MAX_SESSION) {
    throw badRequest(
      `مدة الجلسة يجب أن تكون بين ${MIN_SESSION} و ${MAX_SESSION} دقيقة`,
    );
  }

  if (!['SOLO', 'PULSE'].includes(type)) {
    throw badRequest('نوع الجلسة غير صالح');
  }

  // جلسة واحدة في المرة — منع التلاعب بتشغيل عدة جلسات
  const active = await prisma.focusSession.findFirst({
    where: { userId, status: 'ACTIVE' },
    select: { id: true, startedAt: true, plannedMin: true },
  });

  if (active) {
    throw conflict('لديك جلسة نشطة بالفعل', 'SESSION_ALREADY_ACTIVE');
  }

  // المهمة يجب أن تخص المستخدم نفسه
  if (taskId) {
    const task = await prisma.task.findFirst({
      where: { id: taskId, userId },
      select: { id: true },
    });
    if (!task) throw notFound('المهمة غير موجودة');
  }

  // جلسة النبض تُربط بالدورة الحالية
  let pulseSessionId = null;
  if (type === 'PULSE') {
    const state = getPulseState();
    const pulse = await prisma.pulseSession.upsert({
      where: { startTime: state.cycleStart },
      update: {},
      create: { startTime: state.cycleStart, endTime: state.nextCycleStart },
    });
    pulseSessionId = pulse.id;
  }

  const session = await prisma.focusSession.create({
    data: {
      userId,
      type,
      plannedMin: minutes,
      strictMode: Boolean(strictMode),
      taskId: taskId ?? null,
      pulseSessionId,
      audioTrackId: audioTrackId ?? null,
      audioTitle: audioTitle ? String(audioTitle).slice(0, 120) : null,
      restMin: sessionRest,
      cycles: sessionCycles,
      totalFocusMin: sessionTotalFocus,
    },
  });

  /**
   * اختبار كشف ساهٍ واحد لكل فترة تركيز.
   *
   * جلسة فردية بسيطة = فترة واحدة ⇒ اختبار واحد.
   * جلسة النبض = فترات 30 دقيقة ⇒ اختبار لكل فترة.
   * غرفة المالك = ما يحدده هو (25 · 50 ...) ⇒ اختبار لكل فترة.
   */
  const blockMin =
    type === 'PULSE'
      ? PULSE.FOCUS_BLOCK_MIN
      : Number.isInteger(focusBlockMin) && focusBlockMin > 0
        ? focusBlockMin
        : minutes;

  const checkSchedule = focusCheckService.generateSchedule(minutes, blockMin);

  res.status(201).json({
    success: true,
    session: {
      id: session.id,
      type: session.type,
      plannedMin: session.plannedMin,
      strictMode: session.strictMode,
      startedAt: session.startedAt,
      endsAt: new Date(session.startedAt.getTime() + minutes * 60_000),
      taskId: session.taskId,
    },
    /** الدقائق التي سيظهر فيها اختبار — واحد لكل فترة تركيز، عشوائي */
    focusCheckSchedule: checkSchedule,
    focusBlockMin: blockMin,
    /** الدورة المخصصة — جدول (تركيز/راحة/لوبي) للواجهة */
    ...(cycleTable
      ? {
          cycle: {
            focusMin: Number(focusMin),
            restMin: sessionRest,
            cycles: sessionCycles,
            totalFocusMin: sessionTotalFocus,
            totalMin: sessionMinutes,
            table: cycleTable,
          },
        }
      : {}),
  });
});

//////////////////////////////////////////////////////
// إنهاء جلسة
//////////////////////////////////////////////////////

export const completeSession = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { id } = req.params;
  const { clientReportedMin, wasOffline = false } = req.body ?? {};

  const session = await prisma.focusSession.findFirst({
    where: { id, userId },
  });

  if (!session) throw notFound('الجلسة غير موجودة');
  if (session.status !== 'ACTIVE') {
    throw conflict('الجلسة منتهية بالفعل', 'SESSION_NOT_ACTIVE');
  }

  // اختبارات لم يُجب عنها ومهلتها انتهت = فشل
  await focusCheckService.expireStale(id);

  const verifiedMin = verifyDuration(session, clientReportedMin);

  // ═══ الدورة المخصصة: الشرارات من التركيز الفعلي (totalFocusMin) لا من الزمن الكلي ═══
  const sparkMin = session.totalFocusMin ?? verifiedMin;
  const sparks = sparksService.calcFocusSparks(sparkMin, session.type);

  // معاملة واحدة: الجلسة والإحصائيات والشرارات معاً مع تحديث مشروط ذرّي
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.focusSession.updateMany({
      where: { id, userId, status: 'ACTIVE' },
      data: {
        status: 'COMPLETED',
        endedAt: new Date(),
        clientReportedMin: clientReportedMin ?? null,
        serverVerifiedMin: verifiedMin,
        earnedSparks: sparks,
        wasOffline: Boolean(wasOffline),
      },
    });

    if (updated.count === 0) {
      throw conflict('الجلسة منتهية بالفعل', 'SESSION_NOT_ACTIVE');
    }

    await tx.user.update({
      where: { id: userId },
      data: { totalFocusMin: { increment: verifiedMin } },
    });

    const awarded =
      sparks > 0
        ? await sparksService.award(userId, {
            source: 'FOCUS_SESSION',
            baseAmount: sparks,
            refId: id,
            tx,
          })
        : { amount: 0 };

    // تسجيل الحضور في النبض
    if (session.pulseSessionId) {
      await tx.pulseReservation.updateMany({
        where: { userId, pulseSessionId: session.pulseSessionId },
        data: { attended: true, attendedAt: new Date() },
      });
    }

    const streak = await streakService.touch(userId, { tx });

    return { updated, awarded, streak };
  });

  // خارج المعاملة: فشل الأوسمة يجب ألا يُفشل الجلسة
  const unlocked = await achievementService.evaluateSafe(
    userId,
    'FOCUS',
    'STREAK',
    ...(session.pulseSessionId ? ['TRIBE'] : []),
  );

  await analyticsService.invalidateAnalytics(userId);

  res.json({
    success: true,
    message: 'أحسنت! جلسة مكتملة',
    session: {
      id,
      verifiedMin,
      earnedSparks: sparks,
      type: session.type,
      totalFocusMin: session.totalFocusMin ?? null,
      cycles: session.cycles ?? null,
      restMin: session.restMin ?? null,
    },
    sparks: {
      earned: sparks,
      balance: result.awarded.balance,
    },
    streak: result.streak,
    unlockedAchievements: unlocked,
  });
});

//////////////////////////////////////////////////////
// إلغاء جلسة
//////////////////////////////////////////////////////

export const cancelSession = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { id } = req.params;

  const session = await prisma.focusSession.findFirst({
    where: { id, userId },
    select: { id: true, status: true, startedAt: true },
  });

  if (!session) throw notFound('الجلسة غير موجودة');
  if (session.status !== 'ACTIVE') {
    throw conflict('الجلسة منتهية بالفعل', 'SESSION_NOT_ACTIVE');
  }

  const updated = await prisma.focusSession.updateMany({
    where: { id, userId, status: 'ACTIVE' },
    data: {
      status: 'CANCELLED',
      endedAt: new Date(),
      serverVerifiedMin: 0,
      earnedSparks: 0,
    },
  });

  if (updated.count === 0) {
    throw conflict('الجلسة منتهية بالفعل', 'SESSION_NOT_ACTIVE');
  }

  res.json({
    success: true,
    message: 'تم إلغاء الجلسة',
    // لا شرارات على الإلغاء
    sparksEarned: 0,
  });
});

//////////////////////////////////////////////////////
// تسجيل خرق الوضع الصارم
//////////////////////////////////////////////////////

/**
 * يستدعيه التطبيق عند خروج المستخدم من الشاشة.
 * بعد 3 مرات تفشل الجلسة بلا شرارات.
 */
export const reportViolation = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { id } = req.params;

  const session = await prisma.focusSession.findFirst({
    where: { id, userId },
    select: { id: true, status: true, strictMode: true, violations: true },
  });

  if (!session) throw notFound('الجلسة غير موجودة');
  if (session.status !== 'ACTIVE') {
    throw conflict('الجلسة منتهية بالفعل', 'SESSION_NOT_ACTIVE');
  }

  // الوضع العادي: نسجّل بلا عقوبة
  if (!session.strictMode) {
    const updated = await prisma.focusSession.update({
      where: { id },
      data: { violations: { increment: 1 } },
      select: { violations: true },
    });
    return res.json({
      success: true,
      violations: updated.violations,
      failed: false,
      remaining: null,
    });
  }

  const violations = session.violations + 1;
  const failed = violations >= LIMITS.STRICT_MODE_MAX_VIOLATIONS;

  await prisma.focusSession.update({
    where: { id },
    data: {
      violations,
      ...(failed
        ? { status: 'FAILED', endedAt: new Date(), earnedSparks: 0 }
        : {}),
    },
  });

  res.json({
    success: true,
    violations,
    failed,
    remaining: Math.max(0, LIMITS.STRICT_MODE_MAX_VIOLATIONS - violations),
    message: failed
      ? 'فشلت الجلسة — خرجت من التطبيق كثيراً'
      : `تحذير ${violations}/${LIMITS.STRICT_MODE_MAX_VIOLATIONS}`,
  });
});

//////////////////////////////////////////////////////
// الجلسة النشطة
//////////////////////////////////////////////////////

export const getActiveSession = asyncHandler(async (req, res) => {
  const session = await prisma.focusSession.findFirst({
    where: { userId: req.user.userId, status: 'ACTIVE' },
    include: { task: { select: { id: true, title: true } } },
  });

  if (!session) {
    return res.json({ success: true, session: null });
  }

  const elapsed = elapsedMinutes(session.startedAt);

  // ═══ الطور الحالي للدورة المخصصة (تركيز / راحة) — رؤية «بال» ═══
  let phase = null;
  if (session.cycles && session.restMin && session.totalFocusMin) {
    const fMin = Math.round(session.totalFocusMin / session.cycles);
    const rMin = session.restMin;
    const cycleLen = fMin + rMin;
    const totalNoFinalRest = session.cycles * cycleLen - rMin; // آخر دورة بلا راحة = لوبي
    const pos = elapsed % totalNoFinalRest;
    const cycleIdx = Math.min(Math.floor(pos / cycleLen), session.cycles - 1);
    const inCycle = pos - cycleIdx * cycleLen;
    const isLastCycle = cycleIdx === session.cycles - 1;

    if (isLastCycle || inCycle < fMin) {
      phase = { name: 'FOCUS', cycle: cycleIdx + 1, remainingMin: fMin - inCycle };
    } else {
      phase = { name: 'REST', cycle: cycleIdx + 1, remainingMin: cycleLen - inCycle };
    }
  }

  res.json({
    success: true,
    session: {
      id: session.id,
      type: session.type,
      plannedMin: session.plannedMin,
      elapsedMin: elapsed,
      remainingMin: Math.max(0, session.plannedMin - elapsed),
      strictMode: session.strictMode,
      violations: session.violations,
      startedAt: session.startedAt,
      taskId: session.taskId,
      task: session.task,
      audioTrackId: session.audioTrackId ?? null,
      audioTitle: session.audioTitle ?? null,
      /** انقضت المدة ولم تُنهَ بعد */
      isOvertime: elapsed >= session.plannedMin,
      /** الدورة المخصصة — الطور الحالي */
      cycle: session.cycles
        ? {
            focusMin: Math.round(session.totalFocusMin / session.cycles),
            restMin: session.restMin,
            cycles: session.cycles,
            phase: phase?.name ?? 'FOCUS',
            cycleNumber: phase?.cycle ?? 1,
            phaseRemainingMin: phase?.remainingMin ?? null,
          }
        : null,
    },
  });
});

//////////////////////////////////////////////////////
// السجل والإحصائيات
//////////////////////////////////////////////////////

export const getHistory = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const page = Math.max(Number(req.query.page) || 1, 1);

  const [sessions, total] = await Promise.all([
    prisma.focusSession.findMany({
      where: { userId, status: { in: ['COMPLETED', 'FAILED', 'CANCELLED'] } },
      include: { task: { select: { id: true, title: true } } },
      orderBy: { startedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.focusSession.count({ where: { userId } }),
  ]);

  res.json({ success: true, page, limit, total, sessions });
});

export const getStats = asyncHandler(async (req, res) => {
  const userId = req.user.userId;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      totalFocusMin: true,
      sparksBalance: true,
      totalSparksEarned: true,
      timezone: true,
    },
  });

  const todayStart = streakService.startOfLocalDay(user.timezone);

  const [today, completed, streak] = await Promise.all([
    prisma.focusSession.aggregate({
      where: { userId, status: 'COMPLETED', startedAt: { gte: todayStart } },
      _sum: { serverVerifiedMin: true, earnedSparks: true },
      _count: true,
    }),
    prisma.focusSession.count({ where: { userId, status: 'COMPLETED' } }),
    streakService.getStatus(userId),
  ]);

  res.json({
    success: true,
    stats: {
      totalFocusMin: user.totalFocusMin,
      totalSessions: completed,
      today: {
        focusMin: today._sum.serverVerifiedMin ?? 0,
        sparks: today._sum.earnedSparks ?? 0,
        sessions: today._count,
      },
      sparks: {
        balance: user.sparksBalance,
        totalEarned: user.totalSparksEarned,
      },
      streak,
    },
  });
});

//////////////////////////////////////////////////////
// كشف الساهي
//////////////////////////////////////////////////////

/**
 * طلب اختبار جديد — يستدعيه العميل عند بلوغ دقيقة مجدولة.
 * المواعيد أُرسلت في رد /start وهي عشوائية لكل جلسة.
 */
export const requestCheck = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { id } = req.params;

  const session = await prisma.focusSession.findFirst({
    where: { id, userId, status: 'ACTIVE' },
    select: { id: true, startedAt: true },
  });

  if (!session) throw notFound('لا توجد جلسة نشطة بهذا المعرّف');

  const atMinute = elapsedMinutes(session.startedAt);
  const check = await focusCheckService.createCheck(id, userId, atMinute);

  res.json({
    success: true,
    check: {
      id: check.id,
      question: check.question,
      timeoutMs: FOCUS_CHECK.TIMEOUT_MS,
    },
  });
});

/** إرسال الإجابة */
export const answerCheck = asyncHandler(async (req, res) => {
  const { checkId } = req.params;
  const { answer } = req.body ?? {};

  if (answer === undefined || answer === null) {
    throw badRequest('الإجابة مطلوبة');
  }

  const result = await focusCheckService.submitAnswer(
    checkId,
    req.user.userId,
    answer,
  );

  if (!result) throw notFound('الاختبار غير موجود');

  if (result.alreadyAnswered) {
    throw conflict('تمت الإجابة على هذا الاختبار', 'ALREADY_ANSWERED');
  }

  res.json({
    success: true,
    correct: result.correct,
    result: result.result,
    responseMs: result.responseMs,
    tooSlow: result.tooSlow,
    message:
      result.result === 'PASSED'
        ? 'ممتاز — أنت مركّز '
        : result.tooSlow
          ? 'تأخرت في الرد'
          : 'إجابة خاطئة',
  });
});

/** استخدام رصيد طوارئ — مكالمة مهمة مثلاً */
export const useEmergency = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.userId;

  const session = await prisma.focusSession.findFirst({
    where: { id, userId, status: 'ACTIVE' },
    select: { id: true },
  });

  if (!session) throw notFound('لا توجد جلسة نشطة');

  const result = await focusCheckService.useEmergency(userId, id);

  if (!result.allowed) {
    return res.status(429).json({
      success: false,
      message: result.message,
      code: 'EMERGENCY_EXHAUSTED',
      remaining: 0,
    });
  }

  res.json({
    success: true,
    message: 'مهلة طوارئ مفعّلة — لن تُحتسب ساهياً',
    remaining: result.remaining,
    graceMs: result.graceMs,
  });
});

/** رصيد الطوارئ المتبقي اليوم */
export const getEmergencyStatus = asyncHandler(async (req, res) => {
  const status = await focusCheckService.getEmergencyStatus(req.user.userId);
  res.json({ success: true, emergency: status });
});
