// ️ هذا الملف يجب أن يُستورد أولاً قبل أي ملف يقرأ process.env
import 'dotenv/config';

/**
 * في ESM كل عبارات الـ import تُنفَّذ قبل جسم الملف.
 * لذلك كتابة dotenv.config() في منتصف server.js كانت تتأخر
 * عن تحميل الكنترولرات => JWT secrets تصبح undefined.
 * الحل: تحميل dotenv داخل هذا الملف واستيراده في أول سطر بـ server.js.
 */

const required = [
  'DATABASE_URL',
  'REDIS_URL',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
];

// ⚠️ MONGO_URI أُزيل من الإلزاميات: التطبيق runtime لا يستخدم MongoDB
// بعد توحيد المخزنين (الرسائل انتقلت إلى PostgreSQL).
// يبقى المتغير اختيارياً لاختبار التطوير فقط (test/real.test.mjs).

const missing = required.filter((key) => !process.env[key]?.trim());

if (missing.length > 0) {
  console.error(' متغيرات البيئة التالية مفقودة في ملف .env:');
  missing.forEach((key) => console.error(`   - ${key}`));
  process.exit(1);
}

const isProduction = process.env.NODE_ENV === 'production';

// في الإنتاج نمنع تشغيل السيرفر بأسرار افتراضية أو ضعيفة
if (isProduction) {
  const weak = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'].filter(
    (key) =>
      process.env[key].includes('CHANGE_THIS') || process.env[key].length < 32,
  );

  if (weak.length > 0) {
    console.error(
      ` أسرار غير آمنة في الإنتاج: ${weak.join(', ')} — استخدم قيمة عشوائية 32 حرفاً على الأقل.`,
    );
    console.error('   ولّدها بالأمر: openssl rand -base64 48');
    process.exit(1);
  }
}

if (process.env.JWT_ACCESS_SECRET === process.env.JWT_REFRESH_SECRET) {
  console.error(' JWT_ACCESS_SECRET و JWT_REFRESH_SECRET يجب أن يكونا مختلفين.');
  process.exit(1);
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction,
  port: Number(process.env.PORT) || 3000,

  databaseUrl: process.env.DATABASE_URL,
  mongoUri: process.env.MONGO_URI,
  redisUrl: process.env.REDIS_URL,

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresInDays: Number(process.env.JWT_REFRESH_EXPIRES_DAYS) || 7,
  },

  corsOrigins: (
    process.env.CORS_ORIGINS ||
    'http://localhost:3000,http://localhost:5173,http://localhost:8081'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),

  trustProxy: process.env.TRUST_PROXY === 'true',

  google: {
    get clientId() {
      return process.env.GOOGLE_CLIENT_ID || '';
    },
    get audiences() {
      return (process.env.GOOGLE_CLIENT_IDS || process.env.GOOGLE_CLIENT_ID || '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    },
  },

  /**
   * ️ مسار البريد وكلمة المرور محفوظ لكنه معطَّل افتراضياً.
   * لتفعيله احتياطياً: ENABLE_EMAIL_AUTH=true في .env
   * لا تحذف الكود — هو خطة الطوارئ لو تعطّل Google OAuth.
   */
  enableEmailAuth: process.env.ENABLE_EMAIL_AUTH === 'true',

  // ── Gemini ──
  // بلا مفتاح يبقى قسم المرافق معطّلاً بلطف بدل أن ينهار
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3-flash-preview',
  geminiMaxTokens: Number(process.env.GEMINI_MAX_TOKENS) || 400,

  // ── Prometheus Metrics Protection ──
  metricsToken: process.env.METRICS_TOKEN || '',

  // ── Task Check-In (POST /api/task-checkin) ──
  // سرّ مشترك يثبت أن الطلب جاي من تطبيقنا (App Identity) مش من سكربت عشوائي.
  // التطبيق بيحمله في البناء عبر --dart-define=APP_SHARED_SECRET=...
  // لو مش مضبوط: الـ endpoint يرجع 503 بأمان بدل ما يشتغل بلا حماية.
  appSharedSecret: process.env.APP_SHARED_SECRET || '',
};

export default env;
