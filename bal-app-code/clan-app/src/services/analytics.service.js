import prisma from '../config/prisma.js';
import redisClient from '../config/redis.js';
import * as streakService from './streak.service.js';
import { scoped } from '../config/logger.js';
import { notFound } from '../utils/AppError.js';

const log = scoped('analytics-service');

/**
 * ════════════════════════════════════════════════════════════
 *  محرك الإحصائيات والتحليلات الشاملة — Master Analytics Engine
 * ════════════════════════════════════════════════════════════
 *
 *  الوحدات السبع الأساسية:
 *   ١. لوحة التحكم الموحدة (Unified Dashboard Analytics)
 *   ٢. السلسلة الزمنية وخريطة الحرارة (Activity Timeline & Heatmap)
 *   ٣. مصفوفة الرادار خماسية الأبعاد (5-Axis Productivity Radar)
 *   ٤. ساعات الذروة الذهبية (Peak Productivity Hours)
 *   ٥. مقارنة النمو والتقدم الدوري (Growth & Delta Analytics)
 *   ٦. انضباط النوم والاستيقاظ (Circadian & Wake Discipline)
 *   ٧. الارتباط بين المزاج والإنتاجية (Mood vs Focus Correlation)
 *   ٨. الترتيب والنسبة المئوية في المجال والعشيرة (Domain & Clan Percentile)
 */

const CACHE_TTL_SECONDS = 300; // 5 دقائق كاش في Redis

/** إبطال كاش الإحصائيات عند حدوث أي نشاط جديد */
export const invalidateAnalytics = async (userId) => {
  if (!redisClient?.isOpen) return;
  try {
    const keys = await redisClient.keys(`analytics:${userId}:*`);
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
  } catch (err) {
    log.warn({ err: err.message, userId }, 'تعذر إبطال كاش التحليلات');
  }
};

/**
 * دالة مساعدة لتوليد تواريخ الأيام ضمن نافذة زمنية
 */
const getDayRange = (daysCount, timezone = 'Africa/Cairo') => {
  const days = [];
  const now = new Date();
  
  for (let i = daysCount - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 3600 * 1000);
    const dateStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);

    const weekdayStr = new Intl.DateTimeFormat('ar-EG', {
      timeZone: timezone,
      weekday: 'short',
    }).format(d);

    days.push({ dateStr, weekdayStr, dateObj: new Date(`${dateStr}T00:00:00.000Z`) });
  }
  return days;
};

//////////////////////////////////////////////////////
// 1. لوحة التحكم الموحدة (Master Dashboard)
//////////////////////////////////////////////////////

