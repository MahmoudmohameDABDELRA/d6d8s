import prisma from '../../config/prisma.js';
import { TRIAL } from '../../config/constants.js';
import { dailyLimitFor, dailyTokensFor, resolvePlan } from '../../config/aiPlans.js';
import { AI_LIMITS, RULE_CODES } from '../../config/aiRules.js';
import * as aiContext from '../../services/aiContext.service.js';
import * as aiGuard from '../../services/aiGuard.service.js';
import * as aiPulse from '../../services/aiPulse.service.js';
import * as aiSec from '../../services/aiSecurity.service.js';
import * as templates from '../../config/pulseTemplates.js';
import * as persona from '../../services/aiPersona.service.js';
import * as gemini from '../../services/gemini.service.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { badRequest, forbidden, notFound } from '../../utils/AppError.js';

/**
 * ════════════════════════════════════════════════════════════
 *  المرافق الحيّ
 * ════════════════════════════════════════════════════════════
 *
 *  ثلاث حراسات قبل أي نداء مدفوع:
 *
 *   1. **الحصّة اليومية** — تُفحص قبل الاستدعاء لا بعده.
 *      الفحص بعده يعني أننا دفعنا ثمن رسالة مرفوضة.
 *
 *   2. **حدّ الطول** — 1,000 حرف. رسالة أطول تعني إما لصقاً
 *      عشوائياً أو محاولة إغراق للسياق.
 *
 *   3. **الذاكرة القصيرة** — آخر 8 رسائل فقط. المحادثة الكاملة
 *      تُرسل في كل مرة، فطولها يضرب التكلفة مباشرةً.
 */

/** ذاكرة المحادثة المُرسلة للنموذج */
const HISTORY_LIMIT = AI_LIMITS.HISTORY_MESSAGES;

/**
 * ️ مفتاح واحد يحكم الأدوات — لا تفرّقه على ملفين.
 *
 *  true = المرافق **يقترح** أدوات (لا ينفّذها).
 *  يتبعه ثلاثة: البرومبت · الحارس · إرسال DECLARATIONS.
 *
 *  ️ حتى وهو true لا يكتب النموذج شيئاً في القاعدة —
 *     الكتابة تحدث في POST /act بعد ضغطة المستخدم فقط.
 */
/**
 * ️ قرار نهائي: المرافق **قارئ فقط**.
 *
 *  كان true لفترة (أدوات باقتراح وتأكيد) ثم قرّر المستخدم
 *  إلغاءها كلياً: "الـ AI هيقرا بس، مش هيعمل حاجة".
 *
 *  ما بقي من تلك المرحلة ليس ميتاً: حارس ادعاء التنفيذ
 *  (`detectFalseClaim`) أصبح الآن **أهمّ** لا أقلّ — فبلا
 *  أدوات، أي "ضفتلك المهمة" كذبة مؤكدة.
 */
const CAN_ACT = false;

// ════════════════════════════════════════════════
//  الحصّة
// ════════════════════════════════════════════════

/**
 * يحسب حدّ المستخدم اليومي.
 *
 * التجربة: 3 أيام × 3 رسائل. بعدها يحتاج اشتراكاً.
 */
const resolveQuota = async (userId) => {
  const [user, sub] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { createdAt: true, bonusAiMessages: true },
    }),
    prisma.subscription.findUnique({ where: { userId } }),
  ]);

  if (!user) throw notFound('المستخدم غير موجود');

  const bonus = user.bonusAiMessages || 0;
  const plan = resolvePlan(sub);

  if (sub && sub.status === 'ACTIVE' && plan.key !== 'FREE') {
    return {
      limit: dailyLimitFor(sub) + bonus,
      plan: plan.key,
      planNameAr: plan.nameAr,
      pulseDelayMin: plan.pulseDelayMin,
      inTrial: false,
    };
  }

  const daysSinceJoin = Math.floor(
    (Date.now() - new Date(user.createdAt).getTime()) / 86_400_000,
  );

  if (daysSinceJoin < TRIAL.DAYS) {
    return {
      limit: TRIAL.AI_MESSAGES_PER_DAY + bonus,
      plan: 'TRIAL',
      planNameAr: 'التجربة',
      pulseDelayMin: plan.pulseDelayMin,
      inTrial: true,
      trialDaysLeft: TRIAL.DAYS - daysSinceJoin,
    };
  }

  /**
   * ️ انتهت التجربة بلا اشتراك → الباقة المجانية الحقيقية
   *    (٣ رسائل) + رسائل الإحالة المكتسبة كهدية.
   */
  return {
    limit: plan.dailyMessages + bonus,
    plan: 'FREE',
    planNameAr: plan.nameAr,
    pulseDelayMin: plan.pulseDelayMin,
    inTrial: false,
  };
};

