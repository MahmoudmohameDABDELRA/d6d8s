/**
 * ════════════════════════════════════════════════════════════
 *  تسجيل الطلبات + معرّف التتبّع
 * ════════════════════════════════════════════════════════════
 *
 *  ️ معرّف الطلب هو ما يحوّل سجلات متفرقة إلى **قصّة**.
 *
 *   بدونه: عشرة أسطر خطأ في نفس الثانية من عشرة مستخدمين
 *   مختلفين، ولا سبيل لمعرفة أيّها ينتمي لأيّ طلب.
 *
 *   معه: `grep <requestId>` يعطيك رحلة الطلب كاملة — من الوصول
 *   حتى الخطأ حتى الرد. وحين يشتكي مستخدم، الرد يحمل المعرّف
 *   في ترويسة `X-Request-Id` فيقودك مباشرةً لسطوره.
 *
 *  ️ نحترم المعرّف الوارد من الوكيل العكسي.
 *
 *   Nginx وCloudflare يولّدان معرّفاً بالفعل. توليد معرّف جديد
 *   يقطع السلسلة بين طبقة الحافة وطبقة التطبيق — فيصير تتبّع
 *   الطلب عبر البنية مستحيلاً.
 */

import crypto from 'node:crypto';

import pino from 'pino';
import pinoHttp from 'pino-http';

import logger from '../config/logger.js';

/**
 * مسارات لا تُسجَّل.
 *
 * ️ فحص الصحة يُنادى كل بضع ثوانٍ من موازن الحمل. تسجيله
 *    يغرق السجل بضجيج بلا معلومة — ويكلّف مالاً في أنظمة
 *    التجميع المدفوعة بالحجم.
 */
const SILENT = new Set(['/health', '/health/live', '/health/metrics', '/metrics']);

export const requestLogger = pinoHttp({
  logger,

  genReqId: (req, res) => {
    const incoming =
      req.headers['x-request-id'] ||
      req.headers['x-correlation-id'] ||
      req.headers['cf-ray'];

    const id = incoming || crypto.randomUUID();
    res.setHeader('X-Request-Id', id);
    return id;
  },

  /**
   * مستوى السجل حسب النتيجة.
   *
   * ️ 4xx تحذير لا خطأ: خطأ المستخدم ليس عطلاً في النظام.
   *    خلطهما يجعل لوحة الأخطاء عديمة الفائدة — تمتلئ بمحاولات
   *    دخول خاطئة فتُخفي العطل الحقيقي.
   */
  customLogLevel: (req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    if (SILENT.has(req.url?.split('?')[0])) return 'silent';
    return 'info';
  },

  customSuccessMessage: (req, res) =>
    `${req.method} ${req.url} → ${res.statusCode}`,

  customErrorMessage: (req, res, err) =>
    `${req.method} ${req.url} → ${res.statusCode} · ${err?.message}`,

  /**
   * ️ نُسجّل الحد الأدنى المفيد لا الطلب كله.
   *
   *  الترويسات الكاملة تحمل التوكن (منقَّح، لكن لا داعي لحمله
   *  أصلاً)، والجسم قد يحمل بيانات شخصية. نأخذ ما يلزم للتشخيص:
   *  الطريقة والمسار والمستخدم وعنوانه.
   */
  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      /** يُملأ لاحقاً بعد المصادقة — انظر attachUser */
      userId: req.raw?.user?.userId,
      ip: req.raw?.ip,
    }),
    res: (res) => ({ statusCode: res.statusCode }),
    err: pino.stdSerializers.err,
  },
});

/**
 * يربط المستخدم بالسجل بعد المصادقة.
 *
 * ️ يجب أن يأتي **بعد** authenticateToken: قبله يكون req.user
 *    غير معرّف فلا يُسجَّل شيء. وضعه بعد المصادقة مباشرةً في
 *    app.js يغطّي كل المسارات المحمية بسطر واحد.
 */
export const attachUserToLog = (req, res, next) => {
  if (req.user?.userId && req.log) {
    req.log = req.log.child({ userId: req.user.userId });
  }
  next();
};

export default requestLogger;
