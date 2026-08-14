import prisma from '../config/prisma.js';
import { SPARKS } from '../config/constants.js';
import { badRequest } from '../utils/AppError.js';

/**
 * ════════════════════════════════════════════════════════════
 *  خدمة الشرارات — المصدر الوحيد للحقيقة
 * ════════════════════════════════════════════════════════════
 *
 * ️ قاعدة صارمة:
 *    لا يجوز لأي ملف آخر أن يكتب في sparksBalance أو totalSparksEarned
 *    مباشرة. كل حركة تمر من هنا حصراً.
 *
 * السبب: لو وُزّعت الشرارات من خمسة أماكن، فأول خلل في الأرقام
 * لن تعرف مصدره أبداً. هنا كل حركة تُسجَّل مع الرصيد الناتج.
 *
 * التمييز المهم:
 *   sparksBalance      → ينقص بالشراء  (المحفظة)
 *   totalSparksEarned  → لا ينقص أبداً (لقياس الإنجاز والأوسمة)
 */

/**
 * منح شرارات للمستخدم.
 *
 * @param {string} userId
 * @param {object} options
 * @param {'FOCUS_SESSION'|'TASK_COMPLETED'|'ACHIEVEMENT_BONUS'|'PULSE_MULTIPLIER'|'ADMIN_ADJUSTMENT'} options.source
 * @param {number} options.baseAmount  المبلغ الأساسي
 * @param {number} [options.multiplier=1]  نادراً ما يُستخدم — المعدل مضمَّن في الحساب
 * @param {string} [options.refId]     معرّف السجل المسبب
 * @param {string} [options.note]
 * @param {object} [options.tx]        معاملة Prisma قائمة (اختياري)
 * @returns {Promise<{amount:number, balance:number, totalEarned:number}>}
 */
export const award = async (
  userId,
  { source, baseAmount, multiplier = 1, refId = null, note = null, tx = null },
) => {
  if (!Number.isFinite(baseAmount) || baseAmount < 0) {
    throw badRequest('قيمة الشرارات غير صالحة');
  }

  const amount = Math.round(baseAmount * multiplier);
  if (amount === 0) {
    // لا نُنشئ حركة بصفر — ضجيج بلا فائدة
    const u = await (tx ?? prisma).user.findUnique({
      where: { id: userId },
      select: { sparksBalance: true, totalSparksEarned: true },
    });
    return { amount: 0, balance: u.sparksBalance, totalEarned: u.totalSparksEarned };
  }

  const run = async (db) => {
    // الزيادة الذرّية تمنع فقدان التحديثات عند الطلبات المتزامنة
    const user = await db.user.update({
      where: { id: userId },
      data: {
        sparksBalance: { increment: amount },
        totalSparksEarned: { increment: amount },
      },
      select: { sparksBalance: true, totalSparksEarned: true },
    });

    await db.sparkTransaction.create({
      data: {
        userId,
        amount,
        source,
        refId,
        note,
        balanceAfter: user.sparksBalance,
      },
    });

    return {
      amount,
      balance: user.sparksBalance,
      totalEarned: user.totalSparksEarned,
    };
  };

  return tx ? run(tx) : prisma.$transaction(run);
};

/**
 * خصم شرارات (شراء).
 * يخصم من الرصيد فقط — الإجمالي التراكمي لا يتأثر أبداً،
 * وإلا لتراجع تقدّم المستخدم في الأوسمة كلما اشترى شيئاً.
 *
 * @returns {Promise<{amount:number, balance:number}>}
 */
export const spend = async (
  userId,
  { source, amount, refId = null, note = null, tx = null },
) => {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw badRequest('قيمة الخصم غير صالحة');
  }

  const run = async (db) => {
    const current = await db.user.findUnique({
      where: { id: userId },
      select: { sparksBalance: true },
    });

    if (!current) throw badRequest('المستخدم غير موجود');

    if (current.sparksBalance < amount) {
      throw badRequest(
        `رصيدك غير كافٍ. تحتاج ${amount} شرارة ولديك ${current.sparksBalance}`,
        'INSUFFICIENT_SPARKS',
      );
    }

    const user = await db.user.update({
      where: { id: userId },
      data: { sparksBalance: { decrement: amount } },
      select: { sparksBalance: true },
    });

    await db.sparkTransaction.create({
      data: {
        userId,
        amount: -amount, // سالب = صرف
        source,
        refId,
        note,
        balanceAfter: user.sparksBalance,
      },
    });

    return { amount: -amount, balance: user.sparksBalance };
  };

  return tx ? run(tx) : prisma.$transaction(run);
};

// ════════════════════════════════════════════════
//  حاسبات المكافآت
// ════════════════════════════════════════════════

/**
 * شرارات جلسة تركيز.
 * تُحسب من الدقائق التي تحقق منها الخادم — لا من إبلاغ العميل.
 *
 * @param {number} verifiedMinutes
 * @param {'SOLO'|'PULSE'} [type='SOLO']
 */
export const calcFocusSparks = (verifiedMinutes, type = 'SOLO') => {
  if (!Number.isFinite(verifiedMinutes) || verifiedMinutes <= 0) return 0;

  const rate =
    type === 'PULSE' ? SPARKS.PER_MINUTE_PULSE : SPARKS.PER_MINUTE_SOLO;

  // التقريب لأعلى: المستخدم لا يخسر كسور الشرارة
  return Math.ceil(verifiedMinutes * rate);
};

/** شرارات إتمام مهمة — ثابتة لكل المهام */
export const calcTaskSparks = () => SPARKS.TASK_COMPLETED;

// ════════════════════════════════════════════════
//  استعلامات
// ════════════════════════════════════════════════

export const getBalance = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { sparksBalance: true, totalSparksEarned: true },
  });
  return user
    ? { balance: user.sparksBalance, totalEarned: user.totalSparksEarned }
    : null;
};

export const getHistory = async (userId, { limit = 50, page = 1 } = {}) => {
  const take = Math.min(limit, 100);
  return prisma.sparkTransaction.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * take,
    take,
  });
};

/**
 * فحص سلامة: هل مجموع الحركات يطابق الرصيد المخزَّن؟
 * أداة تشخيص — تُستدعى يدوياً أو من لوحة إدارة.
 */
export const verifyIntegrity = async (userId) => {
  const [user, agg] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { sparksBalance: true, totalSparksEarned: true },
    }),
    prisma.sparkTransaction.aggregate({
      where: { userId },
      _sum: { amount: true },
    }),
  ]);

  const computed = agg._sum.amount ?? 0;
  const stored = user?.sparksBalance ?? 0;

  return {
    stored,
    computed,
    isValid: stored === computed,
    drift: stored - computed,
  };
};

export default {
  award,
  spend,
  calcFocusSparks,
  calcTaskSparks,
  getBalance,
  getHistory,
  verifyIntegrity,
};