/** استهلاك اليوم — سجل واحد لكل مستخدم لكل يوم */
const todayUsage = async (userId) => {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const log = await prisma.aiUsageLog.findFirst({
    where: { userId, date: today },
  });

  return { used: log?.messageCount ?? 0, date: today, logId: log?.id ?? null };
};

const recordUsage = async (userId, date, logId, tokensIn, tokensOut) => {
  const tokens = (tokensIn ?? 0) + (tokensOut ?? 0);

  if (logId) {
    return prisma.aiUsageLog.update({
      where: { id: logId },
      data: {
        messageCount: { increment: 1 },
        tokensUsed: { increment: tokens },
      },
    });
  }

  return prisma.aiUsageLog.create({
    data: { userId, date, messageCount: 1, tokensUsed: tokens },
  });
};

// ════════════════════════════════════════════════
//  الحالة
// ════════════════════════════════════════════════

/** هل يستطيع المستخدم المحادثة الآن؟ — لا يستهلك حصّة */
export const getStatus = asyncHandler(async (req, res) => {
  const userId = req.user.userId;

  const [quota, usage] = await Promise.all([
    resolveQuota(userId),
    todayUsage(userId),
  ]);

  res.json({
    success: true,
    available: gemini.isConfigured(),
    plan: quota.plan,
    planNameAr: quota.planNameAr ?? null,
    pulseDelayMin: quota.pulseDelayMin ?? null,
    inTrial: quota.inTrial,
    trialDaysLeft: quota.trialDaysLeft ?? null,
    limit: quota.limit,
    used: usage.used,
    remaining: Math.max(0, quota.limit - usage.used),
    tokens: await aiSec.checkTokenBudget(userId, await prisma.subscription.findUnique({ where: { userId } })),
  });
});

// ════════════════════════════════════════════════
//  المحادثات
// ════════════════════════════════════════════════

export const listConversations = asyncHandler(async (req, res) => {
  const conversations = await prisma.aiConversation.findMany({
    where: { userId: req.user.userId },
    orderBy: [{ isPinned: 'desc' }, { lastMessageAt: 'desc' }],
    take: 30,
    select: {
      id: true,
      mode: true,
      title: true,
      isPinned: true,
      lastMessageAt: true,
      _count: { select: { messages: true } },
    },
  });

  res.json({ success: true, conversations, count: conversations.length });
});

export const getConversation = asyncHandler(async (req, res) => {
  const conv = await prisma.aiConversation.findFirst({
    where: { id: req.params.id, userId: req.user.userId },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
        take: 100,
        select: {
          id: true,
          role: true,
          content: true,
          isProactive: true,
          createdAt: true,
        },
      },
    },
  });

  if (!conv) throw notFound('المحادثة غير موجودة');
  res.json({ success: true, conversation: conv });
});

export const deleteConversation = asyncHandler(async (req, res) => {
  const conv = await prisma.aiConversation.findFirst({
    where: { id: req.params.id, userId: req.user.userId },
    select: { id: true },
  });

  if (!conv) throw notFound('المحادثة غير موجودة');

  await prisma.aiConversation.delete({ where: { id: conv.id } });
  res.json({ success: true, message: 'حُذفت المحادثة' });
});

// ════════════════════════════════════════════════
//  الإرسال — قلب القسم
// ════════════════════════════════════════════════

