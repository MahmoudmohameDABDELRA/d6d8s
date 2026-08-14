import { PULSE } from '../config/constants.js';

/**
 * ════════════════════════════════════════════════════════════
 *  خدمة النبض الجماعي
 * ════════════════════════════════════════════════════════════
 *
 * دورة 120 دقيقة تبدأ كل ساعة زوجية بتوقيت UTC.
 * الطور الحالي محسوب رياضياً من الساعة — لا cron ولا مجدول.
 *
 * الأثر: كل مستخدم في العالم يرى الطور نفسه في اللحظة نفسها،
 * والخادم لا يحمل أي وظيفة دورية لهذا الغرض.
 */

/** بداية الدورة الحالية (أقرب ساعة زوجية سابقة بتوقيت UTC) */
export const getCurrentCycleStart = (now = new Date()) => {
  const d = new Date(now);
  d.setUTCMinutes(0, 0, 0);
  d.setUTCHours(Math.floor(d.getUTCHours() / 2) * 2);
  return d;
};

/** بداية الدورة التالية */
export const getNextCycleStart = (now = new Date()) => {
  const start = getCurrentCycleStart(now);
  return new Date(start.getTime() + PULSE.CYCLE_MIN * 60_000);
};

/**
 * الحالة الكاملة للنبض في لحظة معيّنة.
 * @returns {{
 *   phase: string, isFocus: boolean, isLobby: boolean,
 *   minutesIntoCycle: number, minutesIntoPhase: number,
 *   remainingInPhase: number,
 *   focusBlock: number|null, cycleStart: Date, nextCycleStart: Date,
 *   canReserve: boolean, canJoin: boolean
 * }}
 */
export const getPulseState = (now = new Date()) => {
  const cycleStart = getCurrentCycleStart(now);
  const minutesIntoCycle = Math.floor((now - cycleStart) / 60_000);

  const current =
    PULSE.PHASES.find(
      (p) => minutesIntoCycle >= p.start && minutesIntoCycle < p.end,
    ) ?? PULSE.PHASES[PULSE.PHASES.length - 1];

  const minutesIntoPhase = minutesIntoCycle - current.start;
  const remainingInPhase = current.end - minutesIntoCycle;

  // ترتيب فترة التركيز الحالية (1 أو 2 أو 3)
  const focusBlock = current.isFocus
    ? PULSE.PHASES.filter((p) => p.isFocus && p.start <= current.start).length
    : null;

  return {
    phase: current.phase,
    isFocus: current.isFocus,
    isLobby: current.phase === 'LOBBY',
    minutesIntoCycle,
    minutesIntoPhase,
    remainingInPhase,
    focusBlock,
    cycleStart,
    nextCycleStart: new Date(cycleStart.getTime() + PULSE.CYCLE_MIN * 60_000),

    /** الحجز متاح في اللوبي فقط */
    canReserve: current.phase === 'LOBBY',
    /** الدخول متاح في اللوبي فقط — بعد البدء التركيز مقدّس */
    canJoin: current.phase === 'LOBBY',
  };
};

/** الجدول الكامل للدورة الحالية — لعرضه في الواجهة */
export const getCycleSchedule = (now = new Date()) => {
  const cycleStart = getCurrentCycleStart(now);
  return PULSE.PHASES.map((p) => ({
    phase: p.phase,
    isFocus: p.isFocus,
    startsAt: new Date(cycleStart.getTime() + p.start * 60_000),
    endsAt: new Date(cycleStart.getTime() + p.end * 60_000),
    durationMin: p.end - p.start,
  }));
};

/**
 * هل هذا الوقت داخل فترة راحة؟
 * يُستخدم لبوابة قسم الدوبامين — الفيديوهات في الراحة فقط.
 *
 * ملاحظة: الراحات هما BREAK_1 و BREAK_2 فقط (اللوبي ليس راحة).
 * آخر راحة هي BREAK_2 عند الدقيقة 75-85 — وبعدها تركيز ثم لوبي.
 */
export const isBreakTime = (now = new Date()) => {
  const s = getPulseState(now);
  return !s.isFocus && !s.isLobby;
};

export default {
  getCurrentCycleStart,
  getNextCycleStart,
  getPulseState,
  getCycleSchedule,
  isBreakTime,
};