export const getMasterDashboard = async (userId, timezone = 'Africa/Cairo') => {
  const cacheKey = `analytics:${userId}:dashboard:${timezone}`;
  if (redisClient?.isOpen) {
    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch {}
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      domain: true,
      specialty: true,
      profileImage: true,
      sparksBalance: true,
      totalSparksEarned: true,
      totalFocusMin: true,
      currentStreak: true,
      longestStreak: true,
      shieldsRemaining: true,
      shieldsUsedThisMonth: true,
      timezone: true,
      createdAt: true,
    },
  });

  if (!user) throw notFound('المستخدم غير موجود');

  const tz = user.timezone || timezone;
  const todayDate = streakService.localDate(tz);
  const todayStart = streakService.startOfLocalDay(tz);

  // بداية الأسبوع الحالي (7 أيام ماضية)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);

  const [
    todayFocusAgg,
    todayTasksCount,
    todaySparksAgg,
    weekFocusAgg,
    weekTasksCount,
    totalSessionsCount,
    totalTasksCompleted,
    totalAchievementsUnlocked,
    radarData,
    percentileData,
  ] = await Promise.all([
    // تركيز اليوم
    prisma.focusSession.aggregate({
      where: { userId, status: 'COMPLETED', startedAt: { gte: todayStart } },
      _sum: { serverVerifiedMin: true },
      _count: true,
    }),
    // مهام اليوم المنجزة
    prisma.task.count({
      where: { userId, isCompleted: true, completedAt: { gte: todayStart } },
    }),
    // شرارات اليوم
    prisma.sparkTransaction.aggregate({
      where: { userId, amount: { gt: 0 }, createdAt: { gte: todayStart } },
      _sum: { amount: true },
    }),
    // تركيز آخر 7 أيام
    prisma.focusSession.aggregate({
      where: { userId, status: 'COMPLETED', startedAt: { gte: sevenDaysAgo } },
      _sum: { serverVerifiedMin: true },
      _count: true,
    }),
    // مهام آخر 7 أيام
    prisma.task.count({
      where: { userId, isCompleted: true, completedAt: { gte: sevenDaysAgo } },
    }),
    // إجمالي الجلسات التراكمية
    prisma.focusSession.count({ where: { userId, status: 'COMPLETED' } }),
    // إجمالي المهام المنجزة التراكمية
    prisma.task.count({ where: { userId, isCompleted: true } }),
    // الأوسمة المفتوحة
    prisma.userAchievement.count({ where: { userId, isUnlocked: true } }),
    // مصفوفة الرادار
    getRadarMatrix(userId),
    // الترتيب في المجال
    getDomainPercentile(userId),
  ]);

  const dashboard = {
    success: true,
    user: {
      id: user.id,
      username: user.username,
      domain: user.domain,
      specialty: user.specialty,
      profileImage: user.profileImage,
      memberSince: user.createdAt,
    },
    today: {
      focusMinutes: todayFocusAgg._sum.serverVerifiedMin ?? 0,
      sessionsCount: todayFocusAgg._count ?? 0,
      tasksCompleted: todayTasksCount,
      sparksEarned: todaySparksAgg._sum.amount ?? 0,
      streak: user.currentStreak,
      shieldsRemaining: user.shieldsRemaining,
    },
    thisWeek: {
      totalFocusMinutes: weekFocusAgg._sum.serverVerifiedMin ?? 0,
      totalFocusHours: Math.round(((weekFocusAgg._sum.serverVerifiedMin ?? 0) / 60) * 10) / 10,
      sessionsCount: weekFocusAgg._count ?? 0,
      tasksCompleted: weekTasksCount,
      dailyAverageMinutes: Math.round((weekFocusAgg._sum.serverVerifiedMin ?? 0) / 7),
    },
    lifetime: {
      totalFocusMinutes: user.totalFocusMin,
      totalFocusHours: Math.round((user.totalFocusMin / 60) * 10) / 10,
      totalSessions: totalSessionsCount,
      totalTasksCompleted,
      sparksBalance: user.sparksBalance,
      totalSparksEarned: user.totalSparksEarned,
      currentStreak: user.currentStreak,
      longestStreak: user.longestStreak,
      achievementsUnlocked: totalAchievementsUnlocked,
    },
    radar: radarData.radar,
    archetype: radarData.archetype,
    ranking: percentileData,
    generatedAt: new Date().toISOString(),
  };

  if (redisClient?.isOpen) {
    try {
      await redisClient.setEx(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(dashboard));
    } catch {}
  }

  return dashboard;
};

//////////////////////////////////////////////////////
// 2. السلسلة الزمنية وخريطة النشاط (Timeline & Heatmap)
//////////////////////////////////////////////////////