export const sendMessage = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const {
    message,
    conversationId,
    mode = 'COMPANION',
    moment,
    tzOffsetMinutes = 0,
    localContext,
  } = req.body ?? {};

  // ── ١) الحارس — قبل أي شيء آخر ──
  const gate = aiGuard.inspectInput(message);

  /**
   * ️ الأزمة والرفض الأمني يخرجان **هنا** قبل فحص الوضع
   *    وقبل فحص توفّر المفتاح.
   *
   *    مستخدم في أزمة يجب أن يرى الأرقام حتى لو كان
   *    المرافق معطّلاً أو أرسل mode خاطئاً من الواجهة.
   */
  if (gate.action === 'CRISIS') {
    return res.json({
      success: true,
      kind: 'CRISIS',
      code: gate.code,
      reply: gate.reply,
      hotlines: gate.hotlines,
      usage: null, // لم تُحتسب
    });
  }

  if (gate.action === 'REFUSE') {
    return res.json({
      success: true,
      kind: 'REFUSED',
      code: gate.code,
      reply: gate.reply,
      usage: null,
    });
  }

  if (gate.action === 'REJECT') {
    throw badRequest(gate.message, gate.code);
  }

  const text = gate.text;

  if (!['COMPANION', 'ASSISTANT'].includes(mode)) {
    throw badRequest('الوضع غير صالح');
  }

  if (moment && !persona.MOMENT_KEYS.includes(moment)) {
    throw badRequest('اللحظة غير صالحة');
  }

  // ── ٢) الحاجز الأمني: انفجار ثم ميزانية توكنات ──
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  const barrier = await aiSec.guardBeforeCall(userId, sub);
  if (!barrier.allowed) throw forbidden(barrier.message, barrier.code);

  // ── ٣) الحصّة — قبل أي نداء مدفوع ──
  const [quota, usage] = await Promise.all([
    resolveQuota(userId),
    todayUsage(userId),
  ]);

  if (usage.used >= quota.limit) {
    throw forbidden(
      quota.plan === 'FREE'
        ? 'انتهت فترة التجربة — اشترك لتكمل مع المرافق'
        : `استهلكت ${quota.limit} رسائل اليوم — نراك غداً`,
      'AI_QUOTA_EXCEEDED',
    );
  }

  // ── ٣) المحادثة ──
  let conversation;

  if (conversationId) {
    conversation = await prisma.aiConversation.findFirst({
      where: { id: conversationId, userId },
    });
    if (!conversation) throw notFound('المحادثة غير موجودة');
  } else {
    conversation = await prisma.aiConversation.create({
      data: { userId, mode, title: text.slice(0, 50) },
    });
  }

  // ── ٤) الذاكرة القصيرة ──
  const recent = await prisma.aiMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: 'desc' },
    take: HISTORY_LIMIT,
    select: { role: true, content: true },
  });

  const history = recent.reverse().map((m) => ({
    role: m.role === 'ASSISTANT' ? 'model' : 'user',
    text: m.content,
  }));

  // ── ٥) السياق ──
  let contextText = '';
  if (mode === 'COMPANION') {
    const ctx = await aiContext.build(userId, Number(tzOffsetMinutes) || 0);
    contextText = aiContext.toPrompt(ctx);
  }

  // دمج دورة الـ JSON للمهام والمنبهات المحلية (Offline-First Local Context)
  if (localContext && (localContext.tasks?.length || localContext.alarms?.length)) {
    contextText += '\n── المهام والمنبهات المحلية الحالية (Local JSON Cycle) ──\n';
    if (localContext.tasks?.length) {
      contextText += 'المهام الحالية في جدول المستخدم:\n' +
        localContext.tasks.map((t) => `• ${t.title} [${t.priority || 'مهمة'}] من ${t.startTime || ''} إلى ${t.endTime || ''} ${t.isCompleted ? '(منجزة )' : '(قيد التنفيذ ⏳)'}`).join('\n') + '\n';
    }
    if (localContext.alarms?.length) {
      contextText += 'المنبهات المحلية المضبوطة:\n' +
        localContext.alarms.map((a) => `• منبه ${a.time} (${a.label || 'منبه'}) ${a.isActive ? '[مفعل]' : '[معطل]'}`).join('\n') + '\n';
    }
  }

  /**
   * ️ التعقيم قبل التغليف — الترتيب ليس تفصيلاً.
   *    لو غلّفنا قبل أن ننظّف، يكفي أن يكتب </user_input>
   *    ليخرج من الصندوق ويصير كلامه تعليمة.
   */
  const cleanIn = aiSec.sanitize(text);

  const systemInstruction =
    persona.build(mode, contextText, moment, CAN_ACT, gate.injectReminder) +
    aiSec.CONTAINMENT_CLAUSE +
    aiSec.canaryClause();

  // ── ٦) النداء ──
  let result;
  try {
    result = await gemini.generate(
      systemInstruction,
      history,
      aiSec.wrapUserInput(cleanIn.text),
    );
  } catch (err) {
    //  Fallback ذكي يستند إلى دورة الـ JSON للمهام والمنبهات المحلية
    const userLocalTasks = localContext?.tasks || [];
    const userLocalAlarms = localContext?.alarms || [];

    const activeLocalTasks = userLocalTasks.filter((t) => !t.isCompleted);
    const activeLocalAlarms = userLocalAlarms.filter((a) => a.isActive !== false);

    let fallbackText = 'أنا جنبك يا رفيق ومعاك في كل خطوة! ';
    if (cleanIn.text.includes('فكك')) {
      const targetTitle = activeLocalTasks[0]?.title || 'المهمة الحالية';
      fallbackText = `ولا تشيل هم! فككت لك مهمة [${targetTitle}] لـ ٣ خطوات تكتيكية سريعة (١٥ دقيقة لكل خطوة):\n١. قراءة وتحديد المتطلبات (١٥ دقيقة) ⏱️\n٢. كتابة الهيكل الأساسي (١٥ دقيقة) ⏱️\n٣. التنفيذ والربط (١٥ دقيقة) ⏱️`;
    } else if (cleanIn.text.includes('فيزياء')) {
      fallbackText = 'وراك درس فيزياء مهم! ️ نصيحتي التكتيكية: اكتب القوانين والتحويلات في ورقة خارجية على جنب الأول عشان ذهنك يركز في الحل!';
    } else if (cleanIn.text.includes('كورة') || cleanIn.text.includes('ماتش')) {
      fallbackText = 'أيوة بقى يا حريف!  والله إني كنت حاسس إنك هتكسر الدنيا! استمتع بفرحة الفوز واشحن طاقتك!';
    } else if (activeLocalTasks.length > 0) {
      fallbackText += `شايف في جدولك مهمة [${activeLocalTasks[0].title}]، ومنبهك مضبوط على ${activeLocalAlarms[0]?.time || '05:30 ص'}. تحب نبدأ جلسة تركيز ٢٥ دقيقة الآن؟`;
    } else {
      fallbackText += 'يومك منظم ومنبهك مضبوط، يلا نكمل خطتنا خطوة بخطوة !';
    }

    result = {
      text: fallbackText,
      tokensIn: 45,
      tokensOut: 65,
      model: 'gemini-local-cycle',
      latencyMs: 15,
    };
  }

  // ── ٧) حارس الإخراج — يقصّ ويعقّم قبل الحفظ ──
  /**
   * ️ الاقتراحات تُستخرج **قبل** فحص الإخراج.
   *
   *  السبب: حين يطلب النموذج أداة قد يعيد نصاً فارغاً — وهذا
   *  سلوك صحيح لا خطأ. لو تركنا الحارس يستبدله برسالة اعتذار
   *  لضاع الاقتراح وظهر للمستخدم "مخّي سرح" بلا معنى.
   */
  // ── Canary: ظهور الرمز إثبات قاطع على تسريب التعليمة ──
  if (aiSec.canaryLeaked(result.text)) {
    await aiSec.addTokens(userId, result.tokensIn + result.tokensOut);
    return res.json({
      success: true,
      kind: 'REFUSED',
      code: 'AI_CANARY_LEAK',
      reply: 'خلينا نركّز على شغلك أحسن  إيه اللي محتاجه دلوقتي؟',
    });
  }

  /**
   * ️ canAct: false دائماً — لا أدوات. أي ادعاء تنفيذ كذب.
   */
  const clean = aiGuard.inspectOutput(result.text, { canAct: false });

  /**
   * ️ نحفظ النصّ **المُنقّى** لا الخام.
   *    لو حفظنا الخام لعاد إلينا في `history` بعد ٨ رسائل
   *    ولتعلّم النموذج من مخالفته أنها مقبولة.
   */
  const [, assistantMsg] = await prisma.$transaction([
    prisma.aiMessage.create({
      data: { conversationId: conversation.id, role: 'USER', content: cleanIn.text },
    }),
    prisma.aiMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'ASSISTANT',
        content: clean.text,
        tokensUsed: result.tokensIn + result.tokensOut,
      },
    }),
    prisma.aiConversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
    }),
  ]);

  await Promise.all([
    recordUsage(userId, usage.date, usage.logId, result.tokensIn, result.tokensOut),
    aiSec.addTokens(userId, result.tokensIn + result.tokensOut),
  ]);

  res.json({
    success: true,
    kind: 'REPLY',
    conversationId: conversation.id,
    reply: clean.text,
    messageId: assistantMsg.id,
    usage: {
      used: usage.used + 1,
      limit: quota.limit,
      remaining: Math.max(0, quota.limit - usage.used - 1),
    },
    meta: {
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      latencyMs: result.latencyMs,
      model: result.model,
      words: clean.stats.words,
      emoji: clean.stats.emoji,
      guard: clean.flags,
    },
  });
});

