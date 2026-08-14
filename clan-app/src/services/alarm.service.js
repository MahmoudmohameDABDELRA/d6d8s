import prisma from '../config/prisma.js';
import { ALARM } from '../config/constants.js';
import * as achievementService from './achievement.service.js';
import * as focusCheck from './focusCheck.service.js';
import * as sparksService from './sparks.service.js';
import * as streakService from './streak.service.js';

/**
 * ════════════════════════════════════════════════════════════
 *  منبه المعركة
 * ════════════════════════════════════════════════════════════
 *
 * ️ حقيقة تقنية أساسية:
 *    المنبه يرنّ **محلياً في التطبيق** لا من الخادم.
 *
 *    إشعار Push يحتاج إنترنت وقد يتأخر دقائق على iOS
 *    (أو أكثر مع Doze في أندرويد). منبه لا يرنّ بلا نت = منبه فاشل.
 *
 *    دور الخادم:
 *      • تخزين الإعدادات ومزامنتها بين الأجهزة
 *      • توليد مسألة الاستيقاظ (لا تُقرأ من الكود المحلي)
 *      • تسجيل الاستيقاظ وبناء السلسلة
 *      • الأوسمة والتحديات الجماعية
 */

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const isValidTime = (t) => TIME_RE.test(String(t ?? ''));

export const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** الوقت الحالي بتوقيت المستخدم — HH:mm */
export const localTimeOf = (timezone, now = new Date()) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);

/** يوم الأسبوع بتوقيت المستخدم — الأحد = 0 */
export const localWeekdayOf = (timezone, now = new Date()) => {
  const s = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
  }).format(now);

  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(s);
};

/**
 * هل الاستيقاظ ضمن النافذة المسموحة؟
 *
 * ️ التعامل مع عبور منتصف الليل:
 *    الطرح المباشر يفشل حين يعبر الوقت منتصف الليل.
 *    مثال: منبه 22:00 والساعة الآن 01:15
 *      الطرح = 75 − 1320 = −1245 دقيقة ⇒ يبدو «استيقاظاً مبكراً»
 *      والحقيقة أنه تأخر 195 دقيقة.
 *
 *    الحل: أي فرق سالب أكبر من نصف يوم يعني أن الموعد كان أمس.
 *    نضيف 24 ساعة لتصحيحه.
 *
 * الاستيقاظ المبكر الحقيقي (خلال ساعات قليلة قبل الموعد) مقبول.
 */
export const isOnTime = (scheduledTime, timezone, now = new Date()) => {
  const DAY = 24 * 60;
  const HALF = DAY / 2;

  let diff = toMinutes(localTimeOf(timezone, now)) - toMinutes(scheduledTime);

  // الموعد كان أمس والوقت الحالي بعد منتصف الليل
  if (diff < -HALF) diff += DAY;
  // الموعد اليوم والوقت الحالي قبل منتصف الليل بفارق كبير
  else if (diff > HALF) diff -= DAY;

  return {
    onTime: diff <= ALARM.GRACE_MINUTES,
    delayMin: Math.max(0, diff),
  };
};

/** مسألة الاستيقاظ — نعيد استخدام محرك كشف الساهي */
export const generateWakeTask = () => focusCheck.generateQuestion();

/**
 * هل لدى المستخدم منبه مجدول اليوم؟
 *
 * مهم للسلسلة: يوم بلا منبه مجدول (عطلة نهاية الأسبوع مثلاً)
 * لا يكسر السلسلة — يتجمّد فقط.
 */
export const hasAlarmToday = async (userId, timezone) => {
  const weekday = localWeekdayOf(timezone);

  const alarm = await prisma.battleAlarm.findFirst({
    where: { userId, isActive: true, days: { has: weekday } },
    select: { id: true },
  });

  return Boolean(alarm);
};

// ════════════════════════════════════════════════
//  تسجيل الاستيقاظ
// ════════════════════════════════════════════════

/**
 * يُستدعى حين يحلّ المستخدم المسألة ويُغلق المنبه.
 *
 * قاعدة السلسلة: **أي منبه** يرنّ في اليوم يكفي.
 * لو عندك منبه 6:00 وآخر 7:00، القيام لأحدهما يحافظ على السلسلة.
 */
