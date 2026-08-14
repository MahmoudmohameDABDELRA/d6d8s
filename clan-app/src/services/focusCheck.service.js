import crypto from 'node:crypto';

import prisma from '../config/prisma.js';
import { FOCUS_CHECK } from '../config/constants.js';
import * as streakService from './streak.service.js';

/**
 * ════════════════════════════════════════════════════════════
 *  محرك كشف الساهي (Focus Check Engine)
 * ════════════════════════════════════════════════════════════
 *
 * سؤال بسيط يظهر فجأة أثناء الجلسة. الإجابة الصحيحة السريعة
 * تعني أن المستخدم أمام الشاشة فعلاً.
 *
 * ️ التوقيت عشوائي عمداً:
 *    لو ظهر الاختبار كل 15 دقيقة بالضبط، لكتب أحدهم بوتاً
 *    يجيب تلقائياً عند الدقيقة 15 و 30 و 45.
 *    العشوائية داخل كل نافذة تجعل التنبؤ مستحيلاً.
 *
 * مثال لجلسة 60 دقيقة (نافذة 15 دقيقة):
 *    النافذة 1 (0-15)  → قد يظهر عند 12
 *    النافذة 2 (15-30) → قد يظهر عند 17
 *    النافذة 3 (30-45) → قد يظهر عند 41
 *    النافذة 4 (45-60) → قد يظهر عند 47
 */

/** عدد عشوائي آمن تشفيرياً — Math.random قابل للتنبؤ */
const randomInt = (min, max) =>
  min + (crypto.randomBytes(4).readUInt32BE(0) % (max - min + 1));

/**
 * موعد اختبار عشوائي داخل فترة تركيز واحدة.
 *
 * @param {number} blockStart بداية الفترة (دقيقة من بدء الجلسة)
 * @param {number} blockEnd   نهايتها
 * @returns {number|null}
 */
const timeInBlock = (blockStart, blockEnd) => {
  const { MIN_OFFSET, MAX_OFFSET_RATIO } = FOCUS_CHECK;
  const len = blockEnd - blockStart;

  if (len < FOCUS_CHECK.MIN_SESSION_FOR_CHECK) return null;

  const lo = blockStart + MIN_OFFSET;
  const hi = blockStart + Math.floor(len * MAX_OFFSET_RATIO);

  return hi > lo ? randomInt(lo, hi) : null;
};

/**
 * جدول الاختبارات — **اختبار واحد لكل فترة تركيز**.
 *
 * @param {number} plannedMin مدة الجلسة كاملة
 * @param {number} [blockMin] مدة فترة التركيز الواحدة.
 *        الافتراضي = الجلسة كلها (فترة واحدة ⇒ اختبار واحد).
 *        في النبض الجماعي تكون 30، وفي غرف المالك ما يحدده هو.
 * @returns {number[]}
 *
 * أمثلة:
 *   generateSchedule(30)      → [17]              فترة واحدة
 *   generateSchedule(60)      → [41]              فترة واحدة (مهما طالت)
 *   generateSchedule(90, 30)  → [12, 51, 98]      ثلاث فترات
 *   generateSchedule(300, 25) → 12 اختباراً       جلسة 5 ساعات
 */
export const generateSchedule = (plannedMin, blockMin = plannedMin) => {
  const size = Math.min(blockMin, plannedMin);
  if (size < FOCUS_CHECK.MIN_SESSION_FOR_CHECK) return [];

  const schedule = [];
  for (let start = 0; start < plannedMin; start += size) {
    const end = Math.min(start + size, plannedMin);
    const at = timeInBlock(start, end);
    if (at !== null) schedule.push(at);
  }

  return schedule;
};

/** سؤال حسابي بسيط — يُحل في ثانيتين ويصعب أتمتته بلا قراءة الشاشة */
export const generateQuestion = () => {
  const type = randomInt(0, 2);

  if (type === 0) {
    const a = randomInt(2, 9);
    const b = randomInt(2, 9);
    return { question: `${a} × ${b} = ؟`, answer: a * b };
  }

  if (type === 1) {
    const a = randomInt(10, 49);
    const b = randomInt(10, 49);
    return { question: `${a} + ${b} = ؟`, answer: a + b };
  }

  const a = randomInt(20, 60);
  const b = randomInt(1, 19);
  return { question: `${a} − ${b} = ؟`, answer: a - b };
};

/**
 * إنشاء اختبار جديد للجلسة.
 * يُستدعى من العميل عند بلوغ الدقيقة المجدولة.
 */
export const createCheck = async (sessionId, userId, atMinute) => {
  const { question, answer } = generateQuestion();

  return prisma.focusCheck.create({
    data: { sessionId, userId, question, answer, atMinute },
    select: { id: true, question: true, shownAt: true },
  });
};