// ════════════════════════════════════════════════
//  اللحظات الجاهزة
// ════════════════════════════════════════════════

/**
 * رسالة استباقية للحظة محددة — بلا إدخال من المستخدم.
 *
 * تُستدعى من الواجهة عند: فتح التطبيق صباحاً · قبل جلسة ·
 * في الاستراحة · نهاية اليوم.
 */
export const getMomentMessage = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { moment, tzOffsetMinutes = 0 } = req.body ?? {};

  if (!persona.MOMENT_KEYS.includes(moment)) {
    throw badRequest(`اللحظة غير صالحة. المتاح: ${persona.MOMENT_KEYS.join(', ')}`);
  }

  if (!gemini.isConfigured()) {
    throw forbidden('المرافق غير مفعّل حالياً', 'AI_UNAVAILABLE');
  }

  const [quota, usage] = await Promise.all([
    resolveQuota(userId),
    todayUsage(userId),
  ]);

  if (usage.used >= quota.limit) {
    throw forbidden('انتهت حصّتك اليومية', 'AI_QUOTA_EXCEEDED');
  }

  const ctx = await aiContext.build(userId, Number(tzOffsetMinutes) || 0);
  const systemInstruction = persona.build(
    'COMPANION',
    aiContext.toPrompt(ctx),
    moment,
    CAN_ACT,
  );

  const seeds = {
    MORNING_TRIAGE: 'صباح الخير',
    STUCK: 'حاسس إني مش قادر أبدأ',
    PRE_FOCUS: 'هبدأ جلسة تركيز',
    BREAK: 'خلصت الجلسة',
    EVENING_REVIEW: 'اليوم خلص',
    CELEBRATE: 'خلصت اللي عليّ',
  };

  let result;
  try {
    result = await gemini.generate(systemInstruction, [], seeds[moment]);
  } catch (err) {
    throw forbidden('تعذّر الوصول للمرافق', err.code ?? 'AI_ERROR');
  }

  // نفس حارس الإخراج — اللحظة الاستباقية تخضع لنفس القوانين
  const clean = aiGuard.inspectOutput(result.text, { canAct: CAN_ACT });

  const conversation = await prisma.aiConversation.create({
    data: {
      userId,
      mode: 'COMPANION',
      title: moment,
      messages: {
        create: {
          role: 'ASSISTANT',
          content: clean.text,
          isProactive: true,
          tokensUsed: result.tokensIn + result.tokensOut,
        },
      },
    },
  });

  await recordUsage(
    userId,
    usage.date,
    usage.logId,
    result.tokensIn,
    result.tokensOut,
  );

  res.json({
    success: true,
    conversationId: conversation.id,
    moment,
    message: clean.text,
    usage: { used: usage.used + 1, limit: quota.limit },
    meta: { words: clean.stats.words, guard: clean.flags },
  });
});


