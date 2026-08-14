/**
 * ═══════════════════════════════════════════════════════════
 *  اطمئنان ما بعد المهمة — Task Check-In Service
 *
 *  بعد 10 دقائق من إنجاز أي مهمة، الـ AI (بشخصية TASK_FOLLOWUP
 *  الموجودة في aiPersona) يسأل المستخدم: «عملت إيه؟ واجهتك مشكلة؟»
 *
 *  ⚠️ لا وهمي: لو الـ AI غير متاح → إشعار نظام صريح (مصدره SYSTEM)
 *     بلا ادعاء أنه من الرفيق.
 * ═══════════════════════════════════════════════════════════
 */
import prisma from '../config/prisma.js';
import { generate } from './gemini.service.js';
import * as persona from './aiPersona.service.js';
import { scoped } from '../config/logger.js';

const log = scoped('task-checkin');

/**
 * جدولة اطمئنان بعد 10 دقائق (تستدعيها completeTask بعد الإنجاز)
 */
export const scheduleTaskCheckIn = async (taskId) => {
  const { Queue } = await import('bullmq');
  const { createConnection, QUEUE_NAMES } = await import('../queues/index.js');
  const queue = new Queue(QUEUE_NAMES.TASK_CHECKIN, {
    connection: createConnection(),
  });
  await queue.add(
    'checkin',
    { taskId },
    {
      delay: 10 * 60 * 1000, // 10 دقائق
      attempts: 3,
      backoff: { type: 'exponential', delay: 60_000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    },
  );
  await queue.close();
};

/**
 * تنفيذ الاطمئنان لمهمة واحدة — يُستدعى من Worker
 */
export const executeCheckIn = async (taskId) => {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      user: { select: { username: true, companionName: true } },
    },
  });

  if (!task) return { skipped: 'TASK_NOT_FOUND' };
  if (!task.isCompleted) return { skipped: 'NOT_COMPLETED' };

  // منع التكرار: إشعار اطمئنان واحد لكل مهمة
  const existing = await prisma.notification.findFirst({
    where: { userId: task.userId, type: 'TASK_CHECKIN', data: { path: ['taskId'], equals: taskId } },
  });
  if (existing) return { skipped: 'ALREADY_CHECKED' };

  const name = task.user.companionName || 'رفيقك';
  const username = task.user.username || 'يا بطل';

  let text = null;
  let source = 'SYSTEM';

  try {
    const system = `${persona.build('TASK_FOLLOWUP')}\nأنت «${name}» في تطبيق «بال». تخاطب «${username}». مهمتك الآن: رسالة اطمئنان قصيرة جداً (سطران كحد أقصى) بعد ما خلص «${task.title}» — اسأله بصدق: عملت إيه؟ واجهتك مشكلة؟ محتاج مساعدة؟ بنبرة صديق دافي، ممنوع اللوم والوعظ، وممنوع ذكر أنك نموذج لغوي.`;
    const prompt = `المهمة اللي خلصها توه: «${task.title}».${task.description ? ` تفاصيلها: ${task.description.slice(0, 120)}` : ''} اكتب رسالة الاطمئنان الآن.`;
    const ai = await generate(system, [], prompt, { maxTokens: 180, temperature: 0.9 });
    if (ai?.text?.trim()) {
      text = ai.text.trim();
      source = 'AI';
    }
  } catch (e) {
    log.warn({ taskId, code: e.code }, 'AI غير متاح للاطمئنان — رسالة نظام');
  }

  if (!text) {
    text = `شكلك خلصت «${task.title}» — عامل إيه؟ لو في حاجة واقفة قدامك قولي.`;
  }

  await prisma.notification.create({
    data: {
      userId: task.userId,
      type: 'TASK_CHECKIN',
      title: source === 'AI' ? `${name} بيسأل عنك` : 'اطمئنان',
      body: text,
      data: { taskId, source, kind: 'checkin' },
    },
  });

  return { source, taskId };
};
