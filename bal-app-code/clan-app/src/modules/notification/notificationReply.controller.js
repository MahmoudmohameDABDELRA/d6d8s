/**
 * ═══════════════════════════════════════════════════════════
 *  الرد داخل البوب-أب — Notification Reply Controller
 *
 *  ⭐ أهم مسار في التطبيق (قرار المالك).
 *
 *  POST /api/notifications/:id/reply   { text }
 *   → يرجّع رد الرفيق فوراً في نفس الاستجابة (عشان البوب-أب يعرضه
 *     من غير ما يستنى حاجة تانية) + يبثّه على السوكيت للأجهزة التانية.
 *
 *  GET  /api/notifications/:id/thread
 *   → المحادثة كاملة (لو المستخدم قفل البوب-أب وفتحه تاني).
 *
 *  POST /api/notifications/checkin/open   { taskId }
 *   → يفتح خيط اطمئنان لمهمة **من غير ما يستنى الجوب**.
 *     التطبيق عارف إن المهمة من 5 لـ 6، فبيفتح البوب-أب الساعة 6
 *     بنفسه — والـ endpoint ده بيديله إشعار يرد عليه.
 *
 *  ── الفرق عن /api/task-checkin ──
 *    ده بمصادقة **المستخدم** (JWT) ومربوط بإشعار حقيقي في القاعدة،
 *    فالسياق كامل: المهمة + الهدف + الحلم + المحادثة السابقة.
 *    التاني (`/api/task-checkin`) بـ app-secret لـ focus_app المستقل.
 *
 *  ── الأمان ──
 *    · ملكية الإشعار تتفحص أولاً (مش أي id).
 *    · حارس المدخل: أزمة إنسانية → رد دعم فوري بلا نداء AI.
 *    · حارس المخرج: قص، تعقيم، منع تسريب التعليمة.
 *    · سقف أدوار: 10 ردود للخيط الواحد.
 * ═══════════════════════════════════════════════════════════
 */
import prisma from '../../config/prisma.js';
import { AI_LIMITS } from '../../config/aiRules.js';
import { generate } from '../../services/gemini.service.js';
import * as persona from '../../services/aiPersona.service.js';
import * as guard from '../../services/aiGuard.service.js';
import * as thread from '../../services/checkinThread.service.js';
import { emitToUser } from '../../services/realtime.service.js';
import asyncHandler from '../../utils/asyncHandler.js';
import AppError, { badRequest, forbidden, notFound } from '../../utils/AppError.js';
import { scoped } from '../../config/logger.js';

const log = scoped('notification-reply');

const MAX_REPLY_CHARS = AI_LIMITS?.INPUT_MAX_CHARS ?? 1000;

/** جلب الإشعار مع التأكد إنه ملك المستخدم */
const findOwnedNotification = async (id, userId) => {
  const notification = await prisma.notification.findFirst({
    where: { id, userId },
  });
  if (!notification) throw notFound('الإشعار غير موجود', 'NOTIFICATION_NOT_FOUND');
  return notification;
};

/**
 * بناء سياق المهمة المرتبطة بالإشعار.
 * بيرجع نص جاهز للحقن في البرومبت — أو null لو مفيش مهمة.
 */
const buildTaskContext = async (notification, userId) => {
  const taskId = notification.data?.taskId;
  if (!taskId) return null;

  const task = await prisma.task.findFirst({
    where: { id: taskId, userId },
    select: {
      title: true,
      description: true,
      isCompleted: true,
      priority: true,
      startTime: true,
      endTime: true,
      estimatedMin: true,
      goalStep: {
        select: { title: true, goal: { select: { title: true } } },
      },
    },
  });
  if (!task) return null;

  const lines = [`- المهمة: «${task.title}»`];
  if (task.description) lines.push(`- تفاصيلها: ${task.description.slice(0, 200)}`);
  if (task.startTime || task.endTime) {
    lines.push(`- وقتها: ${task.startTime ?? '؟'} → ${task.endTime ?? '؟'}`);
  } else if (task.estimatedMin) {
    lines.push(`- المدة المقدّرة: ${task.estimatedMin} دقيقة`);
  }
  lines.push(`- الحالة: ${task.isCompleted ? 'متعلّمة كمنجزة' : 'لسه مش متعلّمة كمنجزة'}`);
  if (task.goalStep?.title) lines.push(`- المرحلة في الجبل: «${task.goalStep.title}»`);
  if (task.goalStep?.goal?.title) lines.push(`- الحلم الكبير: «${task.goalStep.goal.title}»`);

  return lines.join('\n');
};

// ════════════════════════════════════════════════
//  POST /api/notifications/:id/reply
// ════════════════════════════════════════════════

