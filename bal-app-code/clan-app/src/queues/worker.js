/**
 * ════════════════════════════════════════════════════════════
 *  العامل — عملية منفصلة تحمل الشغل الثقيل
 * ════════════════════════════════════════════════════════════
 *
 *  يُشغَّل مستقلاً عن الـ API:
 *
 *      node src/queues/worker.js
 *
 *  ️ الفصل هو الفائدة كلها.
 *
 *   لو شغّلنا العامل داخل عملية الـ API لعدنا لنقطة الصفر:
 *   72 ثانية حجب عند 10 آلاف مستخدم. القيمة ليست في BullMQ
 *   نفسه بل في أن **حلقة أحداث أخرى** هي التي تُحجَب.
 *
 *  ️ توسّع مستقل: لو ثقُل الكنس نُشغّل عاملين بلا لمس الـ API.
 *     ولو تعطّل العامل تماماً، يظل التطبيق يخدم المستخدمين —
 *     تتأخر الإشعارات ولا شيء آخر.
 */

import { Worker } from 'bullmq';

import { createConnection, QUEUE_NAMES } from './index.js';
import { scoped } from '../config/logger.js';
import prisma from '../config/prisma.js';

const log = scoped('worker');

/**
 * التزامن.
 *
 * ️ 1 للنبض عمداً: المهمة نفسها تمرّ على مئات المستخدمين
 *    داخلياً. تشغيل خمس نسخ متوازية يعني خمسة مسوح متداخلة
 *    على نفس المستخدمين — استعلامات مكرّرة بلا فائدة.
 */
const CONCURRENCY = {
  [QUEUE_NAMES.PULSE]: 1,
  [QUEUE_NAMES.MAINTENANCE]: 1,
  [QUEUE_NAMES.NOTIFICATION]: 5,
  [QUEUE_NAMES.TASK_NUDGE]: 5,
  [QUEUE_NAMES.TASK_CHECKIN]: 5,
  [QUEUE_NAMES.JOURNEY_DAILY]: 1,
};

// ════════════════════════════════════════════════
//  معالجات المهام
// ════════════════════════════════════════════════

const handleNotification = async (job) => {
  const notificationService = await import('../services/notification.service.js');
  return notificationService.dispatchToFCM(job.data);
};

/**
 * مسح النبض — من يستحق إشعاراً الآن؟
 *
 * ️ لا يُنادي النموذج. الإشعار قالب برمجي بصفر توكن، والنداء
 *    المدفوع لا يحدث إلا حين يضغط المستخدم "رد".
 */
const handlePulseSweep = async (job) => {
  const sweeper = await import('../services/aiSweeper.service.js');
  const pulse = await import('../services/aiPulse.service.js');

  const result = await sweeper.sweepOnce(async (userId, tz, check) => {
    if (!check?.events?.length) return;
    await pulse.createTemplatePulse(userId, check.events);
  });

  await job.updateProgress(100);
  return result;
};

/**
 * الصيانة — الجلسات العالقة والرموز المنتهية.
 *
 * ️ مسح الرسائل اليتيمة لم يعد ضمنها: بعد توحيد المخزنين
 *    تتكفّل `onDelete: Cascade` بالأمر في القاعدة نفسها.
 */
const handleMaintenance = async () => {
  const reaper = await import('../services/orphanReaper.service.js');
  return reaper.reapAll();
};

/** النكشة قبل المهمة — نداء AI حقيقي → إشعار في القاعدة */
const handleTaskNudge = async (job) => {
  const nudge = await import('../services/taskNudge.service.js');
  return nudge.executeNudge(job.data.taskId);
};

/** اطمئنان ما بعد المهمة (بعد 10 دقائق) — نداء AI حقيقي → إشعار */
const handleTaskCheckIn = async (job) => {
  const checkin = await import('../services/taskCheckIn.service.js');
  /**
   * ⚠️ `reason` بيحدد نبرة السؤال: انتهى وقت المهمة المجدول
   *    (SCHEDULE_END) ولا عدّت 10 دقايق على إنجازها (COMPLETED).
   *    الجوبس القديمة في الطابور مالهاش reason — بنرجّع الافتراضي.
   */
  return checkin.executeCheckIn(job.data.taskId, job.data.reason);
};

/** توليد مهام اليوم لكل الرحات النشطة — شبكة أمان (صفر AI) */
const handleJourneyDaily = async () => {
  const scheduler = await import('../services/journeyScheduler.service.js');
  return scheduler.generateTodayTasks({});
};

const HANDLERS = {
  [QUEUE_NAMES.PULSE]: { sweep: handlePulseSweep },
  [QUEUE_NAMES.MAINTENANCE]: { reap: handleMaintenance },
  [QUEUE_NAMES.NOTIFICATION]: { 'dispatch-push': handleNotification },
  [QUEUE_NAMES.TASK_NUDGE]: { nudge: handleTaskNudge },
  [QUEUE_NAMES.TASK_CHECKIN]: { checkin: handleTaskCheckIn },
  [QUEUE_NAMES.JOURNEY_DAILY]: { daily: handleJourneyDaily },
};

// ════════════════════════════════════════════════
//  الإقلاع
// ════════════════════════════════════════════════

const workers = [];

const startWorker = (queueName) => {
  const worker = new Worker(
    queueName,
    async (job) => {
      const handler = HANDLERS[queueName]?.[job.name];
      if (!handler) throw new Error(`لا معالج للمهمة: ${queueName}/${job.name}`);

      const started = Date.now();
      log.info({ queue: queueName, job: job.name, id: job.id }, 'بدأت المهمة');

      const result = await handler(job);

      log.info(
        { queue: queueName, job: job.name, ms: Date.now() - started, result },
        'انتهت المهمة',
      );
      return result;
    },
    {
      connection: createConnection(),
      concurrency: CONCURRENCY[queueName] ?? 1,
      /**
       * ️ حاجز المعدّل: يمنع العامل من إغراق القاعدة لو تراكمت
       *    المهام. الاستقرار البطيء أفضل من الانهيار السريع.
       */
      limiter: { max: 10, duration: 1000 },
    },
  );

  worker.on('failed', (job, err) =>
    log.error(
      { queue: queueName, job: job?.name, attempts: job?.attemptsMade, err },
      'فشلت المهمة',
    ),
  );

  worker.on('error', (err) => log.error({ queue: queueName, err }, 'خطأ في العامل'));

  workers.push(worker);
  return worker;
};

export const startAllWorkers = () => {
  for (const name of Object.values(QUEUE_NAMES)) startWorker(name);
  log.info({ queues: Object.values(QUEUE_NAMES) }, ' العمّال يعملون');
  return workers;
};

export const stopAllWorkers = async () => {
  await Promise.all(workers.map((w) => w.close()));
  workers.length = 0;
};

/**
 * ️ يعمل فقط عند التشغيل المباشر لا عند الاستيراد.
 *    بدون هذا الفحص، أي اختبار يستورد الملف يُقلع عمّالاً
 *    حقيقيين تستهلك Redis ولا تُغلق.
 */
const isDirectRun =
  process.argv[1] && import.meta.url === `file://${process.argv[1]}`;

if (isDirectRun) {
  startAllWorkers();

  const shutdown = async (signal) => {
    log.info({ signal }, 'إغلاق العمّال...');
    await stopAllWorkers();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

export default { startAllWorkers, stopAllWorkers };
