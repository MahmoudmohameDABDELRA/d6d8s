import crypto from 'node:crypto';
import prisma from '../../config/prisma.js';
import { REFERRAL } from '../../config/constants.js';
import * as sparksService from '../../services/sparks.service.js';
import * as userCache from '../../services/userCache.service.js';
import * as notificationService from '../../services/notification.service.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { badRequest, conflict, forbidden, notFound } from '../../utils/AppError.js';
import { scoped } from '../../config/logger.js';

const log = scoped('referral');

/**
 * ════════════════════════════════════════════════════════════
 *  نظام الإحالة المتدرج ومكافآت الاشتراكات المدفوعة
 * ════════════════════════════════════════════════════════════
 *
 *  المستويان الهندسيان:
 *
 *   ١. المستوى الأول: مكافأة التسجيل المجاني العادي:
 *      - الداعي: +25 شرارة + تحرير مساحة صوتية محلية جديدة في جهازه (+1 Slot).
 *      - المنضم: +25 شرارة ترحيبية.
 *
 *   ٢. المستوى الثاني: المكافآت الكبرى عند اشتراك الصديق في باقة مدفوعة:
 *      - الداعي: +150 شرارة كبرى في المحفظة.
 *      - +20 رسالة ذكاء اصطناعي إضافية (AI Token Expansion).
 *      - وسام سفير العشيرة الذهبي عند وصول 5 أصدقاء لباقات مدفوعة.
 */

/** توليد كود إحالة فريد وسهل المشاركة */
const generateCodeForUser = (username) => {
  const clean = (username || 'CLAN')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 5);
  const suffix = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `${clean || 'CLAN'}-${suffix}`;
};

//////////////////////////////////////////////////////
// 1. إحصائيات وكود الإحالة الخاص بي (My Referral Stats)
//////////////////////////////////////////////////////

