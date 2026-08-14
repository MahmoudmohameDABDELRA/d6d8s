/**
 * ════════════════════════════════════════════════════════════
 *  التسجيل المنظّم — الأساس الذي يجعل كل شيء آخر قابلاً للتحقق
 * ════════════════════════════════════════════════════════════
 *
 *  ️ الحالة قبل هذا الملف: 41 نداء `console.log/error` موزّعة
 *     على 12 ملفاً، وسطر واحد في `error.middleware.js` يبتلع
 *     كل خطأ برمجي بـ `console.error` بلا معرّف طلب ولا مستخدم
 *     ولا مسار.
 *
 *     النتيجة العملية: عند حدوث عطل في الإنتاج، الإشارة الوحيدة
 *     المتاحة هي شكوى مستخدم. لا يمكن ربط خطأ برمستخدمه، ولا
 *     تتبّع طلب عبر الطبقات، ولا قياس أي تحسين ادّعيناه.
 *
 *  ️ لماذا JSON لا نصّ ملوّن؟
 *
 *   السطر الملوّن يُقرأ بالعين ولا يُبحث فيه. JSON يدخل مباشرةً
 *   في Loki/CloudWatch/Datadog ويصير قابلاً للاستعلام:
 *   "كل الأخطاء 500 لهذا المستخدم في آخر ساعة" تصير سؤالاً
 *   لا بحثاً يدوياً. في التطوير نُجمّله بـ pino-pretty.
 *
 *  ️ التنقيح ليس رفاهية.
 *
 *   بلا `redact` سيُسجَّل `Authorization: Bearer eyJ...` في كل
 *   طلب — أي أن ملفات السجل تصير مخزناً لتوكنات صالحة. من يقرأ
 *   السجل يملك حسابات المستخدمين. القائمة أدناه إلزامية.
 */

import pino from 'pino';

import env from './env.js';

/**
 * المسارات المُنقَّحة.
 *
 * ️ نغطّي الصيغتين: `req.headers.x` و`headers.x` — لأن
 *    pino-http يضع الطلب تحت `req` بينما التسجيل اليدوي قد
 *    يمرّر الكائن مباشرةً. تغطية واحدة تترك ثغرة صامتة.
 */
const REDACT = [
  'req.headers.authorization',
  'req.headers.cookie',
  'headers.authorization',
  'headers.cookie',
  'password',
  'newPassword',
  'currentPassword',
  '*.password',
  'token',
  'accessToken',
  'refreshToken',
  '*.accessToken',
  '*.refreshToken',
  'idToken',
  'apiKey',
  'GEMINI_API_KEY',
  'DATABASE_URL',
];

const isProd = env.isProduction;
const isTest = process.env.NODE_ENV === 'test';

export const logger = pino({
  /**
   * ️ صامت في الاختبارات: 498 اختباراً كلٌّ منها يولّد سجلات
   *    يجعل الإخراج غير قابل للقراءة ويُخفي الفشل الحقيقي.
   */
  level: isTest ? 'silent' : process.env.LOG_LEVEL || (isProd ? 'info' : 'debug'),

  redact: { paths: REDACT, censor: '[REDACTED]' },

  /** ISO بدل الطابع الرقمي — يُقرأ في كل أداة تجميع */
  timestamp: pino.stdTimeFunctions.isoTime,

  base: {
    service: 'clan-app-api',
    /** ️ يميّز العمليات في الـ cluster — بدونه تختلط السجلات */
    pid: process.pid,
    env: env.nodeEnv,
  },

  formatters: {
    // "level":"error" بدل "level":50 — أوضح في الاستعلام
    level: (label) => ({ level: label }),
  },

  ...(isProd || isTest
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,service,env' },
        },
      }),
});

/**
 * مسجّل فرعي لكل نطاق.
 *
 * ️ يسمح بتصفية السجلات حسب النظام الفرعي:
 *    `{"scope":"game"}` يعزل مشاكل اللعبة عن الباقي فوراً.
 */
export const scoped = (scope) => logger.child({ scope });

export default logger;
