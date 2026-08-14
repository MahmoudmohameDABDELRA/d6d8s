/**
 * ═══════════════════════════════════════════════════════════
 *  حساب أوقات المهام — دوال خالصة بلا أي اعتماديات
 *
 *  ️ متفصّلة عن taskCheckIn.service عن قصد: دي حسابات زمنية
 *    بحتة، ولو فضلت جوه السيرفيس ما نقدرش نختبرها من غير ما
 *    نحمّل Prisma و Redis والطوابير كلها معاها.
 * ═══════════════════════════════════════════════════════════
 */

/**
 * لحظة انتهاء المهمة.
 *
 * الترتيب مقصود:
 *   1) scheduledEnd            — المصدر الصريح
 *   2) slotDate + endTime      — نظام البلوكات ("من 3 لـ 5")
 *   3) scheduledStart + مدة    — بداية معروفة ومدة مقدّرة
 *   4) slotDate + startTime + مدة
 *   5) dueDate                 — نقطة واحدة، آخر حل
 *
 * @returns {Date|null}
 */
export const resolveTaskEnd = (task) => {
  if (!task) return null;

  if (task.scheduledEnd) return new Date(task.scheduledEnd);

  if (task.slotDate && task.endTime) {
    const day = new Date(task.slotDate).toISOString().slice(0, 10);
    const d = new Date(`${day}T${task.endTime}:00.000Z`);
    if (!Number.isNaN(d.getTime())) return d;
  }

  if (task.scheduledStart && task.estimatedMin) {
    return new Date(
      new Date(task.scheduledStart).getTime() + task.estimatedMin * 60_000,
    );
  }

  if (task.slotDate && task.startTime && task.estimatedMin) {
    const day = new Date(task.slotDate).toISOString().slice(0, 10);
    const start = new Date(`${day}T${task.startTime}:00.000Z`);
    if (!Number.isNaN(start.getTime())) {
      return new Date(start.getTime() + task.estimatedMin * 60_000);
    }
  }

  if (task.dueDate) return new Date(task.dueDate);

  return null;
};

/**
 * ساعة محلية معيّنة في يوم معيّن → لحظة UTC حقيقية.
 *
 * ️ مهام الجبل مالهاش ساعة محددة، فسؤال «عملت إيه النهاردة؟»
 *    معاده المنطقي هو آخر اليوم **بتوقيت المستخدم**، مش UTC.
 *    الحساب بيراعي التوقيت الصيفي عبر Intl.
 *
 * @param {Date|string} dateLike  اليوم المطلوب
 * @param {string} timezone       IANA timezone
 * @param {number} hour           الساعة المحلية (0-23)
 * @returns {Date}
 */
export const localHourToUtc = (dateLike, timezone = 'Africa/Cairo', hour = 21) => {
  const dayStr = new Date(dateLike).toISOString().slice(0, 10);

  // إزاحة المنطقة الزمنية في اللحظة دي (بتراعي التوقيت الصيفي)
  const probe = new Date(`${dayStr}T12:00:00.000Z`);
  const asLocal = new Date(probe.toLocaleString('en-US', { timeZone: timezone }));
  const asUtc = new Date(probe.toLocaleString('en-US', { timeZone: 'UTC' }));
  const offsetMs = asLocal.getTime() - asUtc.getTime();

  const localTarget = new Date(
    `${dayStr}T${String(hour).padStart(2, '0')}:00:00.000Z`,
  );
  return new Date(localTarget.getTime() - offsetMs);
};

export default { resolveTaskEnd, localHourToUtc };