export const getMyReferralStats = asyncHandler(async (req, res) => {
  const userId = req.user.userId;

  let user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      referralCode: true,
      referralCount: true,
      bonusAiMessages: true,
      sparksBalance: true,
      unlockedAudioSlots: true,
      createdAt: true,
    },
  });

  if (!user) throw notFound('المستخدم غير موجود');

  // توليد كود فريد تلقائياً إن لم يكن موجوداً
  if (!user.referralCode) {
    let candidate = generateCodeForUser(user.username);
    for (let i = 0; i < 5; i++) {
      const exists = await prisma.user.findUnique({ where: { referralCode: candidate } });
      if (!exists) break;
      candidate = generateCodeForUser(user.username);
    }

    user = await prisma.user.update({
      where: { id: userId },
      data: { referralCode: candidate },
      select: {
        id: true,
        username: true,
        referralCode: true,
        referralCount: true,
        bonusAiMessages: true,
        sparksBalance: true,
        unlockedAudioSlots: true,
        createdAt: true,
      },
    });
  }

  // جلب قائمة الأصدقاء وحالة اشتراكاتهم
  const referrals = await prisma.referral.findMany({
    where: { referrerId: userId },
    include: {
      referred: {
        select: {
          id: true,
          username: true,
          profileImage: true,
          domain: true,
          createdAt: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });

  const totalFriends = user.referralCount || 0;
  const paidConversions = referrals.filter((r) => r.status === 'COMPLETED' && r.sparksAwarded >= REFERRAL.PAID_CONVERSION_SPARKS).length;

  res.json({
    success: true,
    referralCode: user.referralCode,
    shareUrl: `https://clanapp.com/join?ref=${user.referralCode}`,
    shareMessage: `انضم لعشيرتي في تطبيق Clan App وركّز معي لنكسب شرارات ونفتح مكتبات الصوت والدوبامين  كود الدعوة: ${user.referralCode}`,
    stats: {
      totalRegisteredFriends: totalFriends,
      paidSubscriptionFriends: paidConversions,
      bonusAiMessages: user.bonusAiMessages || 0,
      unlockedAudioSlots: user.unlockedAudioSlots,
      sparksBalance: user.sparksBalance,
    },
    rewardsSystem: {
      freeSignup: {
        referrerSparks: REFERRAL.FREE_SIGNUP_REFERRER_SPARKS,
        referredSparks: REFERRAL.FREE_SIGNUP_REFERRED_SPARKS,
        perk: 'تحرير مساحة صوتية محلية مجانية بالهاتف (+1 Audio Slot)',
      },
      paidSubscriptionBonus: {
        referrerSparks: REFERRAL.PAID_CONVERSION_SPARKS,
        bonusAiMessages: REFERRAL.PAID_CONVERSION_AI_MESSAGES,
        perk: 'المكافأة الكبرى: 150 شرارة و 20 رسالة AI عند اشتراك الصديق في أي باقة مدفوعة',
      },
    },
    milestones: [
      {
        target: 1,
        title: 'تحرير مساحة صوتية محلية في هاتفك (+1 Audio Slot)',
        isReached: totalFriends >= 1,
        unlocked: totalFriends >= 1,
      },
      {
        target: REFERRAL.MILESTONE_PAID_BADGE_COUNT,
        title: 'وسام سفير العشيرة الذهبي + 500 شرارة بونص (عند اشتراك 5 أصدقاء في باقات)',
        isReached: paidConversions >= REFERRAL.MILESTONE_PAID_BADGE_COUNT,
        progress: Math.min(paidConversions, REFERRAL.MILESTONE_PAID_BADGE_COUNT),
      },
    ],
    recentFriends: referrals.map((r) => ({
      id: r.id,
      friend: r.referred,
      status: r.status,
      sparksAwarded: r.sparksAwarded,
      joinedAt: r.createdAt,
    })),
  });
});

//////////////////////////////////////////////////////
// 2. تطبيق كود دعوة صديق (المستوى الأول: التسجيل المجاني)
//////////////////////////////////////////////////////

export const applyReferralCode = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const rawCode = req.body?.code ?? req.body?.referralCode;

  if (!rawCode || !String(rawCode).trim()) {
    throw badRequest('كود الدعوة مطلوب');
  }

  const cleanCode = String(rawCode).trim().toUpperCase();

  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, referredById: true },
  });

  if (!currentUser) throw notFound('المستخدم غير موجود');

  // حماية 1: منع استخدام كود إحالة مرتين
  if (currentUser.referredById) {
    throw conflict('لقد استخدمت كود إحالة من قبل بالفعل', 'ALREADY_REFERRED');
  }

  const existingReferral = await prisma.referral.findUnique({
    where: { referredUserId: userId },
  });
  if (existingReferral) {
    throw conflict('لقد حصلت على مكافأة التسجيل مسبقاً', 'ALREADY_REFERRED');
  }

  // البحث عن صاحب الكود
  const referrer = await prisma.user.findUnique({
    where: { referralCode: cleanCode },
    select: { id: true, username: true, referralCount: true, unlockedAudioSlots: true },
  });

  if (!referrer) {
    throw notFound('كود الدعوة غير صحيح أو منتهي الصلاحية');
  }

  // حماية 2: منع إحالة النفس
  if (referrer.id === userId) {
    throw forbidden('لا يمكنك استخدام كود الدعوة الخاص بك', 'SELF_REFERRAL_FORBIDDEN');
  }

  // ── تنفيذ المستوى الأول ذرياً: 25 شرارة للطرفين + تحرير مساحة صوتية للداعي ──
  const result = await prisma.$transaction(async (tx) => {
    // 1. تسجيل الإحالة
    const referral = await tx.referral.create({
      data: {
        referrerId: referrer.id,
        referredUserId: userId,
        code: cleanCode,
        status: 'PENDING',
        sparksAwarded: REFERRAL.FREE_SIGNUP_REFERRER_SPARKS,
        aiMessagesAwarded: 0, // المكافآت الكبرى لرسائل الـ AI مؤجلة حتى الاشتراك المدفوع
        rewardType: 'SPARKS_AND_AI',
      },
    });

    // 2. مكافأة الداعي (Referrer): +25 شرارة + تحرير مساحة صوتية محلية مجانية (+1 Slot)
    await sparksService.award(referrer.id, {
      source: 'REFERRAL_BONUS',
      baseAmount: REFERRAL.FREE_SIGNUP_REFERRER_SPARKS,
      refId: referral.id,
      note: `مكافأة تسجيل صديقك ${currentUser.username}`,
      tx,
    });

    await tx.user.update({
      where: { id: referrer.id },
      data: {
        referralCount: { increment: 1 },
        unlockedAudioSlots: { increment: 1 }, // تحرير مساحة صوتية محلية في هاتف الداعي
      },
    });

    // 3. مكافأة المنضم (Referred User): +25 شرارة ترحيبية وربطه بالداعي
    const myAward = await sparksService.award(userId, {
      source: 'REFERRAL_BONUS',
      baseAmount: REFERRAL.FREE_SIGNUP_REFERRED_SPARKS,
      refId: referral.id,
      note: `هدية ترحيبية لانضمامك عبر كود ${referrer.username}`,
      tx,
    });

    const updatedCurrent = await tx.user.update({
      where: { id: userId },
      data: {
        referredById: referrer.id,
      },
      select: { sparksBalance: true, unlockedAudioSlots: true },
    });

    return { referral, myAward, updatedCurrent };
  });

  // إبطال الكاش لكلا الطرفين
  await Promise.all([userCache.invalidate(userId), userCache.invalidate(referrer.id)]);

  // إرسال إشعار فوري للداعي
  await notificationService.sendNotification(referrer.id, {
    type: 'ENCOURAGEMENT',
    title: ' انضم صديق جديد عبر كودك!',
    body: `مبروك! انضم ${currentUser.username} بكودك وحصلت على +25 شرارة وتم تحرير مساحة صوتية في هاتفك  وستصلك المكافأة الكبرى (+150 شرارة و 20 رسالة AI) فور اشتراكه في أي باقة مدفوعة `,
    data: { referralId: result.referral.id, friendName: currentUser.username },
  });

  log.info({ userId, referrerId: referrer.id, code: cleanCode }, 'تم تطبيق كود الإحالة المجاني بنجاح');

  res.status(200).json({
    success: true,
    message: `أهلاً بك! تم تفعيل كود صديقك ${referrer.username} وحصلت على +${REFERRAL.FREE_SIGNUP_REFERRED_SPARKS} شرارة ترحيبية `,
    rewards: {
      sparksAwarded: REFERRAL.FREE_SIGNUP_REFERRED_SPARKS,
      newBalance: result.updatedCurrent.sparksBalance,
      unlockedAudioSlots: result.updatedCurrent.unlockedAudioSlots,
    },
    referrer: {
      username: referrer.username,
    },
  });
});

