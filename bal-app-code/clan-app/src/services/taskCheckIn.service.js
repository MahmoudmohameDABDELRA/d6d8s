/**
 * ═══════════════════════════════════════════════════════════
 *  اطمئنان المهمة — Task Check-In Service
 *
 *  ⭐ أهم فيتشر في التطبيق (قرار المالك).
 *
 *  الفكرة: لما ييجي وقت المهمة، الرفيق بيسأل المستخدم سؤال
 *  منبثق «إيه الأخبار؟ عملت إيه في (المهمة)؟ احكيلي عشان أساعدك»،
 *  والمستخدم بيرد **في نفس البوب-أب** والرفيق بيرد عليه هناك.
 *
 *  ── التوقيتات (قرار المالك: الاتنين) ──
 *    ١. `PRE`   — قبل المهمة بـ 5 دقائق → نكشة (taskNudge.service)
 *    ٢. `END`   — بعد ما ينتهي وقت المهمة → سؤال الاطمئنان (هنا)
 *    ٣. `DONE`  — بعد 10 دقائق من الإنجاز اليدوي → اطمئنان (هنا برضه)
 *
 *  ── ضد الملل ──
 *    الصياغة **مش ثابتة**: الـ AI بياخد توجيه أسلوب مختلف كل مرة،
 *    ولو الـ AI واقع بنختار من بنك صيغ بلا تكرار (checkinPhrases).
 *
 *  ── الرد داخل البوب-أب ──
 *    الإشعار بيتخزّن بـ `data.canReply = true` و `data.threadId`،
 *    والمستخدم بيرد عبر POST /api/notifications/:id/reply
 *    فيرجع رد الرفيق فوراً + يتبث على السوكيت.
 *
 *  ️ لا وهمي: لو الـ AI مش متاح → `data.source = 'SYSTEM'` بصراحة،
 *     من غير ادعاء إن ده كلام الرفيق.
 * ═══════════════════════════════════════════════════════════
 */
import prisma from '../config/prisma.js';
import { generate } from './gemini.service.js';
import * as persona from './aiPersona.service.js';
import * as phrases from './checkinPhrases.service.js';
import { emitToUser } from './realtime.service.js';
import { resolveTaskEnd } from '../utils/taskTiming.js';
import { scoped } from '../config/logger.js';

const log = scoped('task-checkin');

/** أسباب تشغيل الاطمئنان */
export const CHECKIN_REASONS = {
  /** انتهى وقت المهمة المجدول (سواء علّمها خلصت أو لأ) */
  SCHEDULE_END: 'SCHEDULE_END',
  /** المستخدم علّم المهمة كمنجزة، وعدت 10 دقائق */
  COMPLETED: 'COMPLETED',
};

// ════════════════════════════════════════════════
//  الجدولة
// ════════════════════════════════════════════════

/** إضافة مهمة للطابور بمعرّف ثابت (إعادة الجدولة بتستبدل القديمة) */
const enqueue = async (taskId, reason, delayMs) => {
  const { getQueue, QUEUE_NAMES } = await import('../queues/index.js');
  await getQueue(QUEUE_NAMES.TASK_CHECKIN).add(
    'checkin',
    { taskId, reason },
    {
      delay: Math.max(delayMs, 0),
      attempts: 3,
      backoff: { type: 'exponential', delay: 60_000 },
      removeOnComplete: 100,
      removeOnFail: 500,
      /**
       * ️ jobId ثابت لكل (مهمة × سبب): لو المستخدم عدّل ميعاد
       *    المهمة، الجدولة الجديدة **تستبدل** القديمة بدل ما تتكرر.
       */
      jobId: `task-checkin:${reason}:${taskId}`,
    },
  );
};

/**
 * ═══ التوقيت الأول: عند انتهاء وقت المهمة ═══
 *
 * بيتنادى عند إنشاء/تعديل أي مهمة ليها وقت.
 * بيحسب نهاية المهمة من (بالترتيب):
 *   scheduledEnd → slotDate+endTime → scheduledStart+estimatedMin → dueDate
 *
 * @returns {Promise<{scheduled:boolean, at?:Date}|null>}
 */
export const scheduleEndOfTaskCheckIn = async (task) => {
  if (!task || task.isCompleted) return null;

  const end = resolveTaskEnd(task);
  if (!end) return null;

  const delay = end.getTime() - Date.now();

  // الميعاد فات خلاص → مفيش فايدة من جدولة أثرية
  if (delay < -60 * 60_000) return null;

  try {
    await enqueue(task.id, CHECKIN_REASONS.SCHEDULE_END, delay);
    return { scheduled: true, at: end };
  } catch (error) {
    log.warn({ taskId: task.id, err: error.message }, 'فشل جدولة اطمئنان نهاية المهمة');
    return null;
  }
};

/**
 * ═══ التوقيت الثاني: بعد 10 دقائق من الإنجاز اليدوي ═══
 * (السلوك القديم — محفوظ)
 */
export const scheduleTaskCheckIn = async (taskId) => {
  try {
    await enqueue(taskId, CHECKIN_REASONS.COMPLETED, 10 * 60 * 1000);
    return { scheduled: true };
  } catch (error) {
    log.warn({ taskId, err: error.message }, 'فشل جدولة اطمئنان ما بعد الإنجاز');
    return null;
  }
};

/** إلغاء كل اطمئنانات مهمة (عند حذفها) */
export const cancelTaskCheckIns = async (taskId) => {
  try {
    const { getQueue, QUEUE_NAMES } = await import('../queues/index.js');
    const q = getQueue(QUEUE_NAMES.TASK_CHECKIN);
    await Promise.allSettled(
      Object.values(CHECKIN_REASONS).map((r) =>
        q.remove(`task-checkin:${r}:${taskId}`),
      ),
    );
    return true;
  } catch (error) {
    log.warn({ taskId, err: error.message }, 'فشل إلغاء الاطمئنانات');
    return false;
  }
};

