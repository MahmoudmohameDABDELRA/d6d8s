/**
 * ════════════════════════════════════════════════════════════
 *  مُحقّقات المدخلات — رفض بدل تحويل
 * ════════════════════════════════════════════════════════════
 *
 *  ️ الثغرة التي يغلقها هذا الملف، مقيسة لا مفترضة:
 *
 *   النمط السائد في الشيفرة كان:
 *
 *       const trimmed = String(title ?? '').trim();
 *       if (!trimmed) throw badRequest('العنوان مطلوب');
 *
 *   يبدو آمناً وليس كذلك. `String()` **لا يرفض** — يحوّل:
 *
 *       String({})      → "[object Object]"   ← يمرّ 
 *       String(0)       → "0"                 ← يمرّ 
 *       String(false)   → "false"             ← يمرّ 
 *       String([1,2])   → "1,2"               ← يمرّ 
 *
 *   جرّبناه حيّاً: `POST /api/tasks {"title":{"$ne":null}}` رجع
 *   **201** وخُزّنت مهمة عنوانها `[object Object]`.
 *
 *   ليست ثغرة أمنية (Prisma يمنع الحقن) لكنها **فساد بيانات**:
 *   صفوف لا معنى لها تظهر للمستخدم ولا يمكنه تفسيرها، وتُرسَل
 *   للنموذج في السياق فيبني عليها كلاماً.
 *
 *  ️ المبدأ: **نرفض ما ليس نصاً، ولا نحوّله.**
 *
 *   العميل الذي يرسل كائناً حيث يُتوقَّع نص لديه خطأ برمجي —
 *   وإخفاؤه بالتحويل يؤجّل اكتشافه إلى أن تمتلئ القاعدة.
 */

import { badRequest } from './AppError.js';

/**
 * نصّ مطلوب.
 *
 * @param {unknown} value
 * @param {string}  field   اسم الحقل في رسالة الخطأ
 * @param {{min?:number, max?:number}} [opts]
 * @returns {string} النصّ بعد التشذيب
 */
export const requireString = (value, field, { min = 1, max = 10_000 } = {}) => {
  /**
   * ️ الفحص على النوع أولاً — قبل أي تحويل.
   *    عكس الترتيب يعني أننا نقبل ما حوّلناه بأنفسنا.
   */
  if (typeof value !== 'string') {
    throw badRequest(`${field} يجب أن يكون نصاً`, 'INVALID_TYPE');
  }

  const trimmed = value.trim();

  if (trimmed.length < min) {
    throw badRequest(
      min === 1 ? `${field} مطلوب` : `${field} أقصر من ${min} أحرف`,
      'TOO_SHORT',
    );
  }

  if (trimmed.length > max) {
    throw badRequest(`${field} أطول من ${max} حرفاً`, 'TOO_LONG');
  }

  return trimmed;
};

/** نصّ اختياري — يقبل الغياب ويرفض النوع الخاطئ */
export const optionalString = (value, field, opts = {}) => {
  if (value === undefined || value === null) return null;
  return requireString(value, field, { ...opts, min: 0 }) || null;
};

/**
 * عدد صحيح ضمن مدى.
 *
 * ️ `Number('')` = 0 و`Number(null)` = 0 و`Number([])` = 0.
 *    ثلاث قيم لا تعني صفراً تصير صفراً. لذا نفحص النوع لا القيمة.
 */
export const requireInt = (value, field, { min, max } = {}) => {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;

  if (typeof n !== 'number' || !Number.isInteger(n) || Number.isNaN(n)) {
    throw badRequest(`${field} يجب أن يكون رقماً صحيحاً`, 'INVALID_TYPE');
  }
  if (min != null && n < min) {
    throw badRequest(`${field} يجب ألا يقلّ عن ${min}`, 'OUT_OF_RANGE');
  }
  if (max != null && n > max) {
    throw badRequest(`${field} يجب ألا يزيد عن ${max}`, 'OUT_OF_RANGE');
  }

  return n;
};

export const optionalInt = (value, field, opts = {}) => {
  if (value === undefined || value === null) return null;
  return requireInt(value, field, opts);
};

/**
 * قيمة منطقية.
 *
 * ️ `Boolean('no')` = true — أي نصّ غير فارغ يصير صحيحاً،
 *    بما فيه "false" و"no" و"0". نقبل النوع المنطقي أو
 *    السلاسل الصريحة فقط.
 */
export const optionalBool = (value, field, fallback = false) => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;

  throw badRequest(`${field} يجب أن يكون true أو false`, 'INVALID_TYPE');
};

/** قيمة من مجموعة محددة */
export const requireEnum = (value, field, allowed) => {
  if (!allowed.includes(value)) {
    throw badRequest(
      `${field} غير صالح. المتاح: ${allowed.join(' · ')}`,
      'INVALID_ENUM',
    );
  }
  return value;
};

export const optionalEnum = (value, field, allowed, fallback = null) => {
  if (value === undefined || value === null) return fallback;
  return requireEnum(value, field, allowed);
};

/**
 * تاريخ صالح.
 *
 * ️ `new Date('كلام')` تُنتج Invalid Date ولا ترمي. تخزينها
 *    يُفشل الاستعلام لاحقاً بخطأ غامض بعيد عن مصدره.
 */
export const optionalDate = (value, field) => {
  if (value === undefined || value === null) return null;

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw badRequest(`${field} تاريخ غير صالح`, 'INVALID_DATE');
  }
  return d;
};

/** مصفوفة بحدّ أقصى */
export const optionalArray = (value, field, { max = 100 } = {}) => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw badRequest(`${field} يجب أن يكون قائمة`, 'INVALID_TYPE');
  }
  if (value.length > max) {
    throw badRequest(`${field} أطول من ${max} عنصراً`, 'TOO_LONG');
  }
  return value;
};

export default {
  requireString,
  optionalString,
  requireInt,
  optionalInt,
  optionalBool,
  requireEnum,
  optionalEnum,
  optionalDate,
  optionalArray,
};
