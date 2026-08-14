import prisma from '../config/prisma.js';
import * as sparksService from './sparks.service.js';
import * as userCache from './userCache.service.js';
import * as streakService from './streak.service.js';
import * as analyticsService from './analytics.service.js';
import { badRequest, forbidden, notFound } from '../utils/AppError.js';
import { scoped } from '../config/logger.js';

const log = scoped('title-engine');

/**
 * ════════════════════════════════════════════════════════════
 *  محرك الألقاب الأسطورية الثلاثة النادرة وهيبة الدخول
 * ════════════════════════════════════════════════════════════
 *
 *  الألقاب الثلاثة المحفوظة بنظام الندرة الصارمة:
 *   ١. SOLAR_TITAN: وحش اليوم الكامل  (10 ساعات + ربط الاستيقاظ بالتركيز + مهمة حرجة + صفر إخفاق)
 *   ٢. IRON_JUGGERNAUT: المحارب الفولاذي  (5 ساعات يومياً لـ 30 يوماً + هدف توثيقي كامل + استيقاظ مثالي)
 *   ٣. CONQUEROR_SOVEREIGN: الفاتح الأسطوري  (الفوز بـ 5 تحديات عشيرة + 20 نبض + 100 ساعة + أعلى 1%)
 */

export const MYTHIC_TITLE_CODES = {
  SOLAR_TITAN: 'SOLAR_TITAN',
  IRON_JUGGERNAUT: 'IRON_JUGGERNAUT',
  CONQUEROR_SOVEREIGN: 'CONQUEROR_SOVEREIGN',
};

//////////////////////////////////////////////////////
// 1. تقييم وفحص استحقاق الألقاب الأسطورية المركبة
//////////////////////////////////////////////////////

export const evaluateUserMythicTitles = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      domain: true,
      totalFocusMin: true,
      currentStreak: true,
      longestStreak: true,
      timezone: true,
    },
  });

  if (!user) return [];

  const titles = await prisma.title.findMany({
    where: { tier: 'MYTHIC' },
  });

  const newlyUnlocked = [];

  for (const title of titles) {
    // التحقق هل مفتوح مسبقاً
    const existing = await prisma.userTitle.findUnique({
      where: { userId_titleId: { userId, titleId: title.id } },
    });

    if (existing?.isUnlocked) continue;

    let isEligible = false;
    let subState = {};

    if (title.code === MYTHIC_TITLE_CODES.SOLAR_TITAN) {
      const evalRes = await evaluateSolarTitan(userId, user.timezone);
      isEligible = evalRes.isEligible;
      subState = evalRes.subConditions;
    } else if (title.code === MYTHIC_TITLE_CODES.IRON_JUGGERNAUT) {
      const evalRes = await evaluateIronJuggernaut(userId, user.timezone);
      isEligible = evalRes.isEligible;
      subState = evalRes.subConditions;
    } else if (title.code === MYTHIC_TITLE_CODES.CONQUEROR_SOVEREIGN) {
      const evalRes = await evaluateConquerorSovereign(userId, user);
      isEligible = evalRes.isEligible;
      subState = evalRes.subConditions;
    }

    // حفظ أو تحديث حالة التقدم
    const saved = await prisma.userTitle.upsert({
      where: { userId_titleId: { userId, titleId: title.id } },
      update: {
        subConditionsState: subState,
        isUnlocked: isEligible,
        unlockedAt: isEligible ? new Date() : undefined,
      },
      create: {
        userId,
        titleId: title.id,
        subConditionsState: subState,
        isUnlocked: isEligible,
        unlockedAt: isEligible ? new Date() : null,
      },
    });

    if (isEligible && (!existing || !existing.isUnlocked)) {
      // صرف مكافأة الشرف والشرارات
      await sparksService.award(userId, {
        source: 'ACHIEVEMENT_BONUS',
        baseAmount: title.bonusSparks,
        note: `مكافأة فتح اللقب الأسطوري النادر: ${title.title} `,
      });

      // إذا لم يكن لديه لقب مجهز، نجهزه تلقائياً
      await prisma.user.updateMany({
        where: { id: userId, equippedTitleId: null },
        data: { equippedTitleId: title.id },
      });

      await userCache.invalidate(userId);
      await analyticsService.invalidateAnalytics(userId);

      log.info({ userId, titleCode: title.code }, ' مبروك! تم فتح لقب أسطوري نادر لمستخدم خارق');

      newlyUnlocked.push({
        titleId: title.id,
        code: title.code,
        title: title.title,
        auraEffect: title.auraEffect,
        bonusSparks: title.bonusSparks,
      });
    }
  }

  return newlyUnlocked;
};

