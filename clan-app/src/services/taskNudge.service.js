/**
 * ═══════════════════════════════════════════════════════════
 *  خدمة النكش قبل المهمة (رؤية «بال»)
 *
 *  قبل موعد المهمة بـ 5 دقائق يُستدعى الـ AI الحقيقي ليولّد:
 *    نكشة خفيفة + تذكير باسم المهمة ووقتها + نصيحة عملية واحدة.
 *
 *  ⚠️ لا وهمي: لو الـ AI غير متاح → إشعار تذكير نظام صريح
 *     (بدون ادعاء أنه من الرفيق) — مصدره SYSTEM لا AI.
 *
 *  النتيجة تُخزَّن في جدول Notification (قاعدة البيانات) — ربط دائم.
 * ═══════════════════════════════════════════════════════════
 */
import prisma from '../config/prisma.js';
import { generate } from './gemini.service.js';
import { scoped } from '../config/logger.js';

const log = scoped('task-nudge');

const PRIORITY_LABEL = { CRITICAL: 'حرجة', GROWTH: 'نمو', QUICK: 'سريعة' };

/** تنفيذ النكشة لمهمة واحدة — يُستدعى من Worker */
export const executeNudge = async (taskId) => {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { user: { select: { username: true, companionName: true } } },
  });

  if (!task) return { skipped: 'TASK_NOT_FOUND' };
  if (task.isCompleted) return { skipped: 'ALREADY_COMPLETED' };

  const startLabel = task.startTime ? `الساعة ${task.startTime}` : '';
  const endLabel = task.endTime ? ` إلى ${task.endTime}` : '';
  const timeLabel = `${startLabel}${endLabel}`.trim();
  const priorityLabel = PRIORITY_LABEL[task.priority] ?? '';

  let text = null;
  let source = 'SYSTEM';

  // ═══ نداء الـ AI الحقيقي (باسم الرفيق) ═══
  if (task.user?.companionName) {
    try {
      const system = `أنت «${task.user.companionName}» — الرفيق المحفّز في تطبيق «بال». تخاطب «${task.user.username || 'يا بطل'}». مهمتك الآن: رسالة تذكير قبل موعد مهمة، قصيرة جداً (سطران كحد أقصى)، تتكون من: (1) نكشة خفيفة محفزة بنبرة صديق، (2) تذكير واضح بالمهمة ووقتها، (3) نصيحة عملية واحدة سريعة تخص نوع المهمة (مذاكرة → طريقة حفظ · برمجة → تقسيم المهمة · رياضة → طاقة وتسخين · أكل/صحة → اعتدال). ممنوع اللوم أو الوعظ، وممنوع ذكر أنك نموذج لغوي.`;
      const prompt = `المهمة القادمة: «${task.title}»${timeLabel ? ` (${timeLabel})` : ''}${priorityLabel ? ` — أولويتها ${priorityLabel}` : ''}.${task.description ? ` ملاحظة: ${task.description.slice(0, 120)}` : ''} اكتب النكشة والنصيحة الآن.`;
      const ai = await generate(system, [], prompt, { maxTokens: 180, temperature: 0.9 });
      if (ai?.text?.trim()) {
        text = ai.text.trim();
        source = 'AI';
      }
    } catch (e) {
      log.warn({ taskId, code: e.code }, 'AI غير متاح للنكشة — تذكير نظام');
    }
  }

  // ═══ تذكير النظام الصريح (بلا ادعاء AI) ═══
  if (!text) {
    text = `تذكير: عندك «${task.title}»${timeLabel ? ` ${timeLabel}` : ''}.`;
  }

  const notification = await prisma.notification.create({
    data: {
      userId: task.userId,
      type: 'TASK_REMINDER',
      title: 'قبل المهمة بـ 5 دقائق',
      body: text.slice(0, 250),
      data: { taskId: task.id, source },
    },
    select: { id: true },
  });

  return { notificationId: notification.id, source, taskId: task.id };
};

/**
 * جدولة النكشة عند إنشاء مهمة.
 * تُستدعى بعد إنشاء أي مهمة (مفردة أو بلوك).
 */
export const scheduleNudge = async (task) => {
  if (!task || task.hasPreReminder === false) return null;

  const base = task.scheduledStart ?? task.dueDate;
  if (!base) return null;

  const when = new Date(base.getTime() - (task.reminderMinutesBefore || 5) * 60_000);
  const delay = when.getTime() - Date.now();

  // لو الموعد قرب جداً (أقل من دقيقة) → لا فائدة من جدولة
  if (delay < 60_000) return null;

  try {
    const { getQueue, QUEUE_NAMES } = await import('../queues/index.js');
    // jobId ثابت لكل مهمة: أي إعادة جدولة (بعد تعديل الوقت) تستبدل القديمة تلقائياً
    await getQueue(QUEUE_NAMES.TASK_NUDGE).add(
      'nudge',
      { taskId: task.id },
      { delay, jobId: `task-nudge:${task.id}` },
    );
    return { scheduled: true, delayMs: delay };
  } catch (e) {
    log.warn({ taskId: task.id, err: e.message }, 'فشل جدولة النكشة');
    return null;
  }
};

/** إلغاء نكشة مجدولة (عند حذف المهمة) */
export const cancelNudge = async (taskId) => {
  try {
    const { getQueue, QUEUE_NAMES } = await import('../queues/index.js');
    await getQueue(QUEUE_NAMES.TASK_NUDGE).remove(`task-nudge:${taskId}`);
    return true;
  } catch (e) {
    log.warn({ taskId, err: e.message }, 'فشل إلغاء النكشة');
    return false;
  }
};

export default { executeNudge, scheduleNudge, cancelNudge };
