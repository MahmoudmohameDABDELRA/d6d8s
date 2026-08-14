/**
 * ═══════════════════════════════════════════════════════════
 *  التحدي الجماعي للتركيز — رؤية «بال»
 *
 *  صاحب العشيرة الخاصة (الأدمن) ينشئ تحدي تركيز:
 *    → إشعار لكل الأعضاء (قبول / تأجيل)
 *    → المقبولون يدخلون غرفة الانتظار
 *    → الأدمن يضغط «دخول» → الجميع يدخلون جلسة تركيز بالدورة المخصصة
 *
 *  القواعد الصارمة:
 *    - restMin بين 1 و 10 (ممنوع أكثر — السيرفر يرفض)
 *    - الخروج مسموح قبل بدء الجلسة فقط
 *    - بعد الدخول: ممنوع الخروج (التركيز مقدس)
 * ═══════════════════════════════════════════════════════════
 */
import prisma from '../../config/prisma.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { badRequest, conflict, forbidden, notFound } from '../../utils/AppError.js';
import { scoped } from '../../config/logger.js';
import { LIMITS } from '../../config/constants.js';

const log = scoped('focus-challenge');

/** هل المستخدم مالك (أدمن) العشيرة؟ */
const assertHost = async (clanId, userId) => {
  const clan = await prisma.clan.findUnique({
    where: { id: clanId },
    select: { leaderId: true, type: true },
  });
  if (!clan) throw notFound('العشيرة غير موجودة');
  if (clan.type !== 'PRIVATE') {
    throw badRequest('التحديات في العشائر الخاصة فقط');
  }
  if (clan.leaderId !== userId) {
    throw forbidden('أنت لست صاحب هذه العشيرة', 'NOT_CLAN_HOST');
  }
  return clan;
};

/** إشعار لكل أعضاء العشيرة */
const notifyClanMembers = async (clanId, excludeUserId, { title, body, data = {} }) => {
  const members = await prisma.clanMember.findMany({
    where: { clanId, userId: { not: excludeUserId } },
    select: { userId: true },
  });
  await prisma.notification.createMany({
    data: members.map((m) => ({
      userId: m.userId,
      type: 'FOCUS_CHALLENGE',
      title,
      body,
      data,
    })),
  });
  return members.length;
};

/**
 * 1) إنشاء تحدي — صاحب العشيرة فقط
 * POST /api/focus/challenge  { clanId, title, focusMin, restMin, cycles }
 */
export const createChallenge = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { clanId, title, focusMin, restMin, cycles } = req.body ?? {};

  if (!clanId) throw badRequest('العشيرة مطلوبة');
  const clan = await assertHost(clanId, userId);

  const titleTxt = String(title ?? '').trim();
  if (!titleTxt) throw badRequest('عنوان التحدي مطلوب');
  if (titleTxt.length > 100) throw badRequest('العنوان طويل — 100 حرف كحد أقصى');

  const fMin = Number(focusMin);
  const rMin = Number(restMin);
  const cNum = Number(cycles);

  if (!Number.isInteger(fMin) || fMin < 5 || fMin > 120) {
    throw badRequest('مدة التركيز يجب أن تكون بين 5 و 120 دقيقة');
  }
  // 🔴 قيد صارم (رؤية المالك): الراحة ≤ 10
  if (!Number.isInteger(rMin) || rMin < 1 || rMin > 10) {
    throw badRequest('الراحة يجب أن تكون من 1 إلى 10 دقائق — ممنوع أكثر');
  }
  if (!Number.isInteger(cNum) || cNum < 1 || cNum > 8) {
    throw badRequest('عدد الدورات يجب أن يكون بين 1 و 8');
  }

  // تحقق: لا يوجد تحدي WAITING/ACTIVE لنفس العشيرة
  const existing = await prisma.focusChallenge.findFirst({
    where: { clanId, status: { in: ['WAITING', 'ACTIVE'] } },
    select: { id: true },
  });
  if (existing) {
    throw conflict('يوجد تحدي نشط لهذه العشيرة بالفعل', 'CHALLENGE_ALREADY_ACTIVE');
  }

  const challenge = await prisma.focusChallenge.create({
    data: {
      clanId,
      hostId: userId,
      title: titleTxt,
      focusMin: fMin,
      restMin: rMin,
      cycles: cNum,
    },
  });

  // إشعار للأعضاء: قبول / تأجيل
  const hostUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true },
  });
  const totalMin = fMin * cNum + rMin * (cNum - 1);
  const notified = await notifyClanMembers(clanId, userId, {
    title: 'تحدي تركيز جديد',
    body: `${hostUser?.username ?? 'صاحب العشيرة'} عمل تحدي: «${titleTxt}» — ${fMin}د تركيز × ${cNum} دورات (راحة ${rMin}د) — إجمالي ${totalMin}د`,
    data: { challengeId: challenge.id, action: 'FOCUS_CHALLENGE' },
  });

  log.info({ challengeId: challenge.id, clanId, notified }, 'تحدي تركيز جديد');

  res.status(201).json({
    success: true,
    message: 'التحدي اتطلق — إشعارات وصلت للأعضاء',
    challenge: {
      id: challenge.id,
      title: challenge.title,
      focusMin: challenge.focusMin,
      restMin: challenge.restMin,
      cycles: challenge.cycles,
      totalMin,
      status: challenge.status,
      notifiedMembers: notified,
    },
  });
});