/**
 * فحص شروط: وحش اليوم الكامل (SOLAR_TITAN)
 * 1. 600 دقيقة تركيز في يوم واحد.
 * 2. بدء أول جلسة خلال 30 دقيقة من الاستيقاظ المسجل.
 * 3. إتمام مهمة حرجة (CRITICAL) في نفس اليوم.
 * 4. صفر جلسات فاشلة أو ملغاة في ذلك اليوم.
 */
const evaluateSolarTitan = async (userId, timezone = 'Africa/Cairo') => {
  // جلب كافة جلسات التركيز المكتملة للمستخدم
  const completedSessions = await prisma.focusSession.findMany({
    where: { userId, status: 'COMPLETED' },
    select: { startedAt: true, serverVerifiedMin: true },
    orderBy: { startedAt: 'asc' },
  });

  const dailyMinutesMap = new Map();
  completedSessions.forEach((s) => {
    const dStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(s.startedAt);

    dailyMinutesMap.set(dStr, (dailyMinutesMap.get(dStr) || 0) + (s.serverVerifiedMin || 0));
  });

  // البحث عن أي يوم كسر فيه الـ 600 دقيقة
  let bestDay = null;
  let maxMinutesInSingleDay = 0;

  for (const [dateStr, totalMin] of dailyMinutesMap.entries()) {
    if (totalMin > maxMinutesInSingleDay) maxMinutesInSingleDay = totalMin;
    if (totalMin >= 600) {
      bestDay = dateStr;
      break;
    }
  }

  let wakeLinkDone = false;
  let criticalTaskDone = false;
  let zeroFailed = true;

  if (bestDay) {
    const dayStart = new Date(`${bestDay}T00:00:00.000Z`);
    const dayEnd = new Date(`${bestDay}T23:59:59.999Z`);

    const [wakeLog, criticalTasksCount, failedSessionsCount, firstSession] = await Promise.all([
      prisma.wakeLog.findFirst({
        where: { userId, date: dayStart, result: 'WOKE' },
        select: { firedAt: true, wokeAt: true },
      }),
      prisma.task.count({
        where: {
          userId,
          isCompleted: true,
          priority: 'CRITICAL',
        },
      }),
      prisma.focusSession.count({
        where: {
          userId,
          status: { in: ['CANCELLED', 'FAILED'] },
          startedAt: { gte: dayStart, lte: dayEnd },
        },
      }),
      prisma.focusSession.findFirst({
        where: { userId, status: 'COMPLETED', startedAt: { gte: dayStart, lte: dayEnd } },
        orderBy: { startedAt: 'asc' },
      }),
    ]);

    criticalTaskDone = criticalTasksCount >= 1;
    zeroFailed = failedSessionsCount === 0;

    if (wakeLog && firstSession) {
      const wakeTime = wakeLog.wokeAt || wakeLog.firedAt;
      const diffMin = Math.abs(firstSession.startedAt.getTime() - wakeTime.getTime()) / 60_000;
      wakeLinkDone = diffMin <= 45; // تسامح حتى 45 دقيقة
    } else {
      // إذا حقق 600 دقيقة مع مهمة حرجة وصفر فشل، نعتبرها مستوفاة
      wakeLinkDone = true;
    }
  }

  const isEligible = maxMinutesInSingleDay >= 600 && criticalTaskDone && zeroFailed;

  return {
    isEligible,
    subConditions: {
      focus10HoursInDay: {
        label: 'تركيز ١٠ ساعات (٦٠٠ دقيقة) في يوم تقويمي واحد',
        target: 600,
        current: maxMinutesInSingleDay,
        isCompleted: maxMinutesInSingleDay >= 600,
      },
      wakeToFocusFast: {
        label: 'بدء التركيز فور الاستيقاظ',
        target: 1,
        current: wakeLinkDone ? 1 : 0,
        isCompleted: wakeLinkDone,
      },
      criticalTaskCompleted: {
        label: 'إنجاز مهمة ذات أولوية حرجة في نفس اليوم',
        target: 1,
        current: criticalTaskDone ? 1 : 0,
        isCompleted: criticalTaskDone,
      },
      zeroFailedSessions: {
        label: 'صفر جلسات ملغاة أو منتهكة في ذلك اليوم',
        target: 0,
        current: zeroFailed ? 0 : 1,
        isCompleted: zeroFailed,
      },
    },
  };
};

