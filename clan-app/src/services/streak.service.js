import prisma from '../config/prisma.js';

/**
 * ════════════════════════════════════════════════════════════
 *  خدمة السلسلة (Streak)
 * ════════════════════════════════════════════════════════════
 *
 * ️ تُحسب بتوقيت المستخدم المحلي لا UTC.
 *
 * السبب: مستخدم في القاهرة ينهي جلسته 1:00 صباحاً محلياً،
 * وهذا 23:00 من اليوم السابق بتوقيت UTC. لو حسبنا بـ UTC
 * لانكسرت سلسلته أو احتُسب له يومان في يوم واحد.
 *
 * ما يحافظ على السلسلة: جلسة تركيز مكتملة **أو** مذكرة يومية.
 */

/**
 * تاريخ اليوم بتوقيت المستخدم، مجرّداً من الوقت.
 *
 * ️ للمقارنة والتخزين فقط (@db.Date) — **لا** تستخدمه كنقطة بداية
 * في استعلامات `gte`. لذلك انظر startOfLocalDay أدناه.
 */
export const localDate = (timezone = 'UTC', now = new Date()) => {
  // en-CA يعطي YYYY-MM-DD مباشرة
  const s = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

  return new Date(`${s}T00:00:00.000Z`);
};

/**
 * اللحظة الفعلية (UTC) التي بدأ عندها يوم المستخدم المحلي.
 *
 * لماذا دالة منفصلة؟
 *   localDate('Africa/Cairo') في 22:40 UTC يعطي 2026-07-30T00:00Z
 *   وهي لحظة **في المستقبل** بساعتين، لأن يوم القاهرة بدأ 22:00 UTC.
 *   استخدامها في `startedAt >= todayStart` يُرجع صفراً دائماً بعد
 *   منتصف الليل المحلي — وهو بق حقيقي أوقعنا فيه اختبار الإحصائيات.
 *
 * الحل: نحسب إزاحة المنطقة الزمنية ونطرحها.
 */
export const startOfLocalDay = (timezone = 'UTC', now = new Date()) => {
  const midnightAsUtc = localDate(timezone, now);

  // الإزاحة الفعلية للمنطقة في هذه اللحظة (تراعي التوقيت الصيفي)
  const asLocal = new Date(
    now.toLocaleString('en-US', { timeZone: timezone }),
  );
  const asUtc = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
  const offsetMs = asLocal - asUtc;

  return new Date(midnightAsUtc.getTime() - offsetMs);
};

const daysBetween = (a, b) => Math.round((b - a) / 86_400_000);

/**
 * تسجيل نشاط اليوم وتحديث السلسلة.
 *
 * @param {string} userId
 * @param {object} [opts]
 * @param {object} [opts.tx] معاملة Prisma قائمة
 * @returns {Promise<{current:number, longest:number, isNewDay:boolean, wasBroken:boolean}>}
 */
export const touch = async (userId, { tx = null } = {}) => {
  const db = tx ?? prisma;

  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      timezone: true,
      currentStreak: true,
      longestStreak: true,
      lastActiveDate: true,
    },
  });

  if (!user) return null;

  const today = localDate(user.timezone);
  const last = user.lastActiveDate ? new Date(user.lastActiveDate) : null;

  // نشاط ثانٍ في اليوم نفسه — لا تغيير
  if (last && daysBetween(last, today) === 0) {
    return {
      current: user.currentStreak,
      longest: user.longestStreak,
      isNewDay: false,
      wasBroken: false,
    };
  }

  const gap = last ? daysBetween(last, today) : null;

  // متتالٍ = يوم واحد فقط · غير ذلك = انكسرت
  const isConsecutive = gap === 1;
  const current = isConsecutive ? user.currentStreak + 1 : 1;
  const wasBroken = last !== null && !isConsecutive;

  const longest = Math.max(current, user.longestStreak);

  await db.user.update({
    where: { id: userId },
    data: { currentStreak: current, longestStreak: longest, lastActiveDate: today },
  });

  return { current, longest, isNewDay: true, wasBroken };
};

/**
 * حالة السلسلة دون تعديل.
 * تكشف ما إذا كانت السلسلة "معلّقة" — أي لم يُسجَّل نشاط اليوم بعد.
 */
export const getStatus = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      timezone: true,
      currentStreak: true,
      longestStreak: true,
      lastActiveDate: true,
    },
  });

  if (!user) return null;

  const today = localDate(user.timezone);
  const last = user.lastActiveDate ? new Date(user.lastActiveDate) : null;
  const gap = last ? daysBetween(last, today) : null;

  return {
    current: gap !== null && gap > 1 ? 0 : user.currentStreak,
    longest: user.longestStreak,
    /** هل سُجّل نشاط اليوم؟ */
    activeToday: gap === 0,
    /** آخر فرصة للحفاظ عليها — نشاط الأمس مسجَّل واليوم لا */
    atRisk: gap === 1,
    lastActiveDate: last,
  };
};

export default { touch, getStatus, localDate, startOfLocalDay };
