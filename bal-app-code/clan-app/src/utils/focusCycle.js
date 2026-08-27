/**
 * ═══════════════════════════════════════════════════════════
 *  حساب طور دورة التركيز — مصدر واحد للحقيقة
 *
 *  ️ ليه اتفصل في ملف لوحده:
 *
 *  الحساب ده كان موجود في `focus.controller.js` بس، والتطبيق كان
 *  بيعد **محلياً** بـ `Timer.periodic` من غير ما يسأل السيرفر
 *  خالص. النتيجة: لو المستخدم قفل التطبيق أو الشاشة نامت، العدّاد
 *  بيقف — بيرجع يلاقي نفسه في «دقيقة 3 من التركيز» والسيرفر شايفه
 *  في «الراحة التانية». رقمين مختلفين لنفس الجلسة.
 *
 *  دلوقتي الحساب هنا، والكنترولر بيستدعيه، والتطبيق بيعمل نفس
 *  الحساب من `startedAt` اللي السيرفر بعتهاله — فالاتنين بيوصلوا
 *  لنفس النتيجة مهما حصل. وفيه اختبار بيقارن النسختين رقم برقم.
 *
 *  شكل الدورة (مثال: 25 تركيز / 5 راحة / 3 دورات):
 *
 *    │ تركيز 25 │ راحة 5 │ تركيز 25 │ راحة 5 │ تركيز 25 │
 *    0         25       30        55       60        85
 *
 *  ️ آخر دورة **بلا راحة** — لأن الراحة بعد آخر تركيز مالهاش
 *    معنى، الجلسة خلصت. ده اللي بيخلي الطول = cycles*(f+r) - r
 * ═══════════════════════════════════════════════════════════
 */

/**
 * الطور الحالي في دورة مخصصة.
 *
 * @param {object} p
 * @param {number} p.elapsedSec      الثواني من بداية الجلسة
 * @param {number} p.focusMin        دقايق التركيز في الدورة الواحدة
 * @param {number} p.restMin         دقايق الراحة
 * @param {number} p.cycles          عدد الدورات
 * @returns {{
 *   name: 'FOCUS'|'REST'|'DONE',
 *   cycleNumber: number,
 *   remainingSec: number,
 *   phaseTotalSec: number,
 *   totalRemainingSec: number,
 * }}
 */
export const phaseAt = ({ elapsedSec, focusMin, restMin, cycles }) => {
  const f = Math.max(1, Math.round(focusMin)) * 60;
  const r = Math.max(0, Math.round(restMin)) * 60;
  const n = Math.max(1, Math.round(cycles));

  const cycleLen = f + r;
  const totalSec = n * cycleLen - r; //  آخر دورة بلا راحة
  const t = Math.max(0, Math.round(elapsedSec));

  //  الجلسة خلصت — مش بنلفّ من الأول
  if (t >= totalSec) {
    return {
      name: 'DONE',
      cycleNumber: n,
      remainingSec: 0,
      phaseTotalSec: f,
      totalRemainingSec: 0,
    };
  }

  const cycleIdx = Math.min(Math.floor(t / cycleLen), n - 1);
  const inCycle = t - cycleIdx * cycleLen;
  const isLast = cycleIdx === n - 1;

  //  آخر دورة كلها تركيز — مفيش راحة بعدها
  if (isLast || inCycle < f) {
    return {
      name: 'FOCUS',
      cycleNumber: cycleIdx + 1,
      remainingSec: f - inCycle,
      phaseTotalSec: f,
      totalRemainingSec: totalSec - t,
    };
  }

  return {
    name: 'REST',
    cycleNumber: cycleIdx + 1,
    remainingSec: cycleLen - inCycle,
    phaseTotalSec: r,
    totalRemainingSec: totalSec - t,
  };
};

/** الطول الكامل للجلسة بالثواني (بلا راحة أخيرة) */
export const totalSeconds = ({ focusMin, restMin, cycles }) => {
  const f = Math.max(1, Math.round(focusMin)) * 60;
  const r = Math.max(0, Math.round(restMin)) * 60;
  const n = Math.max(1, Math.round(cycles));
  return n * (f + r) - r;
};

export default { phaseAt, totalSeconds };