// ════════════════════════════════════════════════
//  التنفيذ (داخل العامل)
// ════════════════════════════════════════════════

/**
 * تنفيذ الاطمئنان لمهمة واحدة.
 *
 * @param {string} taskId
 * @param {string} [reason] من CHECKIN_REASONS
 */
export const executeCheckIn = async (taskId, reason = CHECKIN_REASONS.COMPLETED) => {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      user: { select: { id: true, username: true, companionName: true } },
      goalStep: { select: { title: true, goal: { select: { title: true } } } },
    },
  });

  if (!task) return { skipped: 'TASK_NOT_FOUND' };

  // اطمئنان ما بعد الإنجاز لا معنى له لو المستخدم رجع فتح المهمة
  if (reason === CHECKIN_REASONS.COMPLETED && !task.isCompleted) {
    return { skipped: 'NOT_COMPLETED' };
  }

  /**
   * ️ منع التكرار: إشعار اطمئنان واحد لكل (مهمة × سبب).
   *    من غيره، لو المستخدم خلّص المهمة قبل معادها بشوية، هيتسأل
   *    مرتين (مرة عند الإنجاز ومرة عند نهاية الوقت) — إزعاج صريح.
   */
  const existing = await prisma.notification.findFirst({
    where: {
      userId: task.userId,
      type: 'TASK_CHECKIN',
      data: { path: ['taskId'], equals: taskId },
    },
    select: { id: true },
  });
  if (existing) return { skipped: 'ALREADY_CHECKED' };

  const companionName = task.user.companionName || 'رفيقك';
  const username = task.user.username || 'يا بطل';

  let body = null;
  let source = 'SYSTEM';

  // ═══ نداء الـ AI مع توجيه أسلوب مختلف كل مرة ═══
  try {
    const hint = await phrases.nextAiVariantHint(task.userId);
    const dreamLine = task.goalStep?.goal?.title
      ? ` المهمة دي جزء من رحلته نحو «${task.goalStep.goal.title}».`
      : '';

    const situation =
      reason === CHECKIN_REASONS.SCHEDULE_END
        ? `خلص دلوقتي وقت مهمته المجدولة «${task.title}»${task.isCompleted ? ' وهو علّمها كمنجزة' : ' وهو لسه ما علّمهاش كمنجزة'}.`
        : `عدّت 10 دقايق على ما خلّص مهمته «${task.title}».`;

    const system = [
      persona.build('TASK_FOLLOWUP'),
      `أنت «${companionName}» في تطبيق «بال». تخاطب «${username}».`,
      'مهمتك الآن: اكتب **سؤال اطمئنان واحد** قصير جداً (سطرين كحد أقصى)',
      'بالعامية المصرية، يسأله عمل إيه في المهمة وإذا كانت واجهته مشكلة،',
      'وينهي بدعوة إنه يحكي عشان تساعده.',
      '',
      `توجيه الأسلوب لهذه المرة (التزم به عشان الصياغة تختلف عن كل مرة سابقة): ${hint}`,
      '',
      'ممنوع منعاً باتاً: اللوم، الوعظ، افتراض إنه فشل، ذكر إنك نموذج لغوي،',
      'المقدمات زي «أكيد» أو «بالطبع»، وإعادة نفس الصياغة الجاهزة.',
      'إيموجي واحد كحد أقصى.',
    ].join('\n');

    const prompt = [
      situation + dreamLine,
      task.description ? `تفاصيل المهمة: ${task.description.slice(0, 160)}` : '',
      'اكتب سؤال الاطمئنان الآن — من غير أي شرح إضافي.',
    ]
      .filter(Boolean)
      .join('\n');

    /**
     * ️ temperature عالية (1.0) عن قصد: ده النص الوحيد اللي
     *    التكرار فيه بيقتل الفيتشر. التنويع أهم من الدقة هنا.
     */
    const ai = await generate(system, [], prompt, { maxTokens: 180, temperature: 1.0 });
    if (ai?.text?.trim()) {
      body = ai.text.trim();
      source = 'AI';
    }
  } catch (error) {
    log.warn({ taskId, code: error.code }, 'AI غير متاح للاطمئنان — صيغة من البنك');
  }

  // ═══ البنك الاحتياطي — متغيّر برضه، مش نص واحد ثابت ═══
  if (!body) {
    body = await phrases.nextFallbackText(task.userId, task.title);
  }

  const title =
    source === 'AI'
      ? `${companionName} بيسأل عنك`
      : await phrases.nextTitle(task.userId, companionName);

  const notification = await prisma.notification.create({
    data: {
      userId: task.userId,
      type: 'TASK_CHECKIN',
      title,
      body: body.slice(0, 400),
      data: {
        taskId,
        taskTitle: task.title,
        source,
        reason,
        kind: 'checkin',
        /** ⭐ ده اللي بيخلي التطبيق يفتح بوب-أب فيه حقل رد */
        canReply: true,
      },
    },
  });

  // ═══ بث لحظي: لو التطبيق مفتوح، البوب-أب يطلع فوراً ═══
  await emitToUser(task.userId, 'notification:new', {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    data: notification.data,
    createdAt: notification.createdAt,
  });

  return { notificationId: notification.id, source, reason, taskId };
};

/** معاد إعادة التصدير — عشان المستدعيين القدام ما يتكسروش */
export { resolveTaskEnd };

export default {
  CHECKIN_REASONS,
  scheduleTaskCheckIn,
  scheduleEndOfTaskCheckIn,
  cancelTaskCheckIns,
  resolveTaskEnd,
  executeCheckIn,
};