export const getActivityTimeline = async ({ userId, days = 30, timezone = 'Africa/Cairo' }) => {
  const daysLimit = Math.min(365, Math.max(7, Number(days) || 30));
  const cacheKey = `analytics:${userId}:timeline:${daysLimit}:${timezone}`;

  if (redisClient?.isOpen) {
    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch {}
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });

  const tz = user?.timezone || timezone;
  const dayRanges = getDayRange(daysLimit, tz);
  const startDate = dayRanges[0].dateObj;

  // جلب كافة بيانات النشاط في استعلامات متوازية
  const [focusSessions, completedTasks, sparkTxs, moodLogs, wakeLogs, goalWeeks] = await Promise.all([
    prisma.focusSession.findMany({
      where: { userId, status: 'COMPLETED', startedAt: { gte: startDate } },
      select: { startedAt: true, serverVerifiedMin: true, type: true },
    }),
    prisma.task.findMany({
      where: { userId, isCompleted: true, completedAt: { gte: startDate } },
      select: { completedAt: true, priority: true },
    }),
    prisma.sparkTransaction.findMany({
      where: { userId, amount: { gt: 0 }, createdAt: { gte: startDate } },
      select: { createdAt: true, amount: true },
    }),
    prisma.dailyMoodLog.findMany({
      where: { userId, date: { gte: startDate } },
      select: { date: true, mood: true },
    }),
    prisma.wakeLog.findMany({
      where: { userId, date: { gte: startDate } },
      select: { date: true, result: true, responseSec: true },
    }),
    prisma.goalWeek.findMany({
      where: { goal: { userId }, documentedAt: { gte: startDate }, status: 'DOCUMENTED' },
      select: { documentedAt: true },
    }),
  ]);

  // بناء خريطة التجميع اليومية
  const timelineMap = new Map();
  dayRanges.forEach(({ dateStr, weekdayStr }) => {
    timelineMap.set(dateStr, {
      date: dateStr,
      weekday: weekdayStr,
      focusMinutes: 0,
      sessionsCount: 0,
      tasksCompleted: 0,
      sparksEarned: 0,
      mood: null,
      wakeResult: null,
      journalDocumented: false,
      intensityLevel: 0, // 0 = 0min, 1 = 1-30min, 2 = 31-90min, 3 = 91-180min, 4 = >180min
    });
  });

  // تجميع جلسات التركيز
  focusSessions.forEach((s) => {
    const sDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(s.startedAt);

    if (timelineMap.has(sDate)) {
      const entry = timelineMap.get(sDate);
      entry.focusMinutes += s.serverVerifiedMin || 0;
      entry.sessionsCount += 1;
    }
  });

  // تجميع المهام
  completedTasks.forEach((t) => {
    if (!t.completedAt) return;
    const tDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(t.completedAt);

    if (timelineMap.has(tDate)) {
      timelineMap.get(tDate).tasksCompleted += 1;
    }
  });

  // تجميع الشرارات
  sparkTxs.forEach((tx) => {
    const txDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(tx.createdAt);

    if (timelineMap.has(txDate)) {
      timelineMap.get(txDate).sparksEarned += tx.amount || 0;
    }
  });

  // تجميع المزاج
  moodLogs.forEach((m) => {
    const mDate = m.date.toISOString().slice(0, 10);
    if (timelineMap.has(mDate)) {
      timelineMap.get(mDate).mood = m.mood;
    }
  });

  // تجميع الاستيقاظ
  wakeLogs.forEach((w) => {
    const wDate = w.date.toISOString().slice(0, 10);
    if (timelineMap.has(wDate)) {
      timelineMap.get(wDate).wakeResult = w.result;
    }
  });

  // تجميع التوثيق
  goalWeeks.forEach((g) => {
    if (!g.documentedAt) return;
    const gDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(g.documentedAt);

    if (timelineMap.has(gDate)) {
      timelineMap.get(gDate).journalDocumented = true;
    }
  });

  // حساب درجات الكثافة (Intensity 0 to 4)
  const timeline = Array.from(timelineMap.values()).map((d) => {
    let intensity = 0;
    if (d.focusMinutes > 180 || d.tasksCompleted >= 6) intensity = 4;
    else if (d.focusMinutes >= 90 || d.tasksCompleted >= 4) intensity = 3;
    else if (d.focusMinutes >= 30 || d.tasksCompleted >= 2) intensity = 2;
    else if (d.focusMinutes > 0 || d.tasksCompleted > 0 || d.journalDocumented) intensity = 1;

    return { ...d, intensityLevel: intensity };
  });

  // ملخص إجمالي للفترة
  const totalFocus = timeline.reduce((acc, cur) => acc + cur.focusMinutes, 0);
  const totalTasks = timeline.reduce((acc, cur) => acc + cur.tasksCompleted, 0);
  const totalSparks = timeline.reduce((acc, cur) => acc + cur.sparksEarned, 0);
  const activeDays = timeline.filter((d) => d.focusMinutes > 0 || d.tasksCompleted > 0).length;

  const result = {
    success: true,
    rangeDays: daysLimit,
    summary: {
      totalFocusMinutes: totalFocus,
      totalFocusHours: Math.round((totalFocus / 60) * 10) / 10,
      dailyAverageMinutes: Math.round(totalFocus / daysLimit),
      totalTasksCompleted: totalTasks,
      totalSparksEarned: totalSparks,
      activeDaysCount: activeDays,
      consistencyRate: Math.round((activeDays / daysLimit) * 100),
    },
    timeline,
  };

  if (redisClient?.isOpen) {
    try {
      await redisClient.setEx(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(result));
    } catch {}
  }

  return result;
};