//////////////////////////////////////////////////////
// 3. معالجة المكافآت الكبرى عند اشتراك الصديق في باقة مدفوعة (Paid Conversion)
//////////////////////////////////////////////////////

export const processPaidReferralConversion = async (userId, tx = null) => {
  const user = await (tx ?? prisma).user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, referredById: true },
  });

  if (!user || !user.referredById) return null;

  const referrerId = user.referredById;

  // التحقق من وجود سجل إحالة معلق
  const referral = await (tx ?? prisma).referral.findUnique({
    where: { referredUserId: userId },
  });

  if (!referral || referral.status === 'REWARDED') return null;

  // ── صرف المكافأة الكبرى للداعي ذرياً: +150 شرارة + 20 رسالة AI ──
  await sparksService.award(referrerId, {
    source: 'REFERRAL_BONUS',
    baseAmount: REFERRAL.PAID_CONVERSION_SPARKS,
    refId: referral.id,
    note: `المكافأة الكبرى: اشتراك صديقك ${user.username} في باقة مدفوعة`,
    tx,
  });

  await (tx ?? prisma).user.update({
    where: { id: referrerId },
    data: {
      bonusAiMessages: { increment: REFERRAL.PAID_CONVERSION_AI_MESSAGES },
    },
  });

  await (tx ?? prisma).referral.update({
    where: { id: referral.id },
    data: {
      status: 'REWARDED',
      sparksAwarded: REFERRAL.FREE_SIGNUP_REFERRER_SPARKS + REFERRAL.PAID_CONVERSION_SPARKS,
      aiMessagesAwarded: REFERRAL.PAID_CONVERSION_AI_MESSAGES,
    },
  });

  await userCache.invalidate(referrerId);

  // إرسال إشعار فوري للداعي
  await notificationService.sendNotification(referrerId, {
    type: 'ENCOURAGEMENT',
    title: ' مبروك! حصلت على المكافأة الكبرى!',
    body: `صديقك ${user.username} اشترك في باقة مدفوعة! تمت إضافة +150 شرارة و +20 رسالة AI إضافية لحسابك `,
    data: { referralId: referral.id },
  });

  log.info({ referrerId, paidUserId: userId }, 'تم صرف المكافأة الكبرى للاشتراك المدفوع بنجاح');

  return { referrerId, sparksAwarded: REFERRAL.PAID_CONVERSION_SPARKS, aiMessages: REFERRAL.PAID_CONVERSION_AI_MESSAGES };
};

export default {
  getMyReferralStats,
  applyReferralCode,
  processPaidReferralConversion,
};
