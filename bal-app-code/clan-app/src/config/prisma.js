import { PrismaClient } from '@prisma/client';

import env from './env.js';
import { attachQueryGuard } from './queryGuard.js';
import { prismaMetrics } from './metrics.js';
import { scoped } from './logger.js';

const log = scoped('prisma');

const globalForPrisma = globalThis;

/**
 * ════════════════════════════════════════════════════════════
 *  حدّ الاتصالات — إعداد كان ميتاً
 * ════════════════════════════════════════════════════════════
 *
 *  ️ `PG_POOL_MAX` كان موجوداً في `.env.example` منذ البداية
 *     و**لا أحد يقرأه**. تحققنا بـ grep: صفر استخدام.
 *
 *  النتيجة: Prisma يستخدم افتراضيه `(عدد النوى × 2) + 1`.
 *  على خادم بـ 8 نوى = 17 اتصالاً لكل عملية. مع 50 عملية
 *  خلف PM2 أو Kubernetes = **850 اتصالاً**، وحدّ Postgres
 *  الافتراضي **100**. النتيجة انهيار فوري عند التوسّع.
 *
 *  الحل: نحقن `connection_limit` في رابط الاتصال نفسه —
 *  الطريقة الوحيدة التي يقبلها Prisma.
 *
 *  ️ لا نلمس الرابط إن كان يحمل المعامل أصلاً: قد يكون
 *     المشغّل ضبطه عمداً لبيئته (PgBouncer مثلاً يحتاج
 *     `pgbouncer=true&connection_limit=1`).
 */
const buildDbUrl = (raw = env.databaseUrl) => {
  if (!raw) return raw;
  if (/[?&]connection_limit=/.test(raw)) return raw;

  const limit = Number(process.env.PG_POOL_MAX) || 10;
  const timeout = Number(process.env.PG_POOL_TIMEOUT) || 20;
  const sep = raw.includes('?') ? '&' : '?';

  let url = `${raw}${sep}connection_limit=${limit}&pool_timeout=${timeout}`;

  /**
   * ️ خلف PgBouncer في وضع transaction **يجب** تعطيل العبارات
   *    المُحضَّرة.
   *
   *   PgBouncer يعيد الاتصال للمجمّع بعد كل معاملة، فالعبارة
   *   المُحضَّرة على اتصال قد تُنفَّذ على آخر. النتيجة أخطاء
   *   "prepared statement s0 already exists" متقطّعة تظهر
   *   **تحت الحمل فقط** — أصعب نوع في التشخيص.
   */
  if (process.env.PGBOUNCER === 'true' && !/pgbouncer=/.test(url)) {
    url += '&pgbouncer=true';
  }

  return url;
};

/**
 * ️ الحارس ملفوف حول العميل لا مضاف إليه.
 *
 *  `$extends` تُرجع عميلاً جديداً؛ لو استخدمنا الأصلي في أي
 *  مكان لتجاوز الحارس صامتاً. لذا نصدّر الملفوف فقط.
 */
/**
 * ️ ترتيب الامتدادات مقصود:
 *
 *  المقاييس **تلفّ** الحارس لا العكس — فتقيس الزمن الفعلي بعد
 *  تطبيق الحدود. لو قِسنا قبله لقِسنا استعلاماً لم يُنفَّذ بهذا
 *  الشكل، وهو رقم لا معنى له.
 */
const prisma =
  globalForPrisma.prisma ||
  attachQueryGuard(
    new PrismaClient({
      log: env.isProduction ? ['error'] : ['error', 'warn'],
      datasources: { db: { url: buildDbUrl() } },
    }),
  ).$extends(prismaMetrics);

/**
 * ════════════════════════════════════════════════════════════
 *  النسخة القارئة (Read Replica)
 * ════════════════════════════════════════════════════════════
 *
 *  ️ اختيارية بالكامل: بلا `DATABASE_REPLICA_URL` كل شيء يمرّ
 *     على الأساسية كما كان. الإضافة لا تغيّر سلوكاً قائماً.
 *
 *  ️ التأخّر النسخي (replication lag) حقيقي.
 *
 *   النسخة القارئة تتأخر عن الأساسية بمللي ثوانٍ إلى ثوانٍ.
 *   القراءة **بعد الكتابة مباشرةً** قد ترجع البيانات القديمة:
 *   المستخدم ينشئ مهمة ثم لا يجدها في القائمة.
 *
 *   لذلك لا نوجّه القراءات تلقائياً. `readOnly` يُستخدم
 *   **صراحةً** حيث التأخّر مقبول:
 *     · الإحصاءات والتقارير
 *     · لوحات الصدارة
 *     · التصفّح والبحث
 *
 *   ولا يُستخدم أبداً في: المصادقة · الرصيد · أي قراءة تسبق
 *   قراراً بالكتابة.
 */
export const hasReplica = Boolean(process.env.DATABASE_REPLICA_URL);

const replicaClient = hasReplica
  ? new PrismaClient({
      log: env.isProduction ? ['error'] : ['error', 'warn'],
      datasources: { db: { url: buildDbUrl(process.env.DATABASE_REPLICA_URL) } },
    }).$extends(prismaMetrics)
  : null;

/**
 * عميل القراءة.
 *
 * ️ يسقط إلى الأساسية حين لا توجد نسخة — فالكود المستخدِم
 *    يعمل في الحالتين بلا تفرّع.
 */
export const readOnly = replicaClient ?? null;

// منع إنشاء عملاء متعددين مع node --watch / hot reload
if (!env.isProduction) {
  globalForPrisma.prisma = prisma;
}

export const disconnectPrisma = async () => {
  if (replicaClient) await replicaClient.$disconnect();
  await prisma.$disconnect();
  log.info(' Prisma disconnected');
};

export default prisma;