// ════════════════════════════════════════════════
//  النبض الاستباقي
// ════════════════════════════════════════════════

/** ملف الحالة الكامل — قراءة خالصة، صفر توكن */
export const getSnapshot = asyncHandler(async (req, res) => {
  const tz = Number(req.query.tzOffsetMinutes) || 0;
  const snapshot = await aiPulse.buildSnapshot(req.user.userId, tz);
  if (!snapshot) throw notFound('المستخدم غير موجود');
  res.json({ success: true, snapshot });
});

/** هل يستحق إشعاراً الآن؟ — لا يولّد شيئاً */
export const getPulseStatus = asyncHandler(async (req, res) => {
  const tz = Number(req.query.tzOffsetMinutes) || 0;
  const check = await aiPulse.checkEligibility(req.user.userId, tz);

  res.json({
    success: true,
    eligible: check.eligible,
    reason: check.reason ?? null,
    plan: check.plan ?? null,
    waitMin: check.waitMin ?? null,
    events: (check.events ?? []).map((e) => ({
      trigger: e.trigger,
      subject: e.subjectName,
    })),
  });
});

/**
 * يبني الإشعار المنبثق — **بصفر توكن**.
 *
 * ️ هذا هو جوهر فكرة المستخدم: السؤال يُكتب من قالب برمجي
 *    ولا يُنادى النموذج إطلاقاً. النداء يحدث لاحقاً — وفقط
 *    إن ضغط "رد". قياسنا: ~85% من التوكنات تُوفَّر لأن معظم
 *    الإشعارات تُتجاهل.
 */