export const replyToNotification = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { id } = req.params;
  const { text } = req.body ?? {};

  // ── 1) الملكية ──
  const notification = await findOwnedNotification(id, userId);

  // ── 2) هل الإشعار ده أصلاً بيقبل رد؟ ──
  if (notification.data?.canReply !== true) {
    throw forbidden('الإشعار ده مش بيقبل رد', 'NOTIFICATION_NOT_REPLYABLE');
  }

  // ── 3) التحقق من النص ──
  if (typeof text !== 'string' || !text.trim()) {
    throw badRequest('اكتب ردّك الأول', 'REPLY_REQUIRED');
  }
  if (text.length > MAX_REPLY_CHARS) {
    throw badRequest(`الرد أطول من ${MAX_REPLY_CHARS} حرف`, 'REPLY_TOO_LONG');
  }

  // ── 4) سقف الأدوار — الخيط مش شات مفتوح ──
  const existing = await thread.getThread(id);
  if (thread.countUserTurns(existing) >= thread.MAX_USER_TURNS) {
    throw new AppError(
      429,
      'خلصنا كلام هنا  افتح الشات لو لسه محتاج تكمل',
      'THREAD_LIMIT_REACHED',
    );
  }

  // ── 5) حارس المدخل: الأزمة الإنسانية أولاً ──
  const input = guard.inspectInput(text);
  if (!input.allowed) {
    if (input.action === 'CRISIS') {
      /**
       * ️ ما بننادّيش الـ AI هنا إطلاقاً. رسالة الدعم ثابتة ومراجَعة،
       *    والنموذج ممنوع يجتهد في لحظة زي دي.
       */
      await thread.appendExchange(id, text, input.reply);
      return res.status(200).json({
        success: true,
        crisis: true,
        reply: input.reply,
        source: 'CRISIS_PROTOCOL',
      });
    }
    throw badRequest(input.message ?? input.reply ?? 'الرسالة غير مقبولة', input.code);
  }

  // ── 6) السياق: المهمة + الحلم + المحادثة السابقة ──
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true, companionName: true },
  });
  const companionName = user?.companionName || 'رفيقك';
  const username = user?.username || 'يا بطل';

  const taskContext = await buildTaskContext(notification, userId);

  const system = [
    /**
     * ️ 'TASK_FOLLOWUP' — قواعد «ممنوع اللوم، الاحتواء وإعادة
     *    التوجيه، الأزمة → وضع الدعم». كانت بتسقط صامتة قبل إصلاح
     *    persona.build (كانت معرّفة في MOMENTS والدالة بتقرا MODES).
     */
    persona.build('TASK_FOLLOWUP'),
    `أنت «${companionName}» في تطبيق «بال». تخاطب «${username}».`,
    '',
    'السياق: انت بعتّله إشعار بتسأله فيه عن مهمته، وهو رد عليك',
    'من جوه الإشعار نفسه. اكتب ردّك على كلامه.',
    '',
    'قواعد الرد:',
    '· بالعامية المصرية، من سطر لتلاتة كحد أقصى.',
    '· ابنِ على اللي قاله بالتحديد — مش رد عام ينفع لأي حد.',
    '· لو أنجز: افرح معاه بصدق واذكر الحاجة بالاسم.',
    '· لو متعثّر أو مش عامل حاجة: احتويه بلا أي لوم، واعرض عليه',
    '  خطوة واحدة صغيرة جداً يقدر يعملها دلوقتي.',
    '· لو عرض مشكلة: اسأله يحب تفكّكوها سوا ولا عايز يفضفض بس.',
    '· ممنوع: الوعظ، المحاضرات، «كنموذج لغوي»، المقدمات الفاضية.',
    '· ممنوع تدّعي إنك عملت أي تعديل في التطبيق (مهام/مواعيد/منبهات).',
    '· إيموجي واحد كحد أقصى.',
    taskContext ? `\n── بيانات المهمة ──\n${taskContext}` : '',
    `\n── السؤال اللي انت بعته ──\n${notification.body}`,
  ]
    .filter(Boolean)
    .join('\n');

  // ── 7) نداء الـ AI ──
  let reply = null;
  let source = 'AI';

  try {
    const history = thread.toGeminiHistory(existing).map((m) => ({
      role: m.role,
      text: m.parts[0].text,
    }));

    const ai = await generate(system, history, text.trim(), {
      maxTokens: 220,
      temperature: 0.9,
    });
    reply = ai?.text?.trim() || null;
  } catch (error) {
    log.warn({ notificationId: id, code: error.code }, 'AI غير متاح للرد على الاطمئنان');
  }

  /**
   * ️ الـ AI مش متاح → بنقول الحقيقة صراحةً بدل ما نخترع رد باسم
   *    الرفيق. كلام المستخدم بيتحفظ عشان ما يضيعش.
   */
  if (!reply) {
    source = 'SYSTEM';
    reply = 'وصلني كلامك وسجّلته  الرفيق مش متاح دلوقتي — هيرد عليك أول ما يرجع.';
  } else {
    // ── 8) حارس المخرج ──
    const output = guard.inspectOutput(reply, { canAct: false });
    reply = output.text.trim();
    if (output.flags?.length) {
      log.info({ notificationId: id, flags: output.flags }, 'حارس المخرج عدّل الرد');
    }
  }

  // ── 9) حفظ الخيط + تعليم الإشعار مقروءاً ──
  await thread.appendExchange(id, text.trim(), reply);

  if (!notification.isRead) {
    await prisma.notification
      .update({ where: { id }, data: { isRead: true, readAt: new Date() } })
      .catch(() => {});
  }

  // ── 10) بث لباقي أجهزة المستخدم (نفس البوب-أب يتحدّث عندهم) ──
  await emitToUser(userId, 'checkin:reply', {
    notificationId: id,
    userText: text.trim(),
    reply,
    source,
    at: new Date().toISOString(),
  });

  return res.json({
    success: true,
    notificationId: id,
    reply,
    source,
    turnsLeft: Math.max(thread.MAX_USER_TURNS - (thread.countUserTurns(existing) + 1), 0),
  });
});

