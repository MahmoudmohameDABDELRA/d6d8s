/**
 * ═══════════════════════════════════════════════════════════
 *  تحديد المنطقة الزمنية للمستخدم — بلا تخمين
 *
 *  ️ ليه الملف ده موجود، والمشكلة اللي بيحلها بالظبط:
 *
 *  كل حسابات اليوم المحلي في السيرفر (streak.service, taskTiming,
 *  analytics, alarm) بتعدّي `user.timezone` لـ `Intl`. و`Intl`
 *  **بيرمي RangeError** على أي حاجة مش IANA صحيحة — مش بيرجّع
 *  قيمة افتراضية. اتأكدنا بالتشغيل:
 *
 *      localDate('Africa/Cairo')          → 2026-08-27T00:00:00Z
 *      localDate('EET')                   → 2026-08-27T00:00:00Z
 *      localDate('India Standard Time')   → RangeError ❌
 *      localDate('Eastern Standard Time') → RangeError ❌
 *
 *  والمصيبة إن `DateTime.now().timeZoneName` في Dart **مبيرجّعش
 *  IANA**. بيرجّع اختصار زي `EET` أو `CEST`، وعلى ويندوز بيرجّع
 *  الاسم الكامل بتاع ويندوز زي `India Standard Time`. يعني الحل
 *  البديهي — «سطر واحد: ابعت timeZoneName» — كان هيحوّل ثغرة
 *  «كل الناس بتوقيت القاهرة» لثغرة أسوأ بكتير: **500 على كل
 *  مستخدم هندي أو أمريكي**، لأن أول نداء لـ `/tasks` هيرمي.
 *
 *  الحل هنا مبني على الحاجة الوحيدة اللي Dart بيرجّعها مضمونة
 *  على كل المنصات: `DateTime.now().timeZoneOffset` — رقم دقايق.
 *
 *  الترتيب:
 *    ١) لو التطبيق بعت IANA صحيحة (`Intl` قبلها) → نستخدمها.
 *    ٢) وإلا نستنتج من الأوفست: بنقارن أوفست يناير ويوليو
 *       (عشان نمسك التوقيت الصيفي) بكل مناطق IANA، وناخد أول
 *       واحدة مطابقة. المنطقة المستنتَجة ممكن تكون اسمها مختلف
 *       (أثينا بدل القاهرة) لكن **حسابها متطابق تماماً** —
 *       وده اللي يهمنا: منتصف الليل المحلي وساعة الاطمئنان.
 *    ٣) وإلا القاهرة (الافتراضي القديم).
 * ═══════════════════════════════════════════════════════════
 */

const DEFAULT_TZ = 'Africa/Cairo';

/** كل مناطق IANA اللي بيعرفها الـ runtime */
const allZones = () => {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return [];
  }
};

/**
 * أوفست منطقة معيّنة في لحظة معيّنة، بالدقايق (شرق جرينتش موجب).
 * بنقراه من `longOffset` مش بحساب فروق تواريخ — ده بيراعي
 * المناطق نص الساعة (الهند +330) والربع (نيبال +345).
 */
const offsetOf = (timeZone, at) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'longOffset',
  }).formatToParts(at);

  const label = parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(label);
  if (!m) return 0; // "GMT" بلا رقم = صفر
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
};

/** لحظتان بعيدتان عشان نمسك التوقيت الصيفي */
const winterProbe = () => new Date(Date.UTC(new Date().getUTCFullYear(), 0, 15));
const summerProbe = () => new Date(Date.UTC(new Date().getUTCFullYear(), 6, 15));

/** ذاكرة: "شتاء/صيف" → أول منطقة مطابقة */
let offsetIndex = null;

const buildIndex = () => {
  const index = new Map();
  const jan = winterProbe();
  const jul = summerProbe();

  for (const zone of allZones()) {
    try {
      const key = `${offsetOf(zone, jan)}/${offsetOf(zone, jul)}`;
      if (!index.has(key)) index.set(key, zone);
    } catch {
      /* منطقة الـ runtime مش عارفها — نتخطاها */
    }
  }
  return index;
};

/**
 * هل الاسم ده منطقة IANA يقبلها `Intl`؟
 * ️ بنجرّب بالفعل بدل ما نطابق قايمة — `Intl` هو الحَكَم،
 *    وهو اللي هيرمي بعدين لو غلط.
 */
export const isValidTimezone = (tz) => {
  if (!tz || typeof tz !== 'string') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
};

/**
 * منطقة IANA لها نفس أوفست الشتاء والصيف.
 *
 * @param {number} januaryOffsetMin  أوفست يناير بالدقايق
 * @param {number} julyOffsetMin     أوفست يوليو بالدقايق
 * @returns {string|null}
 */
export const zoneForOffsets = (januaryOffsetMin, julyOffsetMin) => {
  if (!Number.isFinite(januaryOffsetMin)) return null;
  offsetIndex ??= buildIndex();

  const july = Number.isFinite(julyOffsetMin) ? julyOffsetMin : januaryOffsetMin;

  // مطابقة تامة (نفس سلوك التوقيت الصيفي)
  const exact = offsetIndex.get(`${januaryOffsetMin}/${july}`);
  if (exact) return exact;

  // مفيش؟ يبقى المستخدم بعت أوفست لحظته الحالية بس.
  // ندوّر على أي منطقة أوفستها الحالي مطابق.
  const now = new Date();
  for (const zone of allZones()) {
    try {
      if (offsetOf(zone, now) === januaryOffsetMin) return zone;
    } catch {
      /* تجاهل */
    }
  }
  return null;
};

/**
 * القرار النهائي: إيه المنطقة اللي نحفظها للمستخدم؟
 *
 * @param {object} input
 * @param {string} [input.timezone]            اسم IANA لو التطبيق عرف يجيبه
 * @param {number} [input.utcOffsetMinutes]    أوفست اللحظة دي (مضمون من Dart)
 * @param {number} [input.januaryOffsetMinutes]
 * @param {number} [input.julyOffsetMinutes]
 * @returns {{ timezone: string, source: 'iana'|'offset'|'default' }}
 */
export const resolveTimezone = ({
  timezone,
  utcOffsetMinutes,
  januaryOffsetMinutes,
  julyOffsetMinutes,
} = {}) => {
  //  ١) اسم صريح وصحيح — أدق حاجة ممكنة
  if (isValidTimezone(timezone)) {
    return { timezone, source: 'iana' };
  }

  //  ٢) استنتاج من الأوفست
  const jan = Number.isFinite(januaryOffsetMinutes)
    ? januaryOffsetMinutes
    : Number(utcOffsetMinutes);

  const inferred = zoneForOffsets(
    jan,
    Number.isFinite(julyOffsetMinutes) ? julyOffsetMinutes : undefined,
  );
  if (inferred) return { timezone: inferred, source: 'offset' };

  //  ٣) الافتراضي
  return { timezone: DEFAULT_TZ, source: 'default' };
};

export default { resolveTimezone, isValidTimezone, zoneForOffsets };