/**
 * التحقق من الإجابة.
 * @returns {{correct:boolean, result:string, responseMs:number, tooSlow:boolean}}
 */
export const submitAnswer = async (checkId, userId, userAnswer) => {
  const check = await prisma.focusCheck.findFirst({
    where: { id: checkId, userId },
  });

  if (!check) return null;
  if (check.result !== 'PENDING') {
    return { alreadyAnswered: true, result: check.result };
  }

  const responseMs = Date.now() - new Date(check.shownAt).getTime();
  const tooSlow = responseMs > FOCUS_CHECK.TIMEOUT_MS;
  const correct = Number(userAnswer) === check.answer;

  const result = correct && !tooSlow ? 'PASSED' : 'FAILED';

  await prisma.focusCheck.update({
    where: { id: checkId },
    data: { result, responseMs, answeredAt: new Date() },
  });

  if (result === 'FAILED') {
    await prisma.focusSession.update({
      where: { id: check.sessionId },
      data: { failedChecks: { increment: 1 } },
    });
  }

  return { correct, result, responseMs, tooSlow };
};

/**
 * تعليم الاختبارات المنتهية مهلتها كفاشلة.
 * يُستدعى عند إنهاء الجلسة — العميل قد يكون أُغلق دون إجابة.
 */
export const expireStale = async (sessionId) => {
  const stale = await prisma.focusCheck.findMany({
    where: {
      sessionId,
      result: 'PENDING',
      shownAt: { lt: new Date(Date.now() - FOCUS_CHECK.TIMEOUT_MS) },
    },
    select: { id: true },
  });

  if (stale.length === 0) return 0;

  await prisma.focusCheck.updateMany({
    where: { id: { in: stale.map((s) => s.id) } },
    data: { result: 'FAILED', answeredAt: new Date() },
  });

  await prisma.focusSession.update({
    where: { id: sessionId },
    data: { failedChecks: { increment: stale.length } },
  });

  return stale.length;
};

// ════════════════════════════════════════════════
//  رصيد الطوارئ
// ════════════════════════════════════════════════

/**
 * استخدام رصيد طوارئ — مهلة بلا احتساب تشتت.
 * مرتان يومياً بتوقيت المستخدم المحلي.
 */
export const useEmergency = async (userId, sessionId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true, emergencyUsedToday: true, emergencyResetDate: true },
  });

  if (!user) return null;

  const today = streakService.localDate(user.timezone);
  const lastReset = user.emergencyResetDate
    ? new Date(user.emergencyResetDate)
    : null;

  // يوم جديد → تصفير الرصيد
  const isNewDay = !lastReset || lastReset.getTime() !== today.getTime();
  const used = isNewDay ? 0 : user.emergencyUsedToday;

  if (used >= FOCUS_CHECK.EMERGENCY_PER_DAY) {
    return {
      allowed: false,
      remaining: 0,
      message: `استنفدت رصيد الطوارئ اليوم (${FOCUS_CHECK.EMERGENCY_PER_DAY}/${FOCUS_CHECK.EMERGENCY_PER_DAY})`,
    };
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { emergencyUsedToday: used + 1, emergencyResetDate: today },
    }),
    prisma.focusSession.update({
      where: { id: sessionId },
      data: { emergencyUsed: { increment: 1 } },
    }),
    // الاختبارات المعلّقة تُعفى
    prisma.focusCheck.updateMany({
      where: { sessionId, result: 'PENDING' },
      data: { result: 'EMERGENCY', answeredAt: new Date() },
    }),
  ]);

  return {
    allowed: true,
    remaining: FOCUS_CHECK.EMERGENCY_PER_DAY - used - 1,
    graceMs: FOCUS_CHECK.EMERGENCY_GRACE_MS,
  };
};

export const getEmergencyStatus = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true, emergencyUsedToday: true, emergencyResetDate: true },
  });

  if (!user) return null;

  const today = streakService.localDate(user.timezone);
  const lastReset = user.emergencyResetDate
    ? new Date(user.emergencyResetDate)
    : null;
  const isNewDay = !lastReset || lastReset.getTime() !== today.getTime();
  const used = isNewDay ? 0 : user.emergencyUsedToday;

  return {
    used,
    remaining: FOCUS_CHECK.EMERGENCY_PER_DAY - used,
    total: FOCUS_CHECK.EMERGENCY_PER_DAY,
  };
};

export default {
  generateSchedule,
  generateQuestion,
  createCheck,
  submitAnswer,
  expireStale,
  useEmergency,
  getEmergencyStatus,
};
