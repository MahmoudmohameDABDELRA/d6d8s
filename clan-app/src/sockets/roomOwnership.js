/**
 * ════════════════════════════════════════════════════════════
 *  ملكية الغرفة — العملية الواحدة التي تُشغّل الحلقة
 * ════════════════════════════════════════════════════════════
 *
 *  ️ الثغرة التي يتركها Redis Adapter وحده:
 *
 *   الـ adapter يوزّع **الرسائل** بين العمليات، فينجح
 *   `io.to(room).emit(...)` عبر الخوادم. لكنه **لا يوزّع
 *   الحلقة**. لو شغّلنا خمسين عملية خلف موازن حِمل، وانضمّ
 *   لاعبان لغرفة عبر عمليتين مختلفتين، فكلتاهما تُنشئ
 *   `setInterval` للغرفة نفسها — فتُحسب الحركة مرتين،
 *   ويُرسل تحديثان في التِك الواحد، ويتحرّك الثعبان بضعف
 *   السرعة بلا سبب ظاهر.
 *
 *   هذا الخطأ صامت: يعمل تماماً على خادم واحد، وينكسر
 *   بشكل يصعب تشخيصه أول ما تُضاعف العمليات.
 *
 *  الحل: قفل في Redis. أول عملية تحجزه تملك الغرفة وتشغّل
 *  الحلقة وحدها. البقية تكتفي باستقبال الأحداث وبثّها.
 *
 *  ️ القفل **مؤقّت لا دائم**. لو ماتت العملية المالكة فجأة
 *     (نشر، تعطّل، إنهاء) وبقي القفل للأبد، تجمّدت الغرفة
 *     ولا أحد يحرّكها. لذا ينتهي تلقائياً ويُجدَّد دورياً
 *     ما دامت المالكة حيّة — نمط lease لا mutex.
 */

import crypto from 'node:crypto';

import redisClient from '../config/redis.js';

/** معرّف فريد لهذه العملية — يميّز مالك القفل */
export const PROCESS_ID = `${process.pid}-${crypto.randomBytes(4).toString('hex')}`;

/**
 * مدة الحجز.
 *
 * ️ 15 ثانية موازنة مقصودة: أقصر منها يعني تجديداً متكرراً
 *    يُرهق Redis، وأطول منها يعني تجميد الغرفة مدةً أطول بعد
 *    موت المالكة. التجديد كل 5 ثوانٍ يترك محاولتين للفشل.
 */
const LEASE_TTL_SEC = 15;
const RENEW_MS = 5_000;

const key = (roomId) => `game:owner:${roomId}`;

const ready = () => {
  try {
    return Boolean(redisClient?.isOpen);
  } catch {
    return false;
  }
};

/**
 * ️ حين يسقط Redis نعمل **كمالك دائم**.
 *
 *  السبب: بلا Redis نحن على عملية واحدة حتماً (لا تنسيق
 *  ممكن أصلاً)، فرفض الملكية يعني توقّف كل الألعاب.
 *  الفشل المفتوح هنا أسلم من الفشل المغلق.
 */
const localOwned = new Set();

/**
 * يحاول امتلاك الغرفة.
 *
 * @returns {Promise<boolean>} هل نملكها؟
 */
export const acquire = async (roomId) => {
  if (!ready()) {
    localOwned.add(roomId);
    return true;
  }

  try {
    // NX = لا تكتب إن كان المفتاح موجوداً — الذرّية هنا هي الضمان
    const ok = await redisClient.set(key(roomId), PROCESS_ID, {
      NX: true,
      EX: LEASE_TTL_SEC,
    });
    if (ok) return true;

    // ربما نملكها من قبل (إعادة استدعاء بعد انقطاع)
    const holder = await redisClient.get(key(roomId));
    return holder === PROCESS_ID;
  } catch {
    localOwned.add(roomId);
    return true;
  }
};

/**
 * يجدّد الحجز — يُستدعى دورياً ما دامت الحلقة تعمل.
 *
 * ️ لا نجدّد إلا إن كنّا المالك فعلاً. لو انتهى القفل وأخذته
 *    عملية أخرى، فالتجديد الأعمى يسرقه منها وتصير غرفتان
 *    تعملان معاً — وهو الخطأ نفسه الذي نحاول تجنّبه.
 */
export const renew = async (roomId) => {
  if (!ready()) return localOwned.has(roomId);

  try {
    const holder = await redisClient.get(key(roomId));
    if (holder !== PROCESS_ID) return false;

    await redisClient.expire(key(roomId), LEASE_TTL_SEC);
    return true;
  } catch {
    return true; // لا نُسقط لعبة جارية بسبب خلل شبكة عابر
  }
};

/**
 * يتنازل عن الملكية — عند إغلاق الغرفة أو إيقاف الخادم.
 *
 * ️ نتحقق من الهوية قبل الحذف: حذف قفل عملية أخرى يُنتج
 *    مالكين متزامنين.
 */
export const release = async (roomId) => {
  localOwned.delete(roomId);
  if (!ready()) return;

  try {
    const holder = await redisClient.get(key(roomId));
    if (holder === PROCESS_ID) await redisClient.del(key(roomId));
  } catch {
    /* ينتهي بـ TTL على أي حال */
  }
};

/** هل نملكها الآن؟ — قراءة بلا تعديل */
export const owns = async (roomId) => {
  if (!ready()) return localOwned.has(roomId);
  try {
    return (await redisClient.get(key(roomId))) === PROCESS_ID;
  } catch {
    return localOwned.has(roomId);
  }
};

export const RENEW_INTERVAL_MS = RENEW_MS;
export const LEASE_SECONDS = LEASE_TTL_SEC;

export default { PROCESS_ID, acquire, renew, release, owns, RENEW_INTERVAL_MS };