//////////////////////////////////////////////////////
// 3. مصفوفة الرادار خماسية الأبعاد (5-Axis Radar)
//////////////////////////////////////////////////////

export const getRadarMatrix = async (userId) => {
  const [user, sessionsAll, tasksAll, pulseCount, wakeLogsCount, goalWeeksCount, moodLogsCount] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          totalFocusMin: true,
          currentStreak: true,
          longestStreak: true,
          shieldsRemaining: true,
          sparksBalance: true,
          totalSparksEarned: true,
        },
      }),
      prisma.focusSession.findMany({
        where: { userId },
        select: { status: true, serverVerifiedMin: true, type: true },
      }),
      prisma.task.findMany({
        where: { userId },
        select: { isCompleted: true, priority: true, dueDate: true },
      }),
      prisma.pulseReservation.count({ where: { userId, attended: true } }),
      prisma.wakeLog.count({ where: { userId, result: 'WOKE' } }),
      prisma.goalWeek.count({ where: { goal: { userId }, status: 'DOCUMENTED' } }),
      prisma.dailyMoodLog.count({ where: { userId } }),
    ]);

  if (!user) throw notFound('المستخدم غير موجود');

  // 1. العمق والتركيز (Focus Depth 0-100)
  const completedSessions = sessionsAll.filter((s) => s.status === 'COMPLETED');
  const failedOrCancelled = sessionsAll.filter((s) => ['CANCELLED', 'FAILED'].includes(s.status));
  const completionRatio =
    sessionsAll.length > 0 ? completedSessions.length / sessionsAll.length : 1;
  const focusVolumeScore = Math.min(100, Math.round((user.totalFocusMin / 600) * 100)); // 600 دقيقة (10س) = 100%
  const depthScore = Math.min(
    100,
    Math.round(focusVolumeScore * 0.7 + completionRatio * 30),
  );

  // 2. الإنجاز وتنفيذ المهام (Task Execution 0-100)
  const totalTasks = tasksAll.length;
  const doneTasks = tasksAll.filter((t) => t.isCompleted);
  const criticalTasks = doneTasks.filter((t) => t.priority === 'CRITICAL');
  const taskRatio = totalTasks > 0 ? (doneTasks.length / totalTasks) * 100 : 50;
  const criticalBonus = Math.min(30, criticalTasks.length * 5);
  const executionScore = Math.min(100, Math.round(taskRatio * 0.7 + criticalBonus));

  // 3. الانضباط والاستمرارية (Discipline & Streak 0-100)
  const streakScore = Math.min(70, user.currentStreak * 10);
  const wakeBonus = Math.min(30, wakeLogsCount * 6);
  const disciplineScore = Math.min(100, Math.round(streakScore + wakeBonus));

  // 4. العشيرة والتأثير الجماعي (Tribe Impact 0-100)
  const pulseScore = Math.min(60, pulseCount * 12);
  const tribeScore = Math.min(100, Math.round(pulseScore + (sessionsAll.some((s) => s.type === 'PULSE') ? 40 : 10)));

  // 5. الوعي والتأمل (Mindfulness & Reflection 0-100)
  const journalScore = Math.min(50, goalWeeksCount * 15);
  const moodScore = Math.min(50, moodLogsCount * 10);
  const mindfulnessScore = Math.min(100, Math.round(journalScore + moodScore));

  const radar = {
    focusDepth: Math.max(15, depthScore),
    taskExecution: Math.max(15, executionScore),
    streakDiscipline: Math.max(15, disciplineScore),
    tribeImpact: Math.max(15, tribeScore),
    mindfulness: Math.max(15, mindfulnessScore),
  };

  const overallScore = Math.round(
    (radar.focusDepth +
      radar.taskExecution +
      radar.streakDiscipline +
      radar.tribeImpact +
      radar.mindfulness) /
      5,
  );

  // تحديد النمط الإنتاجي (Productivity Archetype)
  let archetype = {
    title: 'محارب طموح ️',
    description: 'في بداية رحلة بناء الانضباط وترسيخ عادات التركيز العميق.',
  };

  if (overallScore >= 80) {
    archetype = {
      title: 'أسطورة الانضباط ',
      description: 'توازن استثنائي في عمق التركيز والالتزام اليومي والتأثير في العشيرة.',
    };
  } else if (radar.focusDepth >= 75 && radar.focusDepth > radar.tribeImpact) {
    archetype = {
      title: 'عالم التركيز العميق ',
      description: 'تتميز بقدرة فائقة على الانغماس لساعات طويلة في المهام الفردية المعقدة.',
    };
  } else if (radar.tribeImpact >= 70) {
    archetype = {
      title: 'قائد العشيرة الملهم ️',
      description: 'طاقتك تتضاعف في جلسات النبض الجماعية وتحفز المحيطين بك على العطاء.',
    };
  } else if (radar.taskExecution >= 75) {
    archetype = {
      title: 'المنفذ الحاسم ',
      description: 'لا تترك مهمة معلقة، وتنهي الأولويات الحرجة بدقة وسرعة قياسية.',
    };
  } else if (radar.mindfulness >= 70) {
    archetype = {
      title: 'الحكيم الاستراتيجي ',
      description: 'توثق خطواتك باستمرار، وتتعلم من كل أسبوع لتطور نظامك الشخصي.',
    };
  }

  return {
    success: true,
    overallScore,
    radar,
    archetype,
  };
};