// ════════════════════════════════════════════════
//  POST /api/notifications/checkin/open
// ════════════════════════════════════════════════

/**
 * يفتح (أو يرجّع) خيط اطمئنان لمهمة.
 *
 * ️ ليه محتاجينه:
 *    البوب-أب بيطلع في التطبيق **لحظة ما وقت المهمة يخلص** — التطبيق
 *    عارف الميعاد بنفسه ومش مستني حد. لكن الرد لازم يتبعت على إشعار
 *    موجود في القاعدة. لو الجوب لسه ماشتغلش (أو Redis واقع)، مكانش
 *    فيه إشعار، وكلام المستخدم كان هيضيع.
 *
 * ️ Idempotent: لو فيه إشعار اطمئنان للمهمة دي أصلاً بنرجّعه بدل ما
 *    نخلق تاني — عشان الخيط والمحادثة يفضلوا مكان واحد.
 */
export const openTaskCheckIn = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { taskId } = req.body ?? {};

  if (typeof taskId !== 'string' || !taskId.trim()) {
    throw badRequest('taskId مطلوب', 'TASK_ID_REQUIRED');
  }

  // الملكية: المهمة لازم تكون بتاعته
  const task = await prisma.task.findFirst({
    where: { id: taskId, userId },
    select: { id: true, title: true },
  });
  if (!task) throw notFound('المهمة غير موجودة', 'TASK_NOT_FOUND');

  // موجود خلاص؟ رجّعه — مفيش خيطين لنفس المهمة
  const existing = await prisma.notification.findFirst({
    where: {
      userId,
      type: 'TASK_CHECKIN',
      data: { path: ['taskId'], equals: taskId },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (existing) {
    const messages = await thread.getThread(existing.id);
    return res.json({
      success: true,
      created: false,
      notificationId: existing.id,
      question: existing.body,
      messages,
      turnsLeft: Math.max(
        thread.MAX_USER_TURNS - thread.countUserTurns(messages),
        0,
      ),
    });
  }

  /**
   * ️ نص السؤال بييجي من التطبيق (`question`) لأنه هو اللي عرضه
   *    للمستخدم فعلاً — لازم اللي اتخزن يطابق اللي اتشاف. لو مبعتش،
   *    بنحط نص محايد.
   */
  const question =
    typeof req.body?.question === 'string' && req.body.question.trim()
      ? req.body.question.trim().slice(0, 400)
      : `إيه أخبار «${task.title}»؟ عملت فيها إيه؟`;

  const notification = await prisma.notification.create({
    data: {
      userId,
      type: 'TASK_CHECKIN',
      title: 'اطمئنان',
      body: question,
      /** ️ isRead=true لأن المستخدم شايفه دلوقتي في البوب-أب */
      isRead: true,
      readAt: new Date(),
      data: {
        taskId,
        taskTitle: task.title,
        source: 'CLIENT',
        reason: 'CLIENT_SCHEDULE_END',
        kind: 'checkin',
        canReply: true,
      },
    },
  });

  return res.status(201).json({
    success: true,
    created: true,
    notificationId: notification.id,
    question: notification.body,
    messages: [],
    turnsLeft: thread.MAX_USER_TURNS,
  });
});

// ════════════════════════════════════════════════
//  GET /api/notifications/:id/thread
// ════════════════════════════════════════════════

export const getNotificationThread = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { id } = req.params;

  const notification = await findOwnedNotification(id, userId);
  const messages = await thread.getThread(id);

  return res.json({
    success: true,
    notification: {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      data: notification.data,
      isRead: notification.isRead,
      createdAt: notification.createdAt,
    },
    canReply: notification.data?.canReply === true,
    messages,
    turnsLeft: Math.max(thread.MAX_USER_TURNS - thread.countUserTurns(messages), 0),
  });
});

export default { replyToNotification, getNotificationThread, openTaskCheckIn };