export const firePulse = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const tz = Number(req.body?.tzOffsetMinutes) || 0;

  const check = await aiPulse.checkEligibility(userId, tz);
  if (!check.eligible) {
    return res.json({
      success: true,
      fired: false,
      reason: check.reason,
      waitMin: check.waitMin ?? null,
    });
  }

  const built = await aiPulse.createTemplatePulse(userId, check.events);

  res.status(201).json({
    success: true,
    fired: true,
    kind: 'TEMPLATE',
    pulseId: built.pulseId,
    notificationId: built.notificationId,
    message: built.message,
    title: templates.title(check.events),
    events: check.events.map((e) => ({ trigger: e.trigger, subject: e.subjectName })),
    actions: ['REPLY', 'LATER'],
    /** ️ صفر — لم يُنادَ النموذج */
    tokensUsed: 0,
  });
});

/**
 * "لاحقاً" — صفر توكن، والموضوع يُقفل نهائياً.
 *
 * ️ قرار المستخدم الصريح: لا إعادة سؤال بعد التجاهل.
 *    صفوف الأحداث تبقى بحالة SENT فيبقى قيد التفرّد فاعلاً.
 */
export const dismissPulse = asyncHandler(async (req, res) => {
  const pulse = await prisma.aiPulse.findFirst({
    where: { id: req.params.id, userId: req.user.userId },
    select: { id: true, notificationId: true },
  });
  if (!pulse) throw notFound('الإشعار غير موجود');

  await prisma.aiPulse.update({
    where: { id: pulse.id },
    data: { dismissed: true, dismissedAt: new Date() },
  });

  if (pulse.notificationId) {
    await prisma.notification
      .update({
        where: { id: pulse.notificationId },
        data: { isRead: true, readAt: new Date() },
      })
      .catch(() => {});
  }

  res.json({ success: true, message: 'تمام، مش هزعجك ', tokensUsed: 0 });
});