//////////////////////////////////////////////////////
// 4. ساعات الذروة الذهبية (Peak Productivity Hours)
//////////////////////////////////////////////////////

export const getPeakProductivityHours = async (userId, timezone = 'Africa/Cairo') => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });

  const tz = user?.timezone || timezone;

  const sessions = await prisma.focusSession.findMany({
    where: { userId, status: 'COMPLETED' },
    select: { startedAt: true, serverVerifiedMin: true },
    take: 500,
  });

  const hourlyDistribution = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    hourLabel: `${String(hour).padStart(2, '0')}:00`,
    focusMinutes: 0,
    sessionsCount: 0,
    percentage: 0,
  }));

  let totalMinutes = 0;

  sessions.forEach((s) => {
    const hourStr = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      hour12: false,
    }).format(s.startedAt);

    const hour = parseInt(hourStr, 10) % 24;
    hourlyDistribution[hour].focusMinutes += s.serverVerifiedMin || 0;
    hourlyDistribution[hour].sessionsCount += 1;
    totalMinutes += s.serverVerifiedMin || 0;
  });

  if (totalMinutes > 0) {
    hourlyDistribution.forEach((h) => {
      h.percentage = Math.round((h.focusMinutes / totalMinutes) * 100);
    });
  }

  // حساب فترات اليوم الكبرى
  const morningMinutes = hourlyDistribution.slice(5, 12).reduce((a, b) => a + b.focusMinutes, 0);
  const afternoonMinutes = hourlyDistribution.slice(12, 17).reduce((a, b) => a + b.focusMinutes, 0);
  const eveningMinutes = hourlyDistribution.slice(17, 22).reduce((a, b) => a + b.focusMinutes, 0);
  const nightMinutes =
    hourlyDistribution.slice(22, 24).reduce((a, b) => a + b.focusMinutes, 0) +
    hourlyDistribution.slice(0, 5).reduce((a, b) => a + b.focusMinutes, 0);

  // إيجاد نافذة الـ 3 ساعات الذهبية الأكثر إنتاجية
  let maxWindowMinutes = 0;
  let goldenWindowStart = 6;

  for (let i = 0; i < 22; i++) {
    const windowSum =
      hourlyDistribution[i].focusMinutes +
      hourlyDistribution[i + 1].focusMinutes +
      hourlyDistribution[i + 2].focusMinutes;
    if (windowSum > maxWindowMinutes) {
      maxWindowMinutes = windowSum;
      goldenWindowStart = i;
    }
  }

  let chronotype = 'المتوازن المستمر ️';
  if (morningMinutes >= totalMinutes * 0.45) chronotype = 'صقر الصباح الباكر  (Early Bird)';
  else if (nightMinutes >= totalMinutes * 0.35 || eveningMinutes >= totalMinutes * 0.45)
    chronotype = 'محارب المساء العميق  (Night Owl)';
  else if (afternoonMinutes >= totalMinutes * 0.4) chronotype = 'مكتسح الظهيرة ️ (Afternoon Dynamo)';

  return {
    success: true,
    totalMinutesAnalyzed: totalMinutes,
    goldenWindow: {
      from: `${String(goldenWindowStart).padStart(2, '0')}:00`,
      to: `${String((goldenWindowStart + 3) % 24).padStart(2, '0')}:00`,
      focusMinutesInWindow: maxWindowMinutes,
      densityPercentage: totalMinutes > 0 ? Math.round((maxWindowMinutes / totalMinutes) * 100) : 0,
      recommendation: `أفضل توقيت لبرمجة مهامك الحرجة والأكثر تعقيداً هو بين الساعة ${goldenWindowStart}:00 و ${(goldenWindowStart + 3) % 24}:00 `,
    },
    periodsBreakdown: {
      morning: { label: 'الصباح (05:00 - 12:00)', minutes: morningMinutes },
      afternoon: { label: 'الظهيرة (12:00 - 17:00)', minutes: afternoonMinutes },
      evening: { label: 'المساء (17:00 - 22:00)', minutes: eveningMinutes },
      night: { label: 'الليل (22:00 - 05:00)', minutes: nightMinutes },
    },
    chronotype,
    hourlyDistribution,
  };
};