export const recordWake = async (userId, { alarmId, scheduledTime, responseSec }) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });

  const today = streakService.localDate(user.timezone);
  const { onTime, delayMin } = isOnTime(scheduledTime, user.timezone);

  // سجل واحد لكل يوم — الاستيقاظ لا يتكرر
  const existing = await prisma.wakeLog.findUnique({
    where: { userId_date: { userId, date: today } },
  });

  if (existing) {
    return {
      alreadyLogged: true,
      onTime: existing.result === 'WOKE',
      message: 'سُجّل استيقاظك اليوم بالفعل',
    };
  }

  const alarm = alarmId
    ? await prisma.battleAlarm.findFirst({
        where: { id: alarmId, userId },
        select: { id: true, wakeStreak: true, longestWakeStreak: true },
      })
    : null;

  const sparks = onTime ? ALARM.WAKE_SPARKS : 0;

  const outcome = await prisma.$transaction(async (tx) => {
    await tx.wakeLog.create({
      data: {
        userId,
        alarmId: alarm?.id ?? null,
        date: today,
        scheduledTime,
        result: onTime ? 'WOKE' : 'MISSED',
        responseSec: responseSec ?? null,
        solvedTask: true,
        wokeAt: new Date(),
      },
    });

    let wakeStreak = 0;

    if (alarm) {
      wakeStreak = onTime ? alarm.wakeStreak + 1 : 0;

      await tx.battleAlarm.update({
        where: { id: alarm.id },
        data: {
          lastWokeAt: new Date(),
          wakeStreak,
          longestWakeStreak: Math.max(wakeStreak, alarm.longestWakeStreak),
        },
      });
    }

    let balance = null;
    if (sparks > 0) {
      const awarded = await sparksService.award(userId, {
        source: 'ADMIN_ADJUSTMENT',
        baseAmount: sparks,
        refId: alarm?.id ?? null,
        note: `استيقاظ في الموعد ${scheduledTime}`,
        tx,
      });
      balance = awarded.balance;
    }

    return { wakeStreak, balance };
  });

  if (onTime) await progressChallenges(userId, today);

  // الاستيقاظ نشاط يومي — يحافظ على السلسلة العامة أيضاً
  await streakService.touch(userId);

  const unlocked = await achievementService.evaluateSafe(
    userId,
    'EARLY_BIRD',
    'STREAK',
  );

  return {
    onTime,
    delayMin,
    sparks,
    balance: outcome.balance,
    wakeStreak: outcome.wakeStreak,
    unlockedAchievements: unlocked,
    message: onTime
      ? `صباح النور — استيقظت في موعدك  +${sparks} شرارة`
      : `تأخرت ${delayMin} دقيقة — لا شرارات اليوم`,
  };
};

/** فوات المنبه — ينتهي الرنين بلا استجابة */
export const recordMissed = async (userId, { alarmId, scheduledTime }) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });

  const today = streakService.localDate(user.timezone);

  const existing = await prisma.wakeLog.findUnique({
    where: { userId_date: { userId, date: today } },
  });

  if (existing) return { alreadyLogged: true };

  await prisma.$transaction(async (tx) => {
    await tx.wakeLog.create({
      data: {
        userId,
        alarmId: alarmId ?? null,
        date: today,
        scheduledTime,
        result: 'MISSED',
      },
    });

    if (alarmId) {
      await tx.battleAlarm.updateMany({
        where: { id: alarmId, userId },
        data: { wakeStreak: 0 },
      });
    }
  });

  await failChallenges(userId, today);

  return {
    recorded: true,
    wakeStreak: 0,
    message: 'فاتك المنبه — انكسرت سلسلة الاستيقاظ',
  };
};

// ════════════════════════════════════════════════
//  التحديات الجماعية المخصصة ولوحة النتائج (Scoreboard)
// ════════════════════════════════════════════════

export const recordMarathonProgress = async (userId, focusMinutes) => {
  if (!focusMinutes || focusMinutes <= 0) return;

  const activeParticipants = await prisma.wakeChallengeParticipant.findMany({
    where: {
      userId,
      isEliminated: false,
      challenge: {
        status: 'ACTIVE',
        challengeType: 'FOCUS_MARATHON',
      },
    },
    include: { challenge: true },
  });

  for (const part of activeParticipants) {
    const newProgress = part.progressMinutes + focusMinutes;
    const target = part.challenge.targetMinutes || 300;
    const completed = newProgress >= target;

    await prisma.wakeChallengeParticipant.update({
      where: { id: part.id },
      data: {
        progressMinutes: newProgress,
        isCompleted: completed,
      },
    });
  }
};