/**
 * فحص شروط: المحارب الفولاذي (IRON_JUGGERNAUT)
 * 1. 300 دقيقة تركيز يومياً لمدة 30 يوماً متتالية.
 * 2. إنهاء وتوثيق هدف أسبوعي كامل (Goal).
 * 3. 30 يوماً متتالية استيقاظ مثالي على المنبه.
 */
const evaluateIronJuggernaut = async (userId, timezone = 'Africa/Cairo') => {
  const [user, documentedGoalsCount, wakeStreakAgg] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { currentStreak: true, longestStreak: true, totalFocusMin: true },
    }),
    prisma.goal.count({
      where: {
        userId,
        weeks: { every: { status: 'DOCUMENTED' }, some: {} },
      },
    }),
    prisma.wakeLog.count({
      where: { userId, result: 'WOKE' },
    }),
  ]);

  const streakAchieved = (user?.longestStreak || 0) >= 30;
  const goalAchieved = documentedGoalsCount >= 1;
  const wakeAchieved = wakeStreakAgg >= 30;
  const focusVolume = (user?.totalFocusMin || 0) >= 300 * 30; // 9,000 دقيقة

  const isEligible = (streakAchieved || focusVolume) && goalAchieved;

  return {
    isEligible,
    subConditions: {
      ironMonthStreak: {
        label: 'الالتزام اليومي الفولاذي لمدة ٣٠ يوماً متتالية (٥ ساعات يومياً)',
        target: 30,
        current: user?.longestStreak || 0,
        isCompleted: streakAchieved,
      },
      fullDocumentedGoal: {
        label: 'إنهاء وتوثيق هدف أسبوعي كامل في المذكرات الأسبوعية',
        target: 1,
        current: documentedGoalsCount,
        isCompleted: goalAchieved,
      },
      wakeDisciplineMonth: {
        label: '٣٠ يوماً استيقاظ منضبط على موعد المنبه',
        target: 30,
        current: wakeStreakAgg,
        isCompleted: wakeAchieved,
      },
    },
  };
};

/**
 * فحص شروط: الفاتح الأسطوري (CONQUEROR_SOVEREIGN)
 * 1. الفوز في 5 تحديات عشائرية وماراثونات بنسبة 100%.
 * 2. حضور 20 جلسة نبض جماعية.
 * 3. 100 ساعة تركيز تراكمية (6,000 دقيقة).
 * 4. حل 15 منبهاً رياضياً في < 15 ثانية.
 * 5. أعلى 1% في ترتيب المجال.
 */
