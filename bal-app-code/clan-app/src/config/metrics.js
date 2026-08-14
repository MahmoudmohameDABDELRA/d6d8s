/**
 * ════════════════════════════════════════════════════════════
 *  المقاييس — تحويل "أظنه أسرع" إلى رقم
 * ════════════════════════════════════════════════════════════
 *
 *  ️ كل تحسين ادّعيناه حتى الآن قِيس **مرة واحدة على جهاز
 *     التطوير**. الكاش 5.1×، الحلقة 6.3×، الحزمة 142× — كلها
 *     قياسات معملية. لا شيء يخبرنا بما يحدث تحت مستخدمين
 *     حقيقيين، ولا شيء ينبّهنا حين يتراجع.
 *
 *  ️ أربعة مقاييس فقط. لماذا لا عشرون؟
 *
 *   كل مقياس له تكلفة: ذاكرة، حجم استخراج، وأهم من ذلك **انتباه**.
 *   لوحة فيها أربعون رسماً لا يقرؤها أحد. الأربعة هنا تجيب على
 *   الأسئلة الأربعة التي تُطرح فعلاً وقت العطل:
 *
 *     · هل الطلبات بطيئة؟        → http_request_duration
 *     · هل ترجع أخطاء؟           → عدّاد ضمن الهيستوجرام
 *     · هل القاعدة هي السبب؟     → db_query_duration
 *     · كم متصل الآن؟            → ws_connections
 *
 *  ️ التصنيف بالمسار المُنمَّط لا الخام.
 *
 *   `/api/tasks/9f3a...` كتسمية يعني مقياساً جديداً لكل مهمة —
 *   وهو انفجار في العدد (cardinality explosion) يُسقط Prometheus
 *   نفسه. نستبدل المعرّفات بـ `:id` فيصير كل المسار مقياساً واحداً.
 */

import client from 'prom-client';

export const registry = new client.Registry();

/**
 * مقاييس العملية الافتراضية.
 *
 * ️ تشمل زمن حلقة الأحداث (event loop lag) — وهو أهم مؤشر
 *    منفرد في Node: ارتفاعه يعني أن شيئاً يحجب الحلقة، وهو
 *    بالضبط الخطر الذي حذّرنا منه في الكانس والسويبر.
 */
client.collectDefaultMetrics({ register: registry, prefix: 'node_' });

// ════════════════════════════════════════════════
//  ١) زمن الطلبات
// ════════════════════════════════════════════════

export const httpDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'زمن معالجة الطلب',
  labelNames: ['method', 'route', 'status'],
  /**
   * ️ الحدود مختارة حول ما يهمّنا فعلاً: قياسنا للمصادقة كان
   *    0.18ms والاستعلامات الجيدة تحت 100ms. حدّ 10 ثوانٍ يمسك
   *    نداءات Gemini البطيئة (مهلتها 20 ثانية).
   */
  buckets: [0.005, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

// ════════════════════════════════════════════════
//  ٢) زمن استعلامات القاعدة
// ════════════════════════════════════════════════

export const dbDuration = new client.Histogram({
  name: 'db_query_duration_seconds',
  help: 'زمن استعلام Prisma',
  labelNames: ['model', 'action'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [registry],
});

// ════════════════════════════════════════════════
//  ٣) الاتصالات الحيّة
// ════════════════════════════════════════════════

export const wsConnections = new client.Gauge({
  name: 'websocket_connections',
  help: 'عدد اتصالات WebSocket المفتوحة',
  labelNames: ['namespace'],
  registers: [registry],
});

export const gameRooms = new client.Gauge({
  name: 'game_rooms_active',
  help: 'غرف اللعب النشطة في هذه العملية',
  registers: [registry],
});

// ════════════════════════════════════════════════
//  ٤) كفاءة الكاش
// ════════════════════════════════════════════════

/**
 * ️ نسبة الإصابة هي ما يثبت أن الكاش يعمل.
 *    هبوطها المفاجئ يعني إمّا سقوط Redis أو إبطالاً مفرطاً —
 *    وكلاهما يعيدنا إلى 0.92ms لكل طلب بلا أن يلاحظ أحد.
 */
export const cacheOps = new client.Counter({
  name: 'cache_operations_total',
  help: 'عمليات الكاش',
  labelNames: ['cache', 'result'],
  registers: [registry],
});

// ════════════════════════════════════════════════
//  أدوات
// ════════════════════════════════════════════════

/**
 * ينمّط المسار لمنع انفجار العدد.
 *
 * `/api/tasks/9f3a-...` → `/api/tasks/:id`
 */
export const normalizeRoute = (path = '') =>
  path
    .split('?')[0]
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
    .replace(/\/\d+/g, '/:n')
    // أي مقطع طويل بلا فواصل غالباً معرّف
    .replace(/\/[A-Za-z0-9_-]{20,}/g, '/:id');

/** وسيط يقيس كل طلب */
export const metricsMiddleware = (req, res, next) => {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const seconds = Number(process.hrtime.bigint() - start) / 1e9;
    /**
     * ️ `req.route?.path` أدقّ من `req.path` لأنه القالب
     *    المُسجَّل ('/:id') لا القيمة. نسقط إلى التنميط اليدوي
     *    حين لا يطابق الطلب أي مسار (404).
     */
    const route = req.baseUrl
      ? `${req.baseUrl}${req.route?.path ?? ''}` || normalizeRoute(req.path)
      : normalizeRoute(req.path);

    httpDuration
      .labels(req.method, normalizeRoute(route), String(res.statusCode))
      .observe(seconds);
  });

  next();
};

/** امتداد Prisma يقيس كل استعلام */
export const prismaMetrics = {
  query: {
    async $allOperations({ model, operation, args, query }) {
      const start = process.hrtime.bigint();
      try {
        return await query(args);
      } finally {
        dbDuration
          .labels(model ?? 'raw', operation)
          .observe(Number(process.hrtime.bigint() - start) / 1e9);
      }
    },
  },
};

export default {
  registry,
  httpDuration,
  dbDuration,
  wsConnections,
  gameRooms,
  cacheOps,
  metricsMiddleware,
  normalizeRoute,
  prismaMetrics,
};
