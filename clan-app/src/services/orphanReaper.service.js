/**
 * ════════════════════════════════════════════════════════════
 *  الكنس الدوري — تنظيف ما لا تنظّفه القاعدة
 * ════════════════════════════════════════════════════════════
 *
 *  ️ ما تغيّر: مسح الرسائل اليتيمة **حُذف ولم يعد له داعٍ**.
 *
 *   كان موجوداً لأن الرسائل في MongoDB والمحادثات في Postgres،
 *   بلا معاملة بينهما. حذف محادثة كان يترك رسائلها إلى الأبد.
 *
 *   بعد توحيد المخزنين صار القيد في القاعدة نفسها:
 *
 *       conversation Conversation @relation(..., onDelete: Cascade)
 *
 *   القاعدة تحذف الرسائل ذرّياً مع المحادثة. لا كانس، ولا نافذة
 *   عدم اتساق، ولا احتمال نسيان.
 *
 *   ️ الدرس: أفضل كانس هو الذي لا تحتاجه. عالجنا العرض ثم
 *      أزلنا السبب — فمات العلاج نفسه.
 *
 *  يبقى ما لا تستطيع القاعدة تنظيفه: صفوف صالحة بنيوياً لكنها
 *  خطأ منطقياً (جلسة عالقة) أو منتهية زمنياً (رمز قديم).
 *
 *  ️ لا يعمل في عملية الـ API — يُشغَّل من عامل BullMQ أو سكربت.
 */

import prisma from '../config/prisma.js';

/**
 * يُنهي جلسات التركيز المعلّقة.
 *
 * ️ جلسة تبقى ACTIVE للأبد إن انهار الخادم أو أغلق المستخدم
 *    التطبيق دون إنهائها. أثرها ليس مساحة فحسب:
 *
 *     · `aiPulse.checkEligibility` يرى `IN_FOCUS` فيصمت المرافق
 *       **إلى الأبد** لهذا المستخدم
 *     · بدء جلسة جديدة يُرفض بـ SESSION_ACTIVE
 *
 *    أي أن المستخدم يعلق في حالة لا مخرج منها.
 *
 * ️ المهلة = أطول جلسة ممكنة (240 دقيقة) + هامش. أقصر منها
 *    يُنهي جلسة حقيقية جارية.
 */
const MAX_SESSION_MIN = 240;
const GRACE_MIN = 60;

export const reapStaleSessions = async ({ dryRun = false } = {}) => {
  const cutoff = new Date(Date.now() - (MAX_SESSION_MIN + GRACE_MIN) * 60_000);

  const stale = await prisma.focusSession.findMany({
    where: { status: 'ACTIVE', startedAt: { lt: cutoff } },
    select: { id: true, userId: true, startedAt: true },
    take: 500,
  });

  if (dryRun || !stale.length) return { found: stale.length, closed: 0, stale };

  /**
   * ️ CANCELLED لا COMPLETED.
   *
   *  الأخيرة تمنح شرارات لجلسة لم يتحقق منها الخادم — مكافأة
   *  على مجهول تفسد اقتصاد التطبيق. و FAILED محجوزة لخرق الوضع
   *  الصارم، واستخدامها هنا يلوّث إحصاءات الانضباط.
   *
   *  ️ القيم المتاحة فعلاً: ACTIVE · COMPLETED · CANCELLED · FAILED
   *     (تحقّقنا من enum SessionStatus — لا توجد ABANDONED).
   */
  const res = await prisma.focusSession.updateMany({
    where: { id: { in: stale.map((s) => s.id) } },
    data: { status: 'CANCELLED', endedAt: new Date() },
  });

  return { found: stale.length, closed: res.count, stale };
};

/**
 * يمسح رموز التحديث المنتهية.
 *
 * ️ جدول RefreshToken ينمو بلا حدّ: كل تسجيل دخول يضيف صفاً
 *    ولا شيء يحذفه. مع 100 ألف مستخدم × عدة أجهزة × عدة أشهر
 *    يصير من أكبر الجداول — ويُفهرَس ويُنسَخ احتياطياً بلا فائدة.
 */
export const reapExpiredTokens = async ({ dryRun = false } = {}) => {
  const where = {
    OR: [
      { expiresAt: { lt: new Date() } },
      { revokedAt: { lt: new Date(Date.now() - 30 * 86_400_000) } },
    ],
  };

  if (dryRun) {
    return { found: await prisma.refreshToken.count({ where }), deleted: 0 };
  }

  const res = await prisma.refreshToken.deleteMany({ where });
  return { found: res.count, deleted: res.count };
};

/** يشغّل كل عمليات الكنس */
export const reapAll = async (opts = {}) => ({
  staleSessions: await reapStaleSessions(opts),
  expiredTokens: await reapExpiredTokens(opts),
});

export default { reapStaleSessions, reapExpiredTokens, reapAll };
