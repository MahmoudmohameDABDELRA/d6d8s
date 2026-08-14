/**
 * ════════════════════════════════════════════════════════════
 *  الكانس — من يستحق نبضة الآن؟
 * ════════════════════════════════════════════════════════════
 *
 *  يعمل كل 10 دقائق. لا يعني أن كل مستخدم يُنبَّه كل 10 دقائق —
 *  بل أننا نسأل كل 10 دقائق: "هل حان وقت أحد؟"
 *
 *  التأخير الفعلي يأتي من باقة كل مستخدم:
 *    HIGH 30د · PRO 60د · BASIC 120د · FREE 300د
 *
 *  ️ لماذا 10 دقائق وليس 5 ساعات كما وُصف أولاً؟
 *
 *   الدورة الثابتة تسأل عن درس الساعة 16:00 في الساعة 21:00.
 *   الكنس المتكرر + تأخير الباقة يجعل السؤال يصل في وقته:
 *   مستخدم HIGH يُسأل 16:30، والمجاني 21:00 — وهذا هو الفارق
 *   المُباع بين الباقات، لا رقم على صفحة تسعير.
 *
 *  ️ لا يُنادى النموذج هنا إطلاقاً. الكانس يكتفي بالترشيح،
 *     والتوليد يحدث في مسار /pulse. الفصل مقصود: لو انفجر
 *     النموذج لا يتعطّل الكانس، ولو تعطّل الكانس تظل الواجهة
 *     قادرة على طلب النبضة يدوياً.
 */

import prisma from '../config/prisma.js';
import { PLANS, resolvePlan } from '../config/aiPlans.js';
import * as aiPulse from './aiPulse.service.js';
import { scoped } from '../config/logger.js';

const log = scoped('sweeper');

/** كل كم يمسح؟ */
const SWEEP_INTERVAL_MS = 10 * 60_000;

/**
 * أقصى مستخدمين نفحصهم في الجولة الواحدة.
 *
 * ️ سقف مقصود: بلا حدّ سيقرأ الكانس كل مستخدمي القاعدة كل
 *    10 دقائق. مع 10 آلاف مستخدم = 60 ألف قراءة/ساعة بلا داعٍ.
 *    نفحص الأنشط أولاً — من لم يفتح التطبيق منذ أسبوع لا يهمّه
 *    سؤال عن مهمة أمس.
 */
const BATCH_SIZE = 200;

let timer = null;

/**
 * جولة كنس واحدة.
 *
 * @param {(userId:string, tz:number)=>Promise<any>} onDue
 *        ما يُفعل بالمستحق — حُقِن ليبقى الكانس قابلاً للاختبار
 *        بلا نداء نموذج حقيقي.
 * @returns {{scanned:number, due:string[]}}
 */
export const sweepOnce = async (onDue) => {
  const activeSince = new Date(Date.now() - 7 * 86_400_000);

  const users = await prisma.user.findMany({
    where: {
      onboarded: true,
      isBanned: false,
      OR: [{ lastSeen: { gte: activeSince } }, { lastSeen: null }],
    },
    select: { id: true, timezone: true },
    orderBy: { lastSeen: 'desc' },
    take: BATCH_SIZE,
  });

  const due = [];

  for (const u of users) {
    try {
      /**
       * ️ نمرّر 0 كإزاحة: `timezone` نصّ IANA ("Africa/Cairo")
       *    لا رقم دقائق. تحويله يحتاج Intl وهو مكلف في حلقة.
       *    الواجهة ترسل الإزاحة الحقيقية عند طلب النبضة.
       */
      const check = await aiPulse.checkEligibility(u.id, 0);
      if (!check.eligible) continue;

      due.push(u.id);
      if (onDue) await onDue(u.id, 0, check);
    } catch {
      // مستخدم واحد لا يُسقط الجولة
    }
  }

  return { scanned: users.length, due };
};

/**
 * يبدأ الكانس الدوري.
 *
 * ️ `unref()` مقصود: المؤقّت لا يمنع إغلاق العملية.
 *    بدونه لا يُنهي Node نفسه عند SIGTERM فيعلق النشر.
 */
export const start = (onDue) => {
  if (timer) return timer;

  timer = setInterval(() => {
    sweepOnce(onDue).catch((e) =>
      log.error(' فشل كنس النبض:', e.message),
    );
  }, SWEEP_INTERVAL_MS);

  timer.unref?.();
  log.info(` كانس النبض يعمل كل ${SWEEP_INTERVAL_MS / 60_000} دقيقة`);
  return timer;
};

export const stop = () => {
  if (timer) clearInterval(timer);
  timer = null;
};

export default { sweepOnce, start, stop, SWEEP_INTERVAL_MS, PLANS, resolvePlan };