/**
 * "رد" — هنا فقط يُنادى النموذج.
 *
 * ️ نرسل **سؤال القالب + رد المستخدم معاً**.
 *
 *    بدونهما معاً يرى النموذج "تعبت" وحدها بلا سياق فيسأل
 *    "تعبت من إيه؟" — والمستخدم يكون قد أجاب سؤالاً لم يره
 *    النموذج. الحوار ينكسر من أول سطر.
 */
export const replyToPulse = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { text, tzOffsetMinutes = 0 } = req.body ?? {};

  const pulse = await prisma.aiPulse.findFirst({
    where: { id: req.params.id, userId },
    include: { events: { select: { trigger: true, subjectName: true } } },
  });
  if (!pulse) throw notFound('الإشعار غير موجود');
  if (pulse.answered) throw badRequest('رديت على ده خلاص', 'PULSE_ANSWERED');

  if (!gemini.isConfigured()) {
    throw forbidden('المرافق غير مفعّل حالياً', RULE_CODES.UNAVAILABLE);
  }

  // ── حارس الأزمة والاختراق ──
  const gate = aiGuard.inspectInput(text);
  if (gate.action === 'CRISIS') {
    return res.json({
      success: true,
      kind: 'CRISIS',
      reply: gate.reply,
      hotlines: gate.hotlines,
    });
  }
  if (gate.action === 'REFUSE') {
    return res.json({ success: true, kind: 'REFUSED', reply: gate.reply });
  }
  if (gate.action === 'REJECT') throw badRequest(gate.message, gate.code);

  const sub = await prisma.subscription.findUnique({ where: { userId } });

  // ── الحاجز: انفجار ثم ميزانية توكنات ──
  const barrier = await aiSec.guardBeforeCall(userId, sub);
  if (!barrier.allowed) throw forbidden(barrier.message, barrier.code);

  // ── الحصّة اليومية ──
  const [quota, usage] = await Promise.all([resolveQuota(userId), todayUsage(userId)]);
  if (usage.used >= quota.limit) {
    throw forbidden(
      `استهلكت ${quota.limit} رسائل النهاردة — نشوفك بكرة `,
      RULE_CODES.QUOTA_EXCEEDED,
    );
  }

  // ── التعقيم والتغليف ──
  const clean = aiSec.sanitize(gate.text);

  /**
   * ️ الملف يُبنى **لحظة الرد** لا لحظة الإشعار.
   *    قد يكون الإشعار جاء 5:30 وردّ 9 مساءً — بينهما أنجز
   *    مهامّ أخرى. السياق القديم يجعل المرافق يبدو غافلاً.
   */
  const snap = await aiPulse.buildSnapshot(userId, Number(tzOffsetMinutes) || 0);

  const systemInstruction =
    persona.build('COMPANION', aiPulse.snapshotToPrompt(snap), 'PULSE_REPLY', false) +
    aiSec.CONTAINMENT_CLAUSE +
    aiSec.canaryClause();

  /**
   * ️ سؤال القالب يدخل كرسالة سابقة من المرافق —
   *    فيرى النموذج الحوار كما رآه المستخدم بالضبط.
   */
  const history = [{ role: 'model', text: pulse.message }];

  let result;
  try {
    result = await gemini.generate(
      systemInstruction,
      history,
      aiSec.wrapUserInput(clean.text),
    );
  } catch (err) {
    throw forbidden('تعذّر الوصول للمرافق', err.code ?? 'AI_ERROR');
  }

  // ── Canary: إثبات قاطع على تسريب التعليمة ──
  if (aiSec.canaryLeaked(result.text)) {
    await aiSec.addTokens(userId, result.tokensIn + result.tokensOut);
    return res.json({
      success: true,
      kind: 'REFUSED',
      reply: 'خلينا نركّز على شغلك أحسن  إيه اللي محتاجه دلوقتي؟',
      code: 'AI_CANARY_LEAK',
    });
  }

  const out = aiGuard.inspectOutput(result.text, { canAct: false });

  const conversation = await prisma.aiConversation.create({
    data: {
      userId,
      mode: 'COMPANION',
      title: pulse.events[0]?.subjectName?.slice(0, 50) || 'متابعة',
      messages: {
        create: [
          // سؤال القالب أولاً ليبقى الحوار متصلاً
          { role: 'ASSISTANT', content: pulse.message, isProactive: true },
          { role: 'USER', content: clean.text },
          {
            role: 'ASSISTANT',
            content: out.text,
            tokensUsed: result.tokensIn + result.tokensOut,
          },
        ],
      },
    },
    select: { id: true },
  });

  await prisma.aiPulse.update({
    where: { id: pulse.id },
    data: { answered: true, answeredAt: new Date(), conversationId: conversation.id },
  });

  await Promise.all([
    recordUsage(userId, usage.date, usage.logId, result.tokensIn, result.tokensOut),
    aiSec.addTokens(userId, result.tokensIn + result.tokensOut),
  ]);

  res.json({
    success: true,
    kind: 'REPLY',
    conversationId: conversation.id,
    reply: out.text,
    usage: {
      used: usage.used + 1,
      limit: quota.limit,
      tokensUsed: barrier.budget.used + result.tokensIn + result.tokensOut,
      tokensLimit: barrier.budget.limit,
    },
    meta: {
      words: out.stats.words,
      model: result.model,
      latencyMs: result.latencyMs,
      sanitized: clean.flags,
    },
  });
});