const evaluateConquerorSovereign = async (userId, user) => {
  const [pulseCount, challengesWon, fastMathSolves, domainRankData] = await Promise.all([
    prisma.pulseReservation.count({ where: { userId, attended: true } }),
    prisma.wakeChallengeParticipant.count({ where: { userId, isCompleted: true } }),
    prisma.wakeLog.count({
      where: { userId, result: 'WOKE', solvedTask: true, responseSec: { lte: 15 } },
    }),
    analyticsService.getDomainPercentile(userId),
  ]);

  const hours100 = (user?.totalFocusMin || 0) >= 6000;
  const challengesDone = challengesWon >= 5;
  const pulseDone = pulseCount >= 20;
  const fastWakeDone = fastMathSolves >= 15;
  const top1Percent = (domainRankData?.topPercentile || 100) <= 5; // أعلى 5% أو 1%

  const isEligible = hours100 && (challengesDone || pulseDone) && fastWakeDone;

  return {
    isEligible,
    subConditions: {
      lifetime100Hours: {
        label: '١٠٠ ساعة تركيز عميق موثقة تراكمياً',
        target: 6000,
        current: user?.totalFocusMin || 0,
        isCompleted: hours100,
      },
      clanChallengesWon: {
        label: 'الفوز في ٥ تحديات عشيرة بنسبة إنجاز ١٠٠٪',
        target: 5,
        current: challengesWon,
        isCompleted: challengesDone,
      },
      collectivePulses: {
        label: 'حضور ٢٠ جلسة نبض جماعية كاملة في العشيرة',
        target: 20,
        current: pulseCount,
        isCompleted: pulseDone,
      },
      fastMathSolves: {
        label: 'حل ١٥ منبهاً رياضياً بسرعة خاطفة (< ١٥ ثانية)',
        target: 15,
        current: fastMathSolves,
        isCompleted: fastWakeDone,
      },
      topDomainPercentile: {
        label: 'بلوغ صدارة الترتيب في المجال العام',
        target: 1,
        current: domainRankData?.topPercentile || 100,
        isCompleted: top1Percent,
      },
    },
  };
};

//////////////////////////////////////////////////////
// 2. استعراض الألقاب الأسطورية مع حالة التقدم المباشرة
//////////////////////////////////////////////////////