/** حالة التحدي + المشاركون */
export const getChallenge = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const challenge = await prisma.focusChallenge.findUnique({
    where: { id },
    include: {
      host: { select: { id: true, username: true, profileImage: true } },
      participants: {
        include: { user: { select: { id: true, username: true, profileImage: true } } },
      },
    },
  });
  if (!challenge) throw notFound('التحدي غير موجود');

  res.json({
    success: true,
    challenge: {
      id: challenge.id,
      title: challenge.title,
      host: challenge.host,
      focusMin: challenge.focusMin,
      restMin: challenge.restMin,
      cycles: challenge.cycles,
      status: challenge.status,
      startedAt: challenge.startedAt,
      waiting: challenge.participants.filter((p) => p.status === 'ACCEPTED').map((p) => p.user),
      active: challenge.participants.filter((p) => p.status === 'ACTIVE').map((p) => p.user),
      count: challenge.participants.length,
    },
  });
});

/** 2) قبول التحدي → غرفة الانتظار */
export const acceptChallenge = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { id } = req.params;

  const challenge = await prisma.focusChallenge.findUnique({
    where: { id },
    select: { id: true, clanId: true, status: true },
  });
  if (!challenge) throw notFound('التحدي غير موجود');
  if (challenge.status !== 'WAITING') {
    throw conflict('التحدي بدأ بالفعل', 'CHALLENGE_STARTED');
  }

  // عضو في العشيرة؟
  const member = await prisma.clanMember.findUnique({
    where: { userId_clanId: { userId, clanId: challenge.clanId } },
    select: { id: true },
  });
  if (!member) throw forbidden('أنت لست عضواً في هذه العشيرة');

  await prisma.focusChallengeParticipant.upsert({
    where: { challengeId_userId: { challengeId: id, userId } },
    update: { status: 'ACCEPTED' },
    create: { challengeId: id, userId, status: 'ACCEPTED' },
  });

  res.json({ success: true, message: 'انضممت لغرفة الانتظار — بانتظار انطلاق الجلسة' });
});

/** 3) تأجيل التحدي */
export const declineChallenge = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { id } = req.params;

  const challenge = await prisma.focusChallenge.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!challenge) throw notFound('التحدي غير موجود');

  await prisma.focusChallengeParticipant.upsert({
    where: { challengeId_userId: { challengeId: id, userId } },
    update: { status: 'DECLINED' },
    create: { challengeId: id, userId, status: 'DECLINED' },
  });

  res.json({ success: true, message: 'تم التأجيل' });
});

/** 4) مغادرة التحدي — مسموح قبل البدء فقط */
export const leaveChallenge = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { id } = req.params;

  const challenge = await prisma.focusChallenge.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!challenge) throw notFound('التحدي غير موجود');

  if (challenge.status !== 'WAITING') {
    throw conflict('الجلسة بدأت — ممنوع الخروج الآن (التركيز مقدس)', 'CANT_LEAVE_AFTER_START');
  }

  await prisma.focusChallengeParticipant.updateMany({
    where: { challengeId: id, userId },
    data: { status: 'LEFT' },
  });

  res.json({ success: true, message: 'خرجت من التحدي' });
});

/**
 * 5) انطلاق الجلسة — صاحب التحدي فقط
 * ينشئ جلسة تركيز لكل مشارك بالدورة المخصصة (نفس focusMin/restMin/cycles)
 */
export const startChallenge = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { id } = req.params;

  const challenge = await prisma.focusChallenge.findUnique({
    where: { id },
    include: { participants: { where: { status: 'ACCEPTED' }, select: { userId: true } } },
  });
  if (!challenge) throw notFound('التحدي غير موجود');
  if (challenge.hostId !== userId) {
    throw forbidden('أنت لست صاحب التحدي', 'NOT_CHALLENGE_HOST');
  }
  if (challenge.status !== 'WAITING') {
    throw conflict('التحدي بدأ بالفعل', 'CHALLENGE_STARTED');
  }

  const accepters = challenge.participants.map((p) => p.userId);
  if (accepters.length < 1) {
    throw badRequest('لا يوجد مشاركون بعد');
  }

  // كل مشارك (بما فيهم صاحب التحدي) يدخل جلسة بالدورة المخصصة
  const totalFocus = challenge.focusMin * challenge.cycles;
  const plannedMin = totalFocus + challenge.restMin * (challenge.cycles - 1);

  const sessions = [];
  await prisma.$transaction(async (tx) => {
    for (const pid of [challenge.hostId, ...accepters]) {
      // منع جلسة نشطة مسبقاً
      const active = await tx.focusSession.findFirst({
        where: { userId: pid, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!active) {
        const s = await tx.focusSession.create({
          data: {
            userId: pid,
            type: 'CHALLENGE',
            plannedMin,
            restMin: challenge.restMin,
            cycles: challenge.cycles,
            totalFocusMin: totalFocus,
            strictMode: true,
          },
        });
        sessions.push(s);
      }
    }
    await tx.focusChallenge.update({ where: { id }, data: { status: 'ACTIVE', startedAt: new Date() } });
    await tx.focusChallengeParticipant.updateMany({
      where: { challengeId: id, status: 'ACCEPTED' },
      data: { status: 'ACTIVE' },
    });
  });

  res.json({
    success: true,
    message: 'انطلق التحدي — الجميع في جلسة التركيز',
    sessionCount: sessions.length,
    cycle: {
      focusMin: challenge.focusMin,
      restMin: challenge.restMin,
      cycles: challenge.cycles,
      totalFocusMin: totalFocus,
      plannedMin,
    },
  });
});