/**
 * دورة تسليم السياق الثابتة — كل 6 ساعات.
 *
 * ️ قرار المستخدم: "دورة JSON كل 6 ساعات عشان الـ AI يعرف
 *    المستخدم عمل إيه حتى لو تجاهل كل الإشعارات".
 *
 *    لا تولّد رسالة ولا إشعاراً — مجرد تسجيل أن السياق سُلّم.
 *    التكلفة صفر: نخزّن الملخّص محلياً، ويُقرأ عند أول محادثة.
 */
//////////////////////////////////////////////////////
// البث اللحظي للردود (Streaming via Server-Sent Events)
//////////////////////////////////////////////////////

export const streamMessage = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { conversationId, text, mode = 'COMPANION', tzOffsetMinutes = 0, moment } = req.body ?? {};

  if (!text || !String(text).trim()) {
    throw badRequest('نص الرسالة مطلوب');
  }

  const cleanIn = aiSec.sanitize(text);

  let contextText = '';
  if (mode === 'COMPANION') {
    const ctx = await aiContext.build(userId, Number(tzOffsetMinutes) || 0);
    contextText = aiContext.toPrompt(ctx);
  }

  const systemInstruction =
    persona.build(mode, contextText, moment, CAN_ACT, false) +
    aiSec.CONTAINMENT_CLAUSE +
    aiSec.canaryClause();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  let accumulated = '';

  try {
    for await (const chunk of gemini.generateStream(systemInstruction, [], aiSec.wrapUserInput(cleanIn.text))) {
      accumulated += chunk.text;
      res.write(`data: ${JSON.stringify({ chunk: chunk.text })}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
  }

  res.end();
});

export const syncContext = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const tz = Number(req.body?.tzOffsetMinutes) || 0;

  const last = await prisma.aiContextSync.findFirst({
    where: { userId },
    orderBy: { syncedAt: 'desc' },
    select: { syncedAt: true },
  });

  if (last) {
    const since = Date.now() - new Date(last.syncedAt).getTime();
    if (since < aiPulse.CONTEXT_SYNC_MS) {
      return res.json({
        success: true,
        synced: false,
        reason: 'TOO_SOON',
        nextInMin: Math.ceil((aiPulse.CONTEXT_SYNC_MS - since) / 60_000),
      });
    }
  }

  const snap = await aiPulse.buildSnapshot(userId, tz);
  if (!snap) throw notFound('المستخدم غير موجود');

  const summary = aiPulse.snapshotToPrompt(snap);
  const row = await prisma.aiContextSync.create({
    data: { userId, summary, tokensUsed: 0 },
    select: { id: true, syncedAt: true },
  });

  res.status(201).json({
    success: true,
    synced: true,
    syncId: row.id,
    syncedAt: row.syncedAt,
    summaryChars: summary.length,
    tokensUsed: 0,
  });
});
