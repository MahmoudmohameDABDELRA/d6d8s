import prisma from '../config/prisma.js';
import { SPARKS } from '../config/constants.js';
import * as sparksService from './sparks.service.js';
import { scoped } from '../config/logger.js';

const log = scoped('achievement');

/**
 * ════════════════════════════════════════════════════════════
 *  محرك الإنجازات
 * ════════════════════════════════════════════════════════════
 *
 * يُستدعى بعد كل حدث مؤثر (جلسة · مهمة · مذكرة · تشجيع).
 * يحدّث التقدم، وعند بلوغ الهدف يفتح الوسام ويمنح البونص.
 *
 * التصميم: الاستدعاء لا يرمي أخطاء للأعلى — فشل تحديث وسام
 * يجب ألا يُفشل جلسة تركيز ناجحة.
 */

/** مقياس كل فئة ومن أين يُقرأ */
const METRICS = {
  FOCUS: async (userId) => {
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { totalFocusMin: true },
    });
    return u?.totalFocusMin ?? 0;
  },

  STREAK: async (userId) => {
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { longestStreak: true },
    });
    return u?.longestStreak ?? 0;
  },

  TRIBE: async (userId, tier) => {
    // البرونزي يقيس التشجيعات، والفضي والذهبي يقيسان حضور النبض
    if (tier === 'BRONZE') {
      return prisma.encouragement.count({ where: { fromUserId: userId } });
    }
    return prisma.pulseReservation.count({
      where: { userId, attended: true },
    });
  },

  REFLECTION: async (userId) =>
    prisma.journalEntry.count({ where: { userId } }),

  EARLY_BIRD: async (userId) => {
    const alarms = await prisma.battleAlarm.findMany({
      where: { userId },
      select: { longestWakeStreak: true },
    });
    return Math.max(0, ...alarms.map((a) => a.longestWakeStreak));
  },
};

/**
 * تقييم أوسمة فئة واحدة.
 *
 * @param {string} userId
 * @param {'FOCUS'|'STREAK'|'TRIBE'|'REFLECTION'} category
 * @returns {Promise<Array<{code:string,title:string,icon:string,bonusSparks:number}>>} الأوسمة المفتوحة حديثاً
 */
export const evaluate = async (userId, category) => {
  const achievements = await prisma.achievement.findMany({
    where: { category },
    orderBy: { targetValue: 'asc' },
  });

  if (achievements.length === 0) return [];

  const unlocked = [];

  for (const a of achievements) {
    const value = await METRICS[category](userId, a.tier);

    const existing = await prisma.userAchievement.findUnique({
      where: {
        userId_achievementId: { userId, achievementId: a.id },
      },
    });

    // مفتوح سابقاً — لا نعيد المنح
    if (existing?.isUnlocked) continue;

    const progress = Math.min(value, a.targetValue);
    const justUnlocked = value >= a.targetValue;

    const saved = await prisma.userAchievement.upsert({
      where: { userId_achievementId: { userId, achievementId: a.id } },
      update: {
        progress,
        ...(justUnlocked ? { isUnlocked: true, unlockedAt: new Date() } : {}),
      },
      create: {
        userId,
        achievementId: a.id,
        progress,
        isUnlocked: justUnlocked,
        unlockedAt: justUnlocked ? new Date() : null,
      },
    });

    // نتحقق أن الوسام فُتح في هذه العملية تحديداً ولم يكن مفتوحاً من قبل
    if (justUnlocked && (!existing || !existing.isUnlocked)) {
      await sparksService.award(userId, {
        source: 'ACHIEVEMENT_BONUS',
        baseAmount: a.bonusSparks ?? SPARKS.ACHIEVEMENT_BONUS,
        refId: a.id,
        note: a.title,
      });

      unlocked.push({
        code: a.code,
        title: a.title,
        description: a.description,
        icon: a.icon,
        tier: a.tier,
        bonusSparks: a.bonusSparks,
      });
    }
  }

  return unlocked;
};

/**
 * تقييم آمن — لا يرمي أخطاء.
 * يُستدعى من الكنترولرات بعد نجاح العملية الأساسية.
 */
export const evaluateSafe = async (userId, ...categories) => {
  const unlocked = [];
  for (const c of categories) {
    try {
      unlocked.push(...(await evaluate(userId, c)));
    } catch (error) {
      log.error(`️ فشل تقييم أوسمة ${c}:`, error.message);
    }
  }
  return unlocked;
};

/** كل الأوسمة مع تقدم المستخدم فيها */
export const listForUser = async (userId) => {
  const [all, mine] = await Promise.all([
    prisma.achievement.findMany({
      orderBy: [{ category: 'asc' }, { targetValue: 'asc' }],
    }),
    prisma.userAchievement.findMany({ where: { userId } }),
  ]);

  const byId = new Map(mine.map((m) => [m.achievementId, m]));

  return all.map((a) => {
    const m = byId.get(a.id);
    const progress = m?.progress ?? 0;
    return {
      code: a.code,
      category: a.category,
      tier: a.tier,
      title: a.title,
      description: a.description,
      icon: a.icon,
      targetValue: a.targetValue,
      bonusSparks: a.bonusSparks,
      progress,
      percent: Math.min(100, Math.round((progress / a.targetValue) * 100)),
      isUnlocked: m?.isUnlocked ?? false,
      unlockedAt: m?.unlockedAt ?? null,
    };
  });
};

export default { evaluate, evaluateSafe, listForUser };