//////////////////////////////////////////////////////
// 5. مقارنة النمو الدوري (Growth & Delta Analytics)
//////////////////////////////////////////////////////

export const getGrowthComparison = async ({ userId, timezone = 'Africa/Cairo' }) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });

  const tz = user?.timezone || timezone;
  const now = new Date();

  // فترات الأسبوع: هذا الأسبوع (آخر 7 أيام) مقابل الأسبوع السابق (اليوم 8 إلى 14)
  const thisWeekStart = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  const prevWeekStart = new Date(now.getTime() - 14 * 24 * 3600 * 1000);

  const [
    thisWeekFocus,
    prevWeekFocus,
    thisWeekTasks,
    prevWeekTasks,
    thisWeekSparks,
    prevWeekSparks,
  ] = await Promise.all([
    prisma.focusSession.aggregate({
      where: { userId, status: 'COMPLETED', startedAt: { gte: thisWeekStart } },
      _sum: { serverVerifiedMin: true },
      _count: true,
    }),
    prisma.focusSession.aggregate({
      where: {
        userId,
        status: 'COMPLETED',
        startedAt: { gte: prevWeekStart, lt: thisWeekStart },
      },
      _sum: { serverVerifiedMin: true },
      _count: true,
    }),
    prisma.task.count({
      where: { userId, isCompleted: true, completedAt: { gte: thisWeekStart } },
    }),
    prisma.task.count({
      where: {
        userId,
        isCompleted: true,
        completedAt: { gte: prevWeekStart, lt: thisWeekStart },
      },
    }),
    prisma.sparkTransaction.aggregate({
      where: { userId, amount: { gt: 0 }, createdAt: { gte: thisWeekStart } },
      _sum: { amount: true },
    }),
    prisma.sparkTransaction.aggregate({
      where: {
        userId,
        amount: { gt: 0 },
        createdAt: { gte: prevWeekStart, lt: thisWeekStart },
      },
      _sum: { amount: true },
    }),
  ]);

  const calcDelta = (cur, prev) => {
    const diff = cur - prev;
    const percent = prev > 0 ? Math.round((diff / prev) * 100) : cur > 0 ? 100 : 0;
    return { current: cur, previous: prev, diff, percentage: percent };
  };

  const curFocusMin = thisWeekFocus._sum.serverVerifiedMin || 0;
  const prevFocusMin = prevWeekFocus._sum.serverVerifiedMin || 0;
  const curSparks = thisWeekSparks._sum.amount || 0;
  const prevSparks = prevWeekSparks._sum.amount || 0;

  const focusDelta = calcDelta(curFocusMin, prevFocusMin);
  const tasksDelta = calcDelta(thisWeekTasks, prevWeekTasks);
  const sparksDelta = calcDelta(curSparks, prevSparks);
  const sessionsDelta = calcDelta(thisWeekFocus._count || 0, prevWeekFocus._count || 0);

  let trendMessage = 'أداؤك مستقر ويحافظ على نسق ثابت ';
  if (focusDelta.diff > 0 && tasksDelta.diff >= 0) {
    trendMessage = `نمو رائع! زاد تركيزك بنسبة ${focusDelta.percentage}% مقارنة بالأسبوع الماضي `;
  } else if (focusDelta.diff < 0) {
    trendMessage = `انخفاض خفيف بنسبة ${Math.abs(focusDelta.percentage)}% عن الأسبوع الماضي.. جلسة إنقاذ واحدة ستعيدك للقمة! ️`;
  }

  return {
    success: true,
    period: 'WEEK_OVER_WEEK',
    summaryMessage: trendMessage,
    comparison: {
      focusMinutes: focusDelta,
      tasksCompleted: tasksDelta,
      sparksEarned: sparksDelta,
      sessionsCount: sessionsDelta,
    },
  };
};

