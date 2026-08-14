import prisma from '../../config/prisma.js';
import { LIMITS } from '../../config/constants.js';
import * as achievementService from '../../services/achievement.service.js';
import * as titleEngine from '../../services/titleEngine.service.js';
import * as streakService from '../../services/streak.service.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { badRequest } from '../../utils/AppError.js';

/**
 * ════════════════════════════════════════════════════════════
 *  خزانة الأوسمة والألقاب الأسطورية النادرة
 * ════════════════════════════════════════════════════════════
 */

//////////////////////////////////////////////////////
// 1. الألقاب الأسطورية الثلاثة النادرة والتقدم المباشر
//////////////////////////////////////////////////////

export const listMythicTitles = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const result = await titleEngine.getMyMythicTitles(userId);
  res.status(200).json(result);
});

//////////////////////////////////////////////////////
// 2. ارتداء وتجهيز اللقب الأسطوري (Equip Title)
//////////////////////////////////////////////////////

export const equipMythicTitle = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { titleId } = req.params;
  const result = await titleEngine.equipMythicTitle(userId, titleId);
  res.status(200).json(result);
});

//////////////////////////////////////////////////////
// 3. خلع اللقب (Unequip Title)
//////////////////////////////////////////////////////

export const unequipMythicTitle = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const result = await titleEngine.unequipMythicTitle(userId);
  res.status(200).json(result);
});

//////////////////////////////////////////////////////
// 4. قاعة المشاهير والأساطير (Hall of Fame)
//////////////////////////////////////////////////////

export const getHallOfFame = asyncHandler(async (req, res) => {
  const result = await titleEngine.getHallOfFame();
  res.status(200).json(result);
});

//////////////////////////////////////////////////////
// كل الأوسمة مع التقدم
//////////////////////////////////////////////////////

export const listAchievements = asyncHandler(async (req, res) => {
  const userId = req.user.userId;

  const all = await achievementService.listForUser(userId);

  // التجميع حسب الفئة — الواجهة تعرضها في أربعة أقسام
  const byCategory = {};
  for (const a of all) {
    (byCategory[a.category] ??= []).push(a);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { showcaseIds: true },
  });

  res.json({
    success: true,
    total: all.length,
    unlocked: all.filter((a) => a.isUnlocked).length,
    showcaseIds: user?.showcaseIds ?? [],
    byCategory,
    achievements: all,
  });
});

//////////////////////////////////////////////////////
// أوسمة البروفايل — أفضل 3
//////////////////////////////////////////////////////

export const setShowcase = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { codes } = req.body ?? {};

  if (!Array.isArray(codes)) {
    throw badRequest('codes يجب أن تكون مصفوفة');
  }

  if (codes.length > LIMITS.SHOWCASE_BADGES) {
    throw badRequest(
      `أقصى عدد أوسمة على البروفايل ${LIMITS.SHOWCASE_BADGES}`,
    );
  }

  // لا يعرض إلا ما فتحه فعلاً
  if (codes.length > 0) {
    const unlocked = await prisma.userAchievement.findMany({
      where: {
        userId,
        isUnlocked: true,
        achievement: { code: { in: codes } },
      },
      select: { achievement: { select: { code: true } } },
    });

    const owned = new Set(unlocked.map((u) => u.achievement.code));
    const missing = codes.filter((c) => !owned.has(c));

    if (missing.length > 0) {
      throw badRequest(
        `لم تفتح هذه الأوسمة بعد: ${missing.join(' · ')}`,
        'ACHIEVEMENT_LOCKED',
      );
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: { showcaseIds: codes },
  });

  res.json({ success: true, message: 'تم تحديث أوسمة البروفايل', showcaseIds: codes });
});

//////////////////////////////////////////////////////
// إعادة حساب التقدم
//////////////////////////////////////////////////////

/**
 * يعيد تقييم كل الفئات.
 * مفيد بعد تعديل شروط الأوسمة أو لإصلاح تقدم غير متزامن.
 */
export const recalculate = asyncHandler(async (req, res) => {
  const unlocked = await achievementService.evaluateSafe(
    req.user.userId,
    'FOCUS',
    'STREAK',
    'TRIBE',
    'REFLECTION',
    'EARLY_BIRD',
  );

  res.json({
    success: true,
    message: 'تمت إعادة الحساب',
    newlyUnlocked: unlocked,
  });
});

//////////////////////////////////////////////////////
// ملخص المستخدم الشامل
//////////////////////////////////////////////////////

export const getMyStats = asyncHandler(async (req, res) => {
  const userId = req.user.userId;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      username: true,
      domain: true,
      specialty: true,
      profileImage: true,
      sparksBalance: true,
      totalSparksEarned: true,
      totalFocusMin: true,
      showcaseIds: true,
      timezone: true,
      createdAt: true,
    },
  });

  const todayStart = streakService.startOfLocalDay(user.timezone);

  const [sessions, tasks, todayFocus, todayTasks, achievements, clans, streak] =
    await Promise.all([
      prisma.focusSession.count({ where: { userId, status: 'COMPLETED' } }),
      prisma.task.count({ where: { userId, isCompleted: true } }),
      prisma.focusSession.aggregate({
        where: { userId, status: 'COMPLETED', startedAt: { gte: todayStart } },
        _sum: { serverVerifiedMin: true },
      }),
      prisma.task.count({
        where: { userId, isCompleted: true, completedAt: { gte: todayStart } },
      }),
      prisma.userAchievement.count({ where: { userId, isUnlocked: true } }),
      prisma.clanMember.count({ where: { userId } }),
      streakService.getStatus(userId),
    ]);

  res.json({
    success: true,
    profile: {
      username: user.username,
      domain: user.domain,
      specialty: user.specialty,
      profileImage: user.profileImage,
      showcaseIds: user.showcaseIds,
      memberSince: user.createdAt,
    },
    sparks: {
      balance: user.sparksBalance,
      totalEarned: user.totalSparksEarned,
    },
    focus: {
      totalMinutes: user.totalFocusMin,
      totalHours: Math.round((user.totalFocusMin / 60) * 10) / 10,
      totalSessions: sessions,
    },
    tasks: { completed: tasks },
    today: {
      focusMin: todayFocus._sum.serverVerifiedMin ?? 0,
      tasksCompleted: todayTasks,
    },
    achievements: { unlocked: achievements, total: 15 },
    clans: { count: clans },
    streak,
  });
});
