/**
 * ════════════════════════════════════════════════════════════
 *  الطوابير — إخراج الشغل الثقيل من حلقة الأحداث
 * ════════════════════════════════════════════════════════════
 *
 *  ️ المبرّر مقيس لا مفترض:
 *
 *   `aiPulse.checkEligibility` يستغرق **7.2 ms** للمستخدم الواحد
 *   (عشرة استعلامات Prisma متوازية). والسويبر يمرّ على المستخدمين
 *   في حلقة داخل عملية الـ API:
 *
 *      200 مستخدم    →  1.4 ثانية حجب
 *      1,000 مستخدم  →  7 ثوانٍ حجب
 *      10,000 مستخدم →  72 ثانية حجب   
 *
 *   Node أحادي الخيط: طول هذه المدة **كل** طلب HTTP وكل رسالة
 *   WebSocket تنتظر. تسجيل دخول يستغرق دقيقة لأن المرافق يفحص
 *   من يستحق إشعاراً.
 *
 *   هذا ليس بطئاً — هذا توقّف.
 *
 *  ️ لماذا BullMQ لا `setInterval` أذكى؟
 *
 *   المشكلة ليست التوقيت بل **مكان التنفيذ**. أي جدولة داخل
 *   عملية الـ API ستحجبها مهما حسّنّا التوقيت. الطابور ينقل
 *   العمل إلى عملية منفصلة — وهذا هو الحل الوحيد فعلاً.
 *
 *  ️ ioredis لا redis.
 *   BullMQ يتطلب ioredis تحديداً. عندنا `redis` للكاش والقفل،
 *   فصار في المشروع عميلان — مقصود وموثّق لا سهو.
 */

import { Queue } from 'bullmq';
import IORedis from 'ioredis';

import env from '../config/env.js';
import { scoped } from '../config/logger.js';

const log = scoped('queue');

/**
 * اتصال Redis للطوابير.
 *
 * ️ `maxRetriesPerRequest: null` إلزامي لـ BullMQ.
 *    القيمة الافتراضية تجعل ioredis يرمي بعد عدد محاولات،
 *    بينما العامل يحتاج اتصالاً يعيد المحاولة إلى ما لا نهاية
 *    (يستخدم BRPOPLPUSH الحاجب). بدونها تموت العمّال عند أول
 *    تعثّر شبكة.
 */
export const createConnection = () =>
  new IORedis(env.redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

export const QUEUE_NAMES = {
  PULSE: 'ai-pulse',
  MAINTENANCE: 'maintenance',
  NOTIFICATION: 'notification',
  TASK_NUDGE: 'task-nudge',
  TASK_CHECKIN: 'task-checkin',
  JOURNEY_DAILY: 'journey-daily',
};

/**
 * إعدادات المهام الافتراضية.
 *
 * ️ `removeOnComplete` ليس تفصيلاً: بلا حدّ يحتفظ Redis بكل
 *    مهمة نجحت إلى الأبد. مع مهمة كل 10 دقائق = 52,560 سجلاً
 *    سنوياً لكل نوع، تأكل ذاكرة Redis التي نحتاجها للكاش.
 *
 * ️ نُبقي الفاشلة أطول: النجاح لا يُحقَّق فيه، والفشل يُشخَّص.
 */
const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: { count: 100, age: 24 * 3600 },
  removeOnFail: { count: 500, age: 7 * 24 * 3600 },
};

let connection = null;
const queues = new Map();

/**
 * يُنشئ طابوراً (أو يُعيد الموجود).
 *
 * ️ الاتصال مشترك بين الطوابير عمداً: كل اتصال جديد يستهلك
 *    فتحة في Redis، وعشرة طوابير باتصالات منفصلة تستنزفها بلا
 *    داعٍ. العمّال وحدهم يحتاجون اتصالات مستقلة.
 */
export const getQueue = (name) => {
  if (queues.has(name)) return queues.get(name);

  if (!connection) connection = createConnection();

  const q = new Queue(name, { connection, defaultJobOptions });
  q.on('error', (err) => log.error({ err, queue: name }, 'خطأ في الطابور'));

  queues.set(name, q);
  return q;
};

/**
 * يجدول المهام المتكررة.
 *
 * ️ `upsertJobScheduler` بمعرّف ثابت — وهذا ما يمنع التكرار
 *    في الـ cluster.
 *
 *   بلا معرّف ثابت، كل عملية من العشر تُضيف جدولاً خاصاً بها،
 *   فتعمل المهمة عشر مرات في الدقيقة الواحدة. الـ upsert يجعل
 *   الاستدعاء العاشر **يستبدل** الأول لا يُضاف إليه.
 *
 *   نفس الدرس الذي تعلّمناه في ملكية غرفة اللعبة.
 *
 * ️ BullMQ v6 استبدل `repeat` القديمة بـ Job Schedulers.
 *    الواجهة القديمة (`add` مع `repeat`) لم تعد تُنشئ جدولاً —
 *    تُضيف مهمة واحدة صامتة. اكتشفناه بالتجربة: `getRepeatableJobs`
 *    غير موجودة أصلاً في هذه النسخة.
 */
export const scheduleRepeatables = async () => {
  const pulse = getQueue(QUEUE_NAMES.PULSE);
  const maint = getQueue(QUEUE_NAMES.MAINTENANCE);
  const journey = getQueue(QUEUE_NAMES.JOURNEY_DAILY);

  await pulse.upsertJobScheduler(
    'pulse-sweep-recurring',
    { every: 10 * 60_000 },
    { name: 'sweep', data: {} },
  );

  await maint.upsertJobScheduler(
    'maintenance-reap-recurring',
    /** يومياً 4 صباحاً — الكنس ثقيل ولا يحتاج تكراراً أكثر */
    { pattern: '0 4 * * *' },
    { name: 'reap', data: {} },
  );

  await journey.upsertJobScheduler(
    'journey-daily-recurring',
    /**
     * كل 15 دقيقة — مزامنة منتصف الليل المحلي (قرار المالك):
     * لما يوصل منتصف ليل المستخدم (بتوقيت منطقته) يتم توليد مهام اليوم
     * تلقائياً. الدقة: ±15 دقيقة عن منتصف الليل بالظبط — مقبولة لأن
     * الـ lazy عند فتح التطبيق بيغطي الفتح الفوري في أي وقت.
     */
    { every: 15 * 60_000 },
    { name: 'daily', data: {} },
  );

  log.info(' المهام المتكررة مجدولة');
};

/** الجداول القائمة — للتشخيص والاختبار */
export const listSchedulers = async () => {
  const out = {};
  for (const name of Object.values(QUEUE_NAMES)) {
    out[name] = await getQueue(name).getJobSchedulers();
  }
  return out;
};

/** إغلاق نظيف — يمنع تعليق العملية عند SIGTERM */
export const closeQueues = async () => {
  await Promise.all([...queues.values()].map((q) => q.close()));
  queues.clear();
  if (connection) {
    await connection.quit();
    connection = null;
  }
};

export default {
  getQueue,
  QUEUE_NAMES,
  scheduleRepeatables,
  listSchedulers,
  closeQueues,
  createConnection,
};