//////////////////////////////////////////////////////
// 6. انضباط النوم والاستيقاظ (Circadian Discipline)
//////////////////////////////////////////////////////

export const getCircadianDiscipline = async (userId) => {
  const [wakeLogs, alarmsCount] = await Promise.all([
    prisma.wakeLog.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
      take: 60,
    }),
    prisma.battleAlarm.count({ where: { userId, isActive: true } }),
  ]);

  const totalLogs = wakeLogs.length;
  const successfulWakes = wakeLogs.filter((w) => w.result === 'WOKE');
  const missedWakes = wakeLogs.filter((w) => w.result === 'MISSED');
  const solvedMath = successfulWakes.filter((w) => w.solvedTask);

  const onTimeRate = totalLogs > 0 ? Math.round((successfulWakes.length / totalLogs) * 100) : 0;
  const validResponses = successfulWakes.filter((w) => typeof w.responseSec === 'number');
  const avgResponseSec =
    validResponses.length > 0
      ? Math.round(validResponses.reduce((a, b) => a + b.responseSec, 0) / validResponses.length)
      : 0;

  return {
    success: true,
    activeAlarms: alarmsCount,
    wakeLogsAnalyzed: totalLogs,
    stats: {
      onTimeWakeRate: onTimeRate,
      successfulWakesCount: successfulWakes.length,
      missedCount: missedWakes.length,
      mathChallengeSuccessRate:
        successfulWakes.length > 0 ? Math.round((solvedMath.length / successfulWakes.length) * 100) : 0,
      averageResponseSeconds: avgResponseSec,
    },
    recentLogs: wakeLogs.slice(0, 7).map((l) => ({
      date: l.date.toISOString().slice(0, 10),
      scheduledTime: l.scheduledTime,
      result: l.result,
      responseSeconds: l.responseSec,
      solvedTask: l.solvedTask,
    })),
  };
};

//////////////////////////////////////////////////////
// 7. ارتباط المزاج بالإنتاجية (Mood Correlation)
//////////////////////////////////////////////////////