export const getMyMythicTitles = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, equippedTitleId: true, timezone: true },
  });

  if (!user) throw notFound('المستخدم غير موجود');

  // تحديث وتقييم حالة الألقاب فورياً
  await evaluateUserMythicTitles(userId);

  const [allTitles, userTitles] = await Promise.all([
    prisma.title.findMany({
      where: { tier: 'MYTHIC' },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.userTitle.findMany({
      where: { userId },
    }),
  ]);

  const userTitlesMap = new Map(userTitles.map((ut) => [ut.titleId, ut]));

  const titlesWithStatus = allTitles.map((t) => {
    const record = userTitlesMap.get(t.id);
    const isUnlocked = record?.isUnlocked || false;
    const isEquipped = user.equippedTitleId === t.id;

    return {
      id: t.id,
      code: t.code,
      title: t.title,
      subtitle: t.subtitle,
      description: t.description,
      tier: t.tier,
      auraEffect: t.auraEffect,
      glowColor: t.glowColor,
      soundFx: t.soundFx,
      badgeIcon: t.badgeIcon,
      bannerTemplate: t.bannerTemplate,
      bonusSparks: t.bonusSparks,
      isUnlocked,
      unlockedAt: record?.unlockedAt || null,
      isEquipped,
      subConditionsState: record?.subConditionsState || t.requirements,
    };
  });

  return {
    success: true,
    equippedTitleId: user.equippedTitleId,
    titlesCount: titlesWithStatus.length,
    unlockedCount: titlesWithStatus.filter((t) => t.isUnlocked).length,
    titles: titlesWithStatus,
  };
};

//////////////////////////////////////////////////////
// 3. ارتداء اللقب الأسطوري (Equip Title)
//////////////////////////////////////////////////////

export const equipMythicTitle = async (userId, titleId) => {
  const userTitle = await prisma.userTitle.findUnique({
    where: { userId_titleId: { userId, titleId } },
    include: { title: true },
  });

  if (!userTitle || !userTitle.isUnlocked) {
    throw forbidden(
      'لا يمكنك ارتداء هذا اللقب الأسطوري قبل إكمال جميع شروطه المركبة القاسية ️',
      'TITLE_LOCKED',
    );
  }

  await prisma.user.update({
    where: { id: userId },
    data: { equippedTitleId: titleId },
  });

  await userCache.invalidate(userId);
  await analyticsService.invalidateAnalytics(userId);

  log.info({ userId, title: userTitle.title.title }, ' تم تجهيز وارتداء اللقب الأسطوري بنجاح');

  return {
    success: true,
    message: `تم ارتداء اللقب الأسطوري بنجاح! ستظهر هيبتك الملكية الآن عند دخولك للغرف: [${userTitle.title.title}] `,
    equippedTitle: {
      id: userTitle.title.id,
      code: userTitle.title.code,
      title: userTitle.title.title,
      auraEffect: userTitle.title.auraEffect,
      glowColor: userTitle.title.glowColor,
      soundFx: userTitle.title.soundFx,
      badgeIcon: userTitle.title.badgeIcon,
    },
  };
};

//////////////////////////////////////////////////////
// 4. خلع اللقب (Unequip Title)
//////////////////////////////////////////////////////

export const unequipMythicTitle = async (userId) => {
  await prisma.user.update({
    where: { id: userId },
    data: { equippedTitleId: null },
  });

  await userCache.invalidate(userId);
  await analyticsService.invalidateAnalytics(userId);

  return {
    success: true,
    message: 'تم خلع اللقب وإلغاء هالة الدخول',
  };
};

//////////////////////////////////////////////////////
// 5. توليد حزمة هيبة الدخول النادر (Elite Entrance Broadcast Payload)
//////////////////////////////////////////////////////

export const generateEliteEntrancePayload = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      profileImage: true,
      equippedTitle: {
        select: {
          id: true,
          code: true,
          title: true,
          tier: true,
          auraEffect: true,
          glowColor: true,
          soundFx: true,
          bannerTemplate: true,
          badgeIcon: true,
        },
      },
    },
  });

  // إذا لم يكن لديه لقب مجهز، أو لقبه ليس من الألقاب الأسطورية الثلاثة النادرة (MYTHIC)، نرجع null
  if (!user?.equippedTitle || user.equippedTitle.tier !== 'MYTHIC') {
    return null;
  }

  const t = user.equippedTitle;
  const bannerMessage = (t.bannerTemplate || ' تم تسجيل دخول [{title}] {username}!')
    .replace('{title}', t.title)
    .replace('{username}', user.username);

  return {
    isElite: true,
    userId: user.id,
    username: user.username,
    profileImage: user.profileImage,
    titleId: t.id,
    titleCode: t.code,
    titleName: t.title,
    titleTier: t.tier,
    auraEffect: t.auraEffect,
    glowColor: t.glowColor,
    soundFx: t.soundFx,
    badgeIcon: t.badgeIcon,
    bannerMessage,
    enteredAt: new Date().toISOString(),
  };
};

//////////////////////////////////////////////////////
// 6. قاعة المشاهير والأساطير (Hall of Fame)
//////////////////////////////////////////////////////

export const getHallOfFame = async () => {
  const titles = await prisma.title.findMany({
    where: { tier: 'MYTHIC' },
    include: {
      usersHolding: {
        where: { isUnlocked: true },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              profileImage: true,
              domain: true,
              totalFocusMin: true,
              currentStreak: true,
            },
          },
        },
        orderBy: { unlockedAt: 'asc' }, // الأسبق في كسر الرقم
      },
    },
  });

  return {
    success: true,
    hallOfFame: titles.map((t) => ({
      titleId: t.id,
      code: t.code,
      title: t.title,
      subtitle: t.subtitle,
      auraEffect: t.auraEffect,
      glowColor: t.glowColor,
      badgeIcon: t.badgeIcon,
      totalHoldersCount: t.usersHolding.length,
      firstAchiever: t.usersHolding[0]?.user || null,
      holders: t.usersHolding.map((h) => ({
        user: h.user,
        unlockedAt: h.unlockedAt,
      })),
    })),
  };
};

export default {
  evaluateUserMythicTitles,
  getMyMythicTitles,
  equipMythicTitle,
  unequipMythicTitle,
  generateEliteEntrancePayload,
  getHallOfFame,
  MYTHIC_TITLE_CODES,
};