export const getChallengeScoreboard = async (challengeId) => {
  const challenge = await prisma.wakeChallenge.findUnique({
    where: { id: challengeId },
    include: {
      clan: { select: { id: true, name: true } },
      participants: {
        include: {
          user: {
            select: { id: true, username: true, profileImage: true, domain: true },
          },
        },
      },
    },
  });

  if (!challenge) throw notFound('التحدي غير موجود');

  let sortedParticipants = [...challenge.participants];

  if (challenge.challengeType === 'FOCUS_MARATHON') {
    sortedParticipants.sort((a, b) => b.progressMinutes - a.progressMinutes);
  } else {
    sortedParticipants.sort((a, b) => b.successDays - a.successDays);
  }

  const scoreboard = sortedParticipants.map((p, idx) => {
    const isMarathon = challenge.challengeType === 'FOCUS_MARATHON';
    const target = isMarathon
      ? challenge.targetMinutes || 300
      : challenge.durationDays || 7;
    const current = isMarathon ? p.progressMinutes : p.successDays;
    const percentage = Math.min(100, Math.round((current / target) * 100));

    return {
      rank: idx + 1,
      userId: p.user.id,
      username: p.user.username,
      profileImage: p.user.profileImage,
      progress: current,
      progressDisplay: isMarathon
        ? `${(current / 60).toFixed(1)} ساعة (${current} دقيقة)`
        : `${current} أيام استيقاظ`,
      targetDisplay: isMarathon
        ? `${(target / 60).toFixed(1)} ساعة مطلوب`
        : `${target} أيام مطلوبة`,
      percentage,
      isGoalReached: current >= target,
      rewarded: p.rewarded,
    };
  });

  return {
    challenge: {
      id: challenge.id,
      title: challenge.title,
      type: challenge.challengeType,
      targetTime: challenge.targetTime,
      targetMinutes: challenge.targetMinutes,
      status: challenge.status,
      rewardSparks: challenge.rewardSparks,
      startDate: challenge.startDate,
      endDate: challenge.endDate,
      clan: challenge.clan,
    },
    totalParticipants: scoreboard.length,
    winnersCount: scoreboard.filter((s) => s.isGoalReached).length,
    scoreboard,
  };
};

const progressChallenges = async (userId, date) => {
  const active = await prisma.wakeChallengeParticipant.findMany({
    where: {
      userId,
      isEliminated: false,
      challenge: {
        status: 'ACTIVE',
        startDate: { lte: date },
        endDate: { gte: date },
      },
    },
    select: { id: true },
  });

  if (active.length === 0) return;

  await prisma.wakeChallengeParticipant.updateMany({
    where: { id: { in: active.map((p) => p.id) } },
    data: { successDays: { increment: 1 } },
  });
};

const failChallenges = async (userId, date) => {
  const active = await prisma.wakeChallengeParticipant.findMany({
    where: {
      userId,
      isEliminated: false,
      challenge: {
        status: 'ACTIVE',
        startDate: { lte: date },
        endDate: { gte: date },
      },
    },
  });

  for (const p of active) {
    const missed = p.missedDays + 1;

    await prisma.wakeChallengeParticipant.update({
      where: { id: p.id },
      data: {
        missedDays: missed,
        isEliminated: missed > ALARM.CHALLENGE_MAX_MISSES,
      },
    });
  }
};

/**
 * إنهاء التحديات المنتهية ومنح المكافآت.
 * يُستدعى عند فتح قسم التحديات — لا يحتاج مجدولاً.
 */
export const settleExpiredChallenges = async () => {
  const today = new Date(new Date().toISOString().slice(0, 10));

  const expired = await prisma.wakeChallenge.findMany({
    where: { status: 'ACTIVE', endDate: { lt: today } },
    include: { participants: true },
  });

  for (const challenge of expired) {
    const required = challenge.durationDays - ALARM.CHALLENGE_MAX_MISSES;

    for (const p of challenge.participants) {
      const won = !p.isEliminated && p.successDays >= required;

      if (won && !p.rewarded) {
        await sparksService.award(p.userId, {
          source: 'ACHIEVEMENT_BONUS',
          baseAmount: challenge.rewardSparks,
          refId: challenge.id,
          note: `تحدي الاستيقاظ: ${challenge.title}`,
        });

        await prisma.wakeChallengeParticipant.update({
          where: { id: p.id },
          data: { rewarded: true },
        });
      }
    }

    await prisma.wakeChallenge.update({
      where: { id: challenge.id },
      data: { status: 'COMPLETED' },
    });
  }

  return expired.length;
};

export default {
  isValidTime,
  toMinutes,
  localTimeOf,
  localWeekdayOf,
  isOnTime,
  generateWakeTask,
  hasAlarmToday,
  recordWake,
  recordMissed,
  settleExpiredChallenges,
};