export const getMoodCorrelation = async (userId) => {
  const [moodLogs, focusSessions] = await Promise.all([
    prisma.dailyMoodLog.findMany({
      where: { userId },
      select: { date: true, mood: true },
      take: 90,
    }),
    prisma.focusSession.findMany({
      where: { userId, status: 'COMPLETED' },
      select: { startedAt: true, serverVerifiedMin: true },
      take: 300,
    }),
  ]);

  // ربط اليوم بالمزاج
  const moodDateMap = new Map();
  moodLogs.forEach((m) => {
    moodDateMap.set(m.date.toISOString().slice(0, 10), m.mood);
  });

  const moodStats = {
    ENERGIZED: { totalMin: 0, daysCount: 0, avgMin: 0 },
    TIRED: { totalMin: 0, daysCount: 0, avgMin: 0 },
    STRESSED: { totalMin: 0, daysCount: 0, avgMin: 0 },
    FRUSTRATED: { totalMin: 0, daysCount: 0, avgMin: 0 },
  };

  const dailyFocusMap = new Map();
  focusSessions.forEach((s) => {
    const dStr = s.startedAt.toISOString().slice(0, 10);
    dailyFocusMap.set(dStr, (dailyFocusMap.get(dStr) || 0) + (s.serverVerifiedMin || 0));
  });

  moodDateMap.forEach((mood, dateStr) => {
    if (moodStats[mood]) {
      const focusOnDay = dailyFocusMap.get(dateStr) || 0;
      moodStats[mood].totalMin += focusOnDay;
      moodStats[mood].daysCount += 1;
    }
  });

  Object.keys(moodStats).forEach((k) => {
    const item = moodStats[k];
    item.avgMin = item.daysCount > 0 ? Math.round(item.totalMin / item.daysCount) : 0;
  });

  return {
    success: true,
    moodLogsCount: moodLogs.length,
    correlation: moodStats,
    insight:
      moodStats.ENERGIZED.avgMin > 0
        ? `في الأيام التي تسجل فيها "متحمس " تحقق أعلى معدل تركيز بمتوسط ${moodStats.ENERGIZED.avgMin} دقيقة يومياً.`
        : 'سجل مزاجك الصباحي يومياً لاكتشاف المعادلة النفسية لإنتاجيتك القصوى ',
  };
};

//////////////////////////////////////////////////////
// 8. الترتيب والنسبة المئوية في المجال (Percentile)
//////////////////////////////////////////////////////

export const getDomainPercentile = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, domain: true, totalFocusMin: true, totalSparksEarned: true },
  });

  if (!user) throw notFound('المستخدم غير موجود');

  const domain = user.domain || 'TECH';

  // حساب عدد المستخدمين في نفس المجال الذين يمتلكون دقائق تركيز أعلى
  const [totalInDomain, higherInDomain, clanMembership] = await Promise.all([
    prisma.user.count({ where: { domain } }),
    prisma.user.count({ where: { domain, totalFocusMin: { gt: user.totalFocusMin } } }),
    prisma.clanMember.findFirst({
      where: { userId },
      include: {
        clan: {
          select: {
            id: true,
            name: true,
            members: { select: { userId: true, user: { select: { totalFocusMin: true } } } },
          },
        },
      },
    }),
  ]);

  const domainRank = higherInDomain + 1;
  const percentile =
    totalInDomain > 0
      ? Math.max(1, Math.min(99, Math.round(((totalInDomain - higherInDomain) / totalInDomain) * 100)))
      : 100;

  let clanRank = 1;
  let clanTotal = 1;
  let clanName = null;

  if (clanMembership?.clan) {
    clanName = clanMembership.clan.name;
    const members = clanMembership.clan.members ?? [];
    const sortedMembers = members.sort(
      (a, b) => (b.user?.totalFocusMin || 0) - (a.user?.totalFocusMin || 0),
    );
    clanRank = sortedMembers.findIndex((m) => m.userId === userId) + 1;
    clanTotal = sortedMembers.length;
  }

  return {
    domain,
    domainRank,
    totalInDomain,
    percentileBadge: `أعلى ${100 - percentile + 1}% في مسار ${domain}`,
    topPercentile: Math.max(1, 100 - percentile + 1),
    clan: clanName
      ? {
          name: clanName,
          rank: clanRank,
          totalMembers: clanTotal,
        }
      : null,
  };
};

export default {
  getMasterDashboard,
  getActivityTimeline,
  getRadarMatrix,
  getPeakProductivityHours,
  getGrowthComparison,
  getCircadianDiscipline,
  getMoodCorrelation,
  getDomainPercentile,
  invalidateAnalytics,
};
