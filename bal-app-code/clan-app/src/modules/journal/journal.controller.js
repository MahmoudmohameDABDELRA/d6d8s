import prisma from '../../config/prisma.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { badRequest, conflict, forbidden, notFound } from '../../utils/AppError.js';
import * as v from '../../utils/validate.js';
import * as dreamPlanner from '../../services/dreamPlanner.service.js';
import * as journeyScheduler from '../../services/journeyScheduler.service.js';
import { bootstrapStepJourney } from '../../services/journeyBootstrap.service.js';
import { localDate } from '../../services/streak.service.js';

/**
 * ════════════════════════════════════════════════════════════
 *  التوثيق الأسبوعي — كبسولات زمنية مقفولة
 * ════════════════════════════════════════════════════════════
 *
 *  الفكرة: المستخدم يوثّق كل أسبوع من رحلة هدفه،
 *  ثم يُقفل التوثيق نهائياً فلا يستطيع تجميل الماضي.
 *
 *  الأثر النفسي: بعد شهور يقرأ ما كتبه ويرى كيف تغيّر فعلاً،
 *  لا كيف يتمنى أنه كان.
 *
 *  ثلاثة قرارات تصميمية:
 *
 *   1. القفل ليس مطلقاً — نافذة ٥ دقائق للتصحيح الإملائي.
 *      الحبس على خطأ مطبعي يُحبط، والنافذة لا تكفي
 *      لإعادة كتابة التاريخ.
 *
 *   2. التخطي نهائي — من تخطّى أسبوعاً لا يعود إليه.
 *      وإلا صار "التوثيق الأسبوعي" توثيقاً متى شئت.
 *
 *   3. الوعد المكتوب يظهر فوق كل أسبوع — تذكير دائم
 *      بسبب البداية.
 */

// ════════════════════════════════════════════════
//  الثوابت
// ════════════════════════════════════════════════

/** نافذة التصحيح بعد الحفظ */
const EDIT_WINDOW_MS = 10 * 60 * 1000; // رؤية «بال»: نافذة التعديل 10 دقائق بعد الحفظ

/** رسالة المستقبل تصل بعد شهر */
const FUTURE_NOTE_DAYS = 30;

/** حد الأهداف النشطة — ثلاثة أهداف = ثلاث رحلات متوازية، وهذا كثير */
const MAX_ACTIVE_GOALS = 3;

const LIMITS = {
  title: 120,
  vision: 500,
  pledge: 300,
  weekTitle: 120,
  answer: 2000,
  futureNote: 1000,
};

// ════════════════════════════════════════════════
//  مساعدات
// ════════════════════════════════════════════════

/** نصّ مطلوب — يرفض الفراغ والمسافات فقط */
/**
 * ️ يفوّض للمحقّق المشترك بدل تكرار المنطق.
 *
 *  الفحوص هنا كانت سليمة أصلاً (تفحص النوع لا تحوّله)، لكن
 *  وجود نسختين من نفس المنطق يعني أن إصلاح إحداهما لا يصل
 *  للأخرى. نُبقي التوقيع كي لا نلمس ثلاثين نداءً.
 */
const requireText = (value, field, max) =>
  v.requireString(value, field, { max });

/** نصّ اختياري — يرجع null لا سلسلة فارغة */
const optionalText = (value, field, max) =>
  v.optionalString(value, field, { max });

/** يتحقق من الملكية — وجود الهدف لا يكفي */
const findOwnedGoal = async (goalId, userId, include = undefined) => {
  const goal = await prisma.goal.findFirst({
    where: { id: goalId, userId },
    include,
  });
  if (!goal) throw notFound('الهدف غير موجود');
  return goal;
};

/** يتحقق من ملكية الأسبوع عبر هدفه */
const findOwnedWeek = async (weekId, userId) => {
  const week = await prisma.goalWeek.findFirst({
    where: { id: weekId, goal: { userId } },
    include: { goal: true },
  });
  if (!week) throw notFound('الأسبوع غير موجود');
  return week;
};

/**
 * هل ما زال التعديل ممكناً؟
 *
 * ️ نحسب من documentedAt لا من lockedAt.
 *    lockedAt يُضبط عند التوثيق أيضاً، لكنه للعرض فقط —
 *    الاعتماد عليه في الحساب يجعل النافذة صفراً.
 */
const isEditable = (week) => {
  if (week.status !== 'DOCUMENTED') return false;
  if (!week.documentedAt) return false;
  return Date.now() - new Date(week.documentedAt).getTime() < EDIT_WINDOW_MS;
};

/** الثواني المتبقية في نافذة التعديل */
const editSecondsLeft = (week) => {
  if (!isEditable(week)) return 0;
  const elapsed = Date.now() - new Date(week.documentedAt).getTime();
  return Math.max(0, Math.ceil((EDIT_WINDOW_MS - elapsed) / 1000));
};

/** يُلبس الأسبوع بحقول محسوبة للواجهة */
const decorate = (week) => ({
  ...week,
  canEdit: isEditable(week),
  editSecondsLeft: editSecondsLeft(week),
});

//////////////////////////////////////////////////////
// الأهداف
//////////////////////////////////////////////////////

/**
 * إنشاء هدف كبير.
 *
 * ينشئ معه الأسبوع الأول تلقائياً — لأن هدفاً بلا أسبوع
 * شاشة فارغة، والمستخدم لا يعرف ماذا يفعل بعدها.
 */
/**
 * ════════════════════════════════════════════════════════════
 *  جبل الأهداف — مسار الحلم (الرؤية الجديدة «بال»)
 *
 *  1) POST /api/goals/dream { title }        → يسأل الـ AI أسئلة الكويز
 *  2) POST /api/goals/dream/:id/answers      → يرسل الإجابات → الـ AI يبني خطة
 *  3) POST /api/goals/dream/:id/approve      → يوافق المستخدم → تُثبَّت الخطة (Goal + GoalSteps)
 *
 *  ⚠️ صارم: الخطة تولّد في السيرفر فقط (العميل لا يرسل خطوات أبداً).
 *     الـ AI غير متاح → 503 صريح — لا بيانات وهمية.
 * ════════════════════════════════════════════════════════════
 */

/** 1) توليد أسئلة الكويز + إنشاء هدف مسودة */
export const createDream = asyncHandler(async (req, res) => {
  const { title } = req.body ?? {};
  const trimmed = v.requireString(title, 'الهدف', { max: 120 });

  const user = await prisma.user.findUnique({ where: { id: req.user.userId } });

  // الـ AI غير متاح → خطأ صريح قبل إنشاء أي شيء
  if (!dreamPlanner.isDreamPlannerReady()) {
    return res.status(503).json({
      success: false,
      code: 'GEMINI_NOT_CONFIGURED',
      message: 'الرفيق غير متاح حالياً — تأكد من ضبط مفتاح الذكاء الاصطناعي في السيرفر',
    });
  }

  let questions;
  try {
    questions = await dreamPlanner.generateQuizQuestions({
      username: user.username,
      dreamTitle: trimmed,
      companionName: user.companionName,
      /**
       * ️ بياناته من الأونبوردنج — كانت متخزنة ومابتوصلش للـ AI،
       *    فكان بيسأله عن مجاله وهو مختاره بإيده قبل كده.
       */
      profile: {
        interests: user.interests,
        specialty: user.specialty,
        timezone: user.timezone,
      },
    });
  } catch (e) {
    return res.status(503).json({
      success: false,
      code: e.code === 'GEMINI_QUOTA' ? 'GEMINI_QUOTA' : 'AI_UNAVAILABLE',
      message: 'الرفيق مشغول حالياً — حاول بعد قليل',
    });
  }

  // مسودة: لا تظهر في القوائم النشطة حتى موافقة المستخدم
  const draft = await prisma.goal.create({
    data: {
      userId: user.id,
      title: trimmed,
      draft: true,
      isActive: false,
    },
  });

  return res.status(201).json({
    success: true,
    draftGoalId: draft.id,
    questions: questions.questions,
  });
});

/**
 * 1ب) استئناف مسودة معلّقة — `GET /goals/dream/pending`
 *
 * ️ الثغرة اللي بيقفلها:
 *
 *  `listGoals` بيفلتر `draft: false` في **كل** الفلاتر، يعني
 *  المسودة مش ظاهرة في أي قايمة. والمعالج فيه ٣ نداءات AI كل
 *  واحد ممكن ياخد ٢٥ ثانية — احتمال إن المستخدم يقفل التطبيق
 *  في النص كبير جداً.
 *
 *  النتيجة كانت: الحلم اللي كتبه والخطة اللي اتولدت **بيضيعوا
 *  نهائياً**. مفيش أي مسار يرجّعهم، والمستخدم لازم يبدأ من الأول
 *  — واللي بيحصل عملياً إنه مش بيبدأ تاني.
 *
 *  ️ إخفاء المسودة عن القوايم **قرار صح** ومش هنغيّره: الجبل
 *    نصف المبني مش هدف، وعرضه في شاشة الأهداف بيلخبط. المسار
 *    ده منفصل عشان التطبيق يسأل عنه صراحةً عند الفتح.
 *
 *  الأسئلة نفسها مش متخزّنة (بتترجع وخلاص)، فالاستئناف بيرجّع
 *  المستخدم لأقرب نقطة ممكنة:
 *    · فيه خطوات؟ → مرحلة عرض الخطة (جاهزة للموافقة)
 *    · مفيش؟      → مرحلة الأسئلة بعنوان حلمه محفوظ
 */
export const getPendingDream = asyncHandler(async (req, res) => {
  const draft = await prisma.goal.findFirst({
    where: { userId: req.user.userId, draft: true },
    orderBy: { createdAt: 'desc' },
    include: {
      steps: {
        orderBy: { order: 'asc' },
        select: { id: true, title: true, description: true, order: true },
      },
    },
  });

  if (!draft) {
    return res.json({ success: true, pending: null });
  }

  /**
   * ️ المسودة القديمة جداً مش استئناف — دي نسيان.
   *
   *    لو المستخدم ساب حلم من أسبوع، عرضه عليه دلوقتي بيبقى
   *    مقاطعة مش مساعدة. بنرجّعها كـ`stale` والتطبيق يقرر:
   *    يعرضها بلطف أو يتجاهلها.
   */
  const ageHours = (Date.now() - new Date(draft.createdAt).getTime()) / 3_600_000;

  res.json({
    success: true,
    pending: {
      id: draft.id,
      title: draft.title,
      createdAt: draft.createdAt,
      steps: draft.steps,
      /** فيه خطة جاهزة؟ يبقى ناقص الموافقة بس */
      hasPlan: draft.steps.length > 0,
      stale: ageHours > 24,
    },
  });
});

/**
 * حذف مسودة معلّقة — `DELETE /goals/dream/pending`
 *
 * ️ لازم يكون فيه طريقة يقول بيها «مش عايز الحلم ده».
 *    من غيرها المسودة بتفضل تظهر كل مرة يفتح التطبيق —
 *    والتذكير اللي مالوش زرار رفض بيتحوّل مضايقة.
 */
export const discardPendingDream = asyncHandler(async (req, res) => {
  const deleted = await prisma.goal.deleteMany({
    where: { userId: req.user.userId, draft: true },
  });

  res.json({ success: true, discarded: deleted.count });
});

/** 2) الإجابات → خطة الجبل (تُخزَّن كخطوات على المسودة) */
export const answerDreamQuiz = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { answers } = req.body ?? {};

  if (!Array.isArray(answers) || answers.length === 0) {
    throw badRequest('الإجابات مطلوبة');
  }

  const draft = await prisma.goal.findFirst({
    where: { id, userId: req.user.userId, draft: true },
  });
  if (!draft) throw notFound('مسودة الهدف غير موجودة');

  const user = await prisma.user.findUnique({ where: { id: req.user.userId } });

  let plan;
  try {
    plan = await dreamPlanner.generatePlan({
      username: user.username,
      dreamTitle: draft.title,
      answers,
      companionName: user.companionName,
      profile: {
        interests: user.interests,
        specialty: user.specialty,
        timezone: user.timezone,
      },
    });
  } catch (e) {
    return res.status(503).json({
      success: false,
      code: e.code === 'GEMINI_QUOTA' ? 'GEMINI_QUOTA' : 'AI_UNAVAILABLE',
      message: 'الرفيق مشغول حالياً — حاول بعد قليل',
    });
  }

  // تخزين الخطة على المسودة (ترتيب من الأسفل إلى القمة)
  await prisma.goalStep.deleteMany({ where: { goalId: draft.id } });
  await prisma.goalStep.createMany({
    data: plan.steps.map((step, i) => ({
      goalId: draft.id,
      title: step.title,
      description: step.description ?? null,
      order: i,
    })),
  });

  const steps = await prisma.goalStep.findMany({
    where: { goalId: draft.id },
    orderBy: { order: 'asc' },
  });

  return res.json({ success: true, plan: { steps } });
});

/** 3) موافقة المستخدم → تُفعَّل الخطة (تظهر في القوائم) */
export const approveDreamPlan = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const draft = await prisma.goal.findFirst({
    where: { id, userId: req.user.userId, draft: true },
  });
  if (!draft) throw notFound('مسودة الهدف غير موجودة');

  const stepCount = await prisma.goalStep.count({ where: { goalId: draft.id } });
  if (stepCount < 2) {
    throw badRequest('لا توجد خطة معتمدة بعد — أكمل الأسئلة أولاً');
  }

  // تفعيل الهدف + إنشاء الأسبوع الأول تلقائياً (توافقاً مع نظام التوثيق)
  const goal = await prisma.$transaction(async (tx) => {
    const g = await tx.goal.update({
      where: { id: draft.id },
      data: { draft: false, isActive: true, isPrimary: true },
    });
    const weekCount = await tx.goalWeek.count({ where: { goalId: g.id } });
    if (weekCount === 0) {
      await tx.goalWeek.create({
        data: { goalId: g.id, weekNumber: 1, title: 'الأسبوع الأول' },
      });
    }
    return g;
  });

  const steps = await prisma.goalStep.findMany({
    where: { goalId: goal.id },
    orderBy: { order: 'asc' },
  });

  /**
   * ═══ إقلاع تلقائي لأول مرحلة ═══
   *
   * ️ من غير ده كان المستخدم يوافق على جبله — أعلى لحظة حماس في
   *    التطبيق — ويروح على المهام يلاقيها فاضية، والرسالة بتقوله
   *    «مهام الجبل هتيجي لوحدها» وهي مش هتيجي إلا لما يرجع للجبل
   *    ويضغط زر توليد لكل مرحلة يدوياً.
   *
   * ️ أول مرحلة بس (order = 0) مش السبعة:
   *    · 7 نداءات AI في طلب واحد = انتظار طويل وخطر timeout
   *    · المستخدم مش محتاج يشوف تفاصيل المرحلة السابعة دلوقتي
   *    الباقي بيتولّد لما يفتح كل مرحلة (نفس الخدمة، autoApprove=false)
   *
   * ️ فشله لا يُفشل الموافقة: الجبل اتثبّت خلاص، والمستخدم يقدر
   *    يولّد الرحلة يدوياً. عشان كده الاستجابة بترجع
   *    `firstJourney: null` بدل ما ترمي خطأ.
   */
  let firstJourney = null;
  const firstStep = steps[0];
  if (firstStep) {
    try {
      const boot = await bootstrapStepJourney({
        stepId: firstStep.id,
        userId: req.user.userId,
        autoApprove: true,
      });
      firstJourney = {
        stepId: firstStep.id,
        journeyId: boot.journey.id,
        title: boot.journey.title,
        durationDays: boot.journey.durationDays,
        days: boot.days,
        generatedTasks: boot.generatedTasks,
      };
    } catch (e) {
      // JOURNEY_EXISTS يعني اتولدت قبل كده — مش خطأ حقيقي
      if (e.code !== 'JOURNEY_EXISTS') {
        console.warn('فشل الإقلاع التلقائي لأول مرحلة:', e.code || e.message);
      }
    }
  }

  return res.json({
    success: true,
    message: firstJourney
      ? 'خطتك اتثبّت — ومهمة النهاردة مستنياك في المهام 🏔️'
      : 'خطتك اتثبّت — الجبل قدامك، ابدأ التسلق',
    goal: {
      id: goal.id,
      title: goal.title,
      isPrimary: goal.isPrimary,
      currentWeek: goal.currentWeek,
    },
    steps,
    /** null لو الـ AI كان واقع — الواجهة تعرض زر «ابدأ أول مرحلة» */
    firstJourney,
  });
});

/**
 * ═══════════════════════════════════════════════════════════
 *  إتمام خطوة جبل (P1) — تقدم حقيقي من القاعدة
 *
 *  POST /api/goals/dream/:goalId/steps/:stepId/complete
 *  - الملكية: الهدف + الخطوة ملك المستخدم حصراً
 *  - يُعلَّم isCompleted + completedAt
 *  - التسلق بالترتيب: لا إتمام قبل الخطوة السابقة
 * ═══════════════════════════════════════════════════════════
 */
export const completeGoalStep = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { goalId, stepId } = req.params;

  // الهدف ملك المستخدم + مفعّل (ليس مسودة)
  const goal = await prisma.goal.findFirst({
    where: { id: goalId, userId, draft: false },
    select: { id: true },
  });
  if (!goal) throw notFound('الهدف غير موجود');

  // الخطوة تخص هذا الهدف
  const step = await prisma.goalStep.findFirst({
    where: { id: stepId, goalId },
    select: { id: true, title: true, order: true, isCompleted: true },
  });
  if (!step) throw notFound('الخطوة غير موجودة');

  if (step.isCompleted) {
    throw conflict('الخطوة مكتملة بالفعل', 'STEP_ALREADY_COMPLETED');
  }

  // ⚠️ التقدم بالترتيب: لا يمكن إتمام خطوة قبل التي قبلها
  if (step.order > 0) {
    const prev = await prisma.goalStep.findFirst({
      where: { goalId, order: step.order - 1 },
      select: { isCompleted: true },
    });
    if (!prev?.isCompleted) {
      throw badRequest('أكمل الخطوة السابقة أولاً — التسلق بالترتيب', 'PREVIOUS_STEP_PENDING');
    }
  }

  await prisma.goalStep.update({
    where: { id: stepId },
    data: { isCompleted: true, completedAt: new Date() },
  });

  // هل القمة (آخر خطوة) اكتملت؟ → الهدف اكتمل
  const steps = await prisma.goalStep.findMany({
    where: { goalId },
    orderBy: { order: 'asc' },
    select: { isCompleted: true, order: true },
  });
  const allDone = steps.every((st) => st.isCompleted);
  let goalCompleted = false;
  if (allDone && steps.length > 0) {
    await prisma.goal.update({
      where: { id: goalId },
      data: { completedAt: new Date(), isActive: false },
    });
    goalCompleted = true;
  }

  const completedCount = steps.filter((st) => st.isCompleted).length;
  const isPeak = step.order === steps.length - 1;

  return res.json({
    success: true,
    message: isPeak && allDone ? 'وصلت القمة — حققت هدفك!' : `أحسنت — أنجزت «${step.title}»`,
    step: { id: step.id, order: step.order, isCompleted: true },
    progress: {
      completed: completedCount,
      total: steps.length,
      remaining: steps.length - completedCount,
      goalCompleted,
    },
  });
});


/**
 * ═══════════════════════════════════════════════════════════
 *  رحلة الهدف (Journey) — الخطة الزمنية لـ GoalStep واحد
 *
 *  POST /api/goals/steps/:stepId/journey           → توليد (AI مرة واحدة) → DRAFT
 *  POST /api/goals/steps/:stepId/journey/approve   → موافقة → ACTIVE + مهمة اليوم 1
 *  GET  /api/goals/steps/:stepId/journey           → عرض + progress + متأخر N
 * ═══════════════════════════════════════════════════════════
 */

/** 1) توليد رحلة الهدف — نداء AI حقيقي واحد → DRAFT + أيام (معاينة قبل الموافقة) */
export const generateStepJourney = asyncHandler(async (req, res) => {
  const { stepId } = req.params;

  /**
   * ️ نفس الخدمة اللي بيستخدمها الإقلاع التلقائي بعد الموافقة على
   *    الجبل — الفرق `autoApprove` بس. الكود كان مكرر في المكانين
   *    قبل كده، وأي تعديل في منطق التوليد كان لازم يتعمل مرتين.
   */
  try {
    const { journey, days } = await bootstrapStepJourney({
      stepId,
      userId: req.user.userId,
      autoApprove: false,
    });

    return res.status(201).json({
      success: true,
      message: 'خطة الرحلة جاهزة — راجعها ووافق',
      journey: {
        id: journey.id,
        title: journey.title,
        durationDays: journey.durationDays,
        status: journey.status,
      },
      days,
    });
  } catch (e) {
    if (e.code === 'STEP_NOT_FOUND') throw notFound('المرحلة غير موجودة أو مكتملة');
    if (e.code === 'JOURNEY_EXISTS') {
      throw conflict('هذه المرحلة ليها رحلة بالفعل', 'JOURNEY_EXISTS');
    }
    if (e.code === 'GEMINI_NOT_CONFIGURED') {
      return res.status(503).json({
        success: false,
        code: 'GEMINI_NOT_CONFIGURED',
        message: 'الرفيق غير متاح حالياً — تأكد من ضبط مفتاح الذكاء الاصطناعي في السيرفر',
      });
    }
    return res.status(503).json({
      success: false,
      code: e.code === 'GEMINI_QUOTA' ? 'GEMINI_QUOTA' : 'AI_UNAVAILABLE',
      message: 'الرفيق مشغول حالياً — حاول بعد قليل',
    });
  }
});

/** 2) موافقة المستخدم → ACTIVE + توزيع التواريخ + توليد مهمة اليوم الأول */
export const approveStepJourney = asyncHandler(async (req, res) => {
  const { stepId } = req.params;
  const userId = req.user.userId;

  const journey = await prisma.journey.findFirst({
    where: { goalStepId: stepId, step: { goal: { userId } }, status: 'DRAFT' },
    include: { days: { orderBy: { dayNumber: 'asc' } } },
  });
  if (!journey) throw notFound('لا توجد رحلة بانتظار الموافقة');

  // توزيع التواريخ: اليوم 1 = النهارده (بتوقيت المستخدم المحلي)، والباقي تباعاً
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  const tz = user?.timezone || 'Africa/Cairo';
  // بداية اليوم المحلي للمستخدم (عبر Intl — يراعي فرق التوقيت والتوقيت الصيفي)
  const startOfToday = localDate(tz); // Date يمثل YYYY-MM-DD المحلي

  await prisma.$transaction(async (tx) => {
    for (const day of journey.days) {
      const d = new Date(startOfToday);
      d.setDate(d.getDate() + (day.dayNumber - 1));
      await tx.journeyDay.update({
        where: { id: day.id },
        data: { scheduledDate: d },
      });
    }
    await tx.journey.update({
      where: { id: journey.id },
      data: { status: 'ACTIVE', approvedAt: new Date(), currentDay: 1 },
    });
  });

  // توليد مهمة اليوم الأول فوراً (Scheduler — صفر AI)
  const sched = await journeyScheduler.generateTodayTasks({ journeyId: journey.id });

  const updated = await prisma.journey.findUnique({
    where: { id: journey.id },
    include: { days: { orderBy: { dayNumber: 'asc' } } },
  });

  return res.json({
    success: true,
    message: 'الرحلة اتثبّت — مهامك جاهزة في قسم المهام',
    journey: updated,
    generatedTasks: sched.created,
  });
});

/** 3) عرض الرحلة + الأيام + التقدم + شارة «متأخر N» */
export const getStepJourney = asyncHandler(async (req, res) => {
  const { stepId } = req.params;
  const userId = req.user.userId;

  const journey = await prisma.journey.findFirst({
    where: { goalStepId: stepId, step: { goal: { userId } } },
    include: {
      days: { orderBy: { dayNumber: 'asc' } },
      step: { select: { title: true, isCompleted: true } },
    },
  });
  if (!journey) throw notFound('لا توجد رحلة لهذه المرحلة');

  const completed = journey.days.filter((d) => d.status === 'COMPLETED').length;
  // متأخر = أيام قبل اليوم النشط (أول PENDING) ولسه مش مكتملة
  const firstPending = journey.days.find((d) => d.status === 'PENDING');
  const lateDays = firstPending
    ? journey.days.filter(
        (d) => d.status === 'PENDING' && d.dayNumber < firstPending.dayNumber,
      ).length
    : 0;

  // المهام المولدة (لربطها في الواجهة)
  const tasks = await prisma.task.findMany({
    where: { journeyDayId: { in: journey.days.map((d) => d.id) } },
    select: { id: true, title: true, isCompleted: true, journeyDayId: true },
  });

  return res.json({
    success: true,
    journey: {
      id: journey.id,
      title: journey.title,
      status: journey.status,
      durationDays: journey.durationDays,
      currentDay: firstPending?.dayNumber ?? journey.durationDays,
      approvedAt: journey.approvedAt,
      completedAt: journey.completedAt,
      step: journey.step,
      progress: {
        completed,
        total: journey.days.length,
        percent:
          journey.days.length > 0
            ? Math.round((completed / journey.days.length) * 100)
            : 0,
      },
      lateDays,
      days: journey.days,
      tasks,
    },
  });
});

export const createGoal = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { title, vision, pledge, firstWeekTitle, targetDate } = req.body;

  const cleanTitle = requireText(title, 'اسم الهدف', LIMITS.title);
  const cleanVision = optionalText(vision, 'نقطة الوصول', LIMITS.vision);
  const cleanPledge = optionalText(pledge, 'الوعد', LIMITS.pledge);

  const activeCount = await prisma.goal.count({
    where: { userId, isActive: true, completedAt: null },
  });

  if (activeCount >= MAX_ACTIVE_GOALS) {
    throw badRequest(
      `لا يمكن تجاوز ${MAX_ACTIVE_GOALS} أهداف نشطة — أنهِ هدفاً أولاً`,
    );
  }

  /** ️ new Date('كلام') تُنتج Invalid Date ولا ترمي */
  const parsedDate = v.optionalDate(targetDate, 'تاريخ الهدف');

  const weekTitle =
    optionalText(firstWeekTitle, 'عنوان الأسبوع', LIMITS.weekTitle) ||
    'الأسبوع الأول';

  const goal = await prisma.goal.create({
    data: {
      userId,
      title: cleanTitle,
      vision: cleanVision,
      pledge: cleanPledge,
      targetDate: parsedDate,
      currentWeek: 1,
      weeks: {
        create: { weekNumber: 1, title: weekTitle, status: 'OPEN' },
      },
    },
    include: { weeks: { orderBy: { weekNumber: 'asc' } } },
  });

  res.status(201).json({ success: true, goal });
});

/** قائمة الأهداف مع عدّادات مختصرة */
export const listGoals = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { filter = 'active' } = req.query;

  const where = { userId, draft: false }; // المسودات لا تظهر أبداً في القوائم
  if (filter === 'active') {
    where.isActive = true;
    where.completedAt = null;
  } else if (filter === 'completed') {
    where.completedAt = { not: null };
  } else if (filter !== 'all') {
    throw badRequest('فلتر غير صالح');
  }

  const goals = await prisma.goal.findMany({
    where,
    take: Math.min(100, Math.max(1, Number(req.query.limit) || 50)),
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
    include: {
      weeks: {
        orderBy: { weekNumber: 'asc' },
        select: { id: true, weekNumber: true, title: true, status: true },
      },
      // الخطوات (مراحل الجبل) — عشان شاشة الجبل تعرض العقد من تحت للقمة
      steps: {
        orderBy: { order: 'asc' },
        select: {
          id: true,
          title: true,
          description: true,
          order: true,
          isCompleted: true,
          completedAt: true,
        },
      },
    },
  });

  const shaped = goals.map((goal) => {
    const documented = goal.weeks.filter((w) => w.status === 'DOCUMENTED').length;
    const skipped = goal.weeks.filter((w) => w.status === 'SKIPPED').length;
    const openWeek = goal.weeks.find((w) => w.status === 'OPEN') || null;

    return {
      ...goal,
      stats: {
        total: goal.weeks.length,
        documented,
        skipped,
        open: openWeek ? 1 : 0,
      },
      openWeek,
    };
  });

  res.json({ success: true, goals: shaped, count: shaped.length });
});

/** هدف واحد بكل أسابيعه */
export const getGoal = asyncHandler(async (req, res) => {
  const userId = req.user.userId;

  const goal = await findOwnedGoal(req.params.id, userId, {
    weeks: { orderBy: { weekNumber: 'asc' } },
  });

  res.json({
    success: true,
    goal: { ...goal, weeks: goal.weeks.map(decorate) },
  });
});

/**
 * تعديل الهدف.
 *
 * ️ الوعد (pledge) لا يُعدّل بعد توثيق أول أسبوع.
 *    وعدٌ يتغيّر كلما صعب الطريق ليس وعداً.
 */
export const updateGoal = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { title, vision, pledge, targetDate, isPrimary } = req.body;

  const goal = await findOwnedGoal(req.params.id, userId, {
    weeks: { select: { status: true } },
  });

  if (goal.completedAt) throw forbidden('الهدف مكتمل — لا يُعدّل');

  const data = {};

  if (title !== undefined) {
    data.title = requireText(title, 'اسم الهدف', LIMITS.title);
  }
  if (vision !== undefined) {
    data.vision = optionalText(vision, 'نقطة الوصول', LIMITS.vision);
  }

  if (pledge !== undefined) {
    const hasDocumented = goal.weeks.some((w) => w.status === 'DOCUMENTED');
    if (hasDocumented) {
      throw forbidden('الوعد لا يُعدّل بعد بدء التوثيق');
    }
    data.pledge = optionalText(pledge, 'الوعد', LIMITS.pledge);
  }

  if (targetDate !== undefined) {
    data.targetDate = v.optionalDate(targetDate, 'تاريخ الهدف');
  }

  if (isPrimary !== undefined) {
    /**
     * ️ كان `Boolean(isPrimary)` — وأي نصّ غير فارغ يصير true،
     *    بما فيه "false" و"no" و"0". فمن يرسل "false" يجعل هدفه
     *    رئيسياً ويُلغي رئاسة غيره.
     */
    data.isPrimary = v.optionalBool(isPrimary, 'الهدف الرئيسي');
    if (data.isPrimary) {
      // هدف رئيسي واحد فقط
      await prisma.goal.updateMany({
        where: { userId, isPrimary: true },
        data: { isPrimary: false },
      });
    }
  }

  const updated = await prisma.goal.update({
    where: { id: goal.id },
    data,
    include: { weeks: { orderBy: { weekNumber: 'asc' } } },
  });

  res.json({ success: true, goal: updated });
});

/** إنهاء الهدف — يمنع إضافة أسابيع جديدة */
export const completeGoal = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const goal = await findOwnedGoal(req.params.id, userId, {
    weeks: { select: { status: true } },
  });

  if (goal.completedAt) throw badRequest('الهدف مكتمل بالفعل');

  const documented = goal.weeks.filter((w) => w.status === 'DOCUMENTED').length;
  if (documented === 0) {
    throw badRequest('لا يمكن إنهاء هدف بلا أسبوع موثّق واحد');
  }

  const updated = await prisma.goal.update({
    where: { id: goal.id },
    data: { completedAt: new Date(), isActive: false, isPrimary: false },
    include: { weeks: { orderBy: { weekNumber: 'asc' } } },
  });

  res.json({
    success: true,
    goal: updated,
    summary: {
      totalWeeks: goal.weeks.length,
      documented,
      skipped: goal.weeks.filter((w) => w.status === 'SKIPPED').length,
    },
  });
});

/**
 * حذف الهدف.
 *
 * مسموح ما دام لم يُوثَّق أسبوع واحد — بعدها يصير أرشيفاً
 * لا يُمحى. من أراد التوقف يُنهي الهدف لا يحذفه.
 */
export const deleteGoal = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const goal = await findOwnedGoal(req.params.id, userId, {
    weeks: { select: { status: true } },
  });

  const hasDocumented = goal.weeks.some((w) => w.status === 'DOCUMENTED');
  if (hasDocumented) {
    throw forbidden('الهدف يحوي توثيقاً مقفولاً — أنهِه بدل حذفه');
  }

  await prisma.goal.delete({ where: { id: goal.id } });
  res.json({ success: true, message: 'حُذف الهدف' });
});

//////////////////////////////////////////////////////
// الأسابيع
//////////////////////////////////////////////////////

/**
 * فتح أسبوع جديد.
 *
 * ️ شرط أساسي: لا أسبوع مفتوح بالفعل.
 *    وإلا تراكمت أسابيع مفتوحة ووثّقها كلها في يوم واحد،
 *    فانهار معنى "التوثيق الأسبوعي".
 */
export const addWeek = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { title } = req.body;

  const goal = await findOwnedGoal(req.params.id, userId, {
    weeks: { orderBy: { weekNumber: 'desc' }, take: 1 },
  });

  if (goal.completedAt) throw forbidden('الهدف مكتمل — لا أسابيع جديدة');

  const openWeek = await prisma.goalWeek.findFirst({
    where: { goalId: goal.id, status: 'OPEN' },
  });

  if (openWeek) {
    throw badRequest(
      `الأسبوع ${openWeek.weekNumber} ما زال مفتوحاً — وثّقه أو تخطّه أولاً`,
    );
  }

  const lastNumber = goal.weeks[0]?.weekNumber ?? 0;
  const nextNumber = lastNumber + 1;

  const cleanTitle =
    optionalText(title, 'عنوان الأسبوع', LIMITS.weekTitle) ||
    `الأسبوع ${nextNumber}`;

  const week = await prisma.goalWeek.create({
    data: {
      goalId: goal.id,
      weekNumber: nextNumber,
      title: cleanTitle,
      status: 'OPEN',
    },
  });

  await prisma.goal.update({
    where: { id: goal.id },
    data: { currentWeek: nextNumber },
  });

  res.status(201).json({ success: true, week: decorate(week) });
});

/**
 * توثيق الأسبوع — اللحظة الحاسمة.
 *
 * بعدها يُقفل الأسبوع، ولا يبقى إلا نافذة ٥ دقائق للتصحيح.
 */
export const documentWeek = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { reflection, learnings, mistakes, futureNote, answers } = req.body;

  const week = await findOwnedWeek(req.params.weekId, userId);

  if (week.status === 'SKIPPED') {
    throw forbidden('هذا الأسبوع متخطّى — لا يُوثّق');
  }

  if (week.status === 'DOCUMENTED' && !isEditable(week)) {
    throw forbidden('انتهت نافذة التعديل — الأسبوع مقفول نهائياً');
  }

  const cleanReflection = requireText(
    reflection,
    'وصف الأسبوع',
    LIMITS.answer,
  );
  const cleanLearnings = requireText(learnings, 'ما تعلمته', LIMITS.answer);
  const cleanMistakes = requireText(mistakes, 'الأخطاء والفخر', LIMITS.answer);
  const cleanFuture = optionalText(
    futureNote,
    'رسالة المستقبل',
    LIMITS.futureNote,
  );

  const now = new Date();
  const isFirstSave = week.status !== 'DOCUMENTED';

  // ═══ الأسئلة الستة + المخصصة (زر +) — تُخزَّن مصفوفة { q, a } ═══
  let cleanAnswers = undefined;
  if (Array.isArray(answers) && answers.length > 0) {
    cleanAnswers = answers
      .filter((a) => a && typeof a === 'object')
      .map((a) => ({
        q: String(a.q ?? '').slice(0, 300),
        a: String(a.a ?? '').slice(0, 2000),
      }))
      .filter((a) => a.q.trim() || a.a.trim());
    if (cleanAnswers.length > 20) cleanAnswers = cleanAnswers.slice(0, 20);
  }

  const data = {
    reflection: cleanReflection,
    learnings: cleanLearnings,
    mistakes: cleanMistakes,
    ...(cleanAnswers ? { answers: cleanAnswers } : {}),
    status: 'DOCUMENTED',
  };

  // التوقيت يُضبط عند الحفظ الأول فقط — التعديل لا يمدّد النافذة
  if (isFirstSave) {
    data.documentedAt = now;
    data.lockedAt = new Date(now.getTime() + EDIT_WINDOW_MS);
  }

  // رسالة المستقبل تُجدول مرة واحدة
  if (cleanFuture && !week.futureNote) {
    data.futureNote = cleanFuture;
    data.futureAt = new Date(
      now.getTime() + FUTURE_NOTE_DAYS * 24 * 60 * 60 * 1000,
    );
    data.futureSent = false;
  } else if (cleanFuture && week.futureNote && isEditable(week)) {
    // داخل النافذة يجوز تصحيح نصّ الرسالة دون تغيير موعدها
    data.futureNote = cleanFuture;
  }

  const updated = await prisma.goalWeek.update({
    where: { id: week.id },
    data,
  });

  res.json({
    success: true,
    week: decorate(updated),
    isFirstSave,
    message: isFirstSave
      ? 'وُثّق الأسبوع — لديك ١٠ دقائق للتصحيح'
      : 'حُفظ التصحيح',
  });
});

/**
 * تخطّي الأسبوع — قرار لا رجعة فيه.
 *
 * نطلب تأكيداً صريحاً لأن الزر لا يُلغى.
 */
export const skipWeek = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { confirm } = req.body;

  if (confirm !== true) {
    throw badRequest('التخطي نهائي — أرسل confirm: true للتأكيد');
  }

  const week = await findOwnedWeek(req.params.weekId, userId);

  if (week.status === 'DOCUMENTED') {
    throw forbidden('الأسبوع موثّق بالفعل');
  }
  if (week.status === 'SKIPPED') {
    throw badRequest('الأسبوع متخطّى بالفعل');
  }

  const updated = await prisma.goalWeek.update({
    where: { id: week.id },
    data: { status: 'SKIPPED', lockedAt: new Date() },
  });

  res.json({
    success: true,
    week: decorate(updated),
    message: 'تُخطّي الأسبوع — لا يمكن الرجوع',
  });
});

/** أسبوع واحد بتفاصيله */
export const getWeek = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const week = await findOwnedWeek(req.params.weekId, userId);

  res.json({
    success: true,
    week: decorate(week),
    pledge: week.goal.pledge,
    goalTitle: week.goal.title,
  });
});

//////////////////////////////////////////////////////
// رسائل المستقبل
//////////////////////////////////////////////////////

/**
 * الرسائل المستحقّة الآن.
 *
 * تُستدعى عند فتح التطبيق. كل رسالة تُسلَّم مرة واحدة.
 */
export const getDueFutureNotes = asyncHandler(async (req, res) => {
  const userId = req.user.userId;

  const due = await prisma.goalWeek.findMany({
    take: 50,
    where: {
      goal: { userId },
      futureSent: false,
      futureNote: { not: null },
      futureAt: { lte: new Date() },
    },
    include: { goal: { select: { id: true, title: true } } },
    orderBy: { futureAt: 'asc' },
  });

  if (due.length > 0) {
    await prisma.goalWeek.updateMany({
      where: { id: { in: due.map((w) => w.id) } },
      data: { futureSent: true },
    });
  }

  res.json({
    success: true,
    notes: due.map((w) => ({
      weekId: w.id,
      weekNumber: w.weekNumber,
      goalId: w.goal.id,
      goalTitle: w.goal.title,
      note: w.futureNote,
      writtenAt: w.documentedAt,
      daysAgo: w.documentedAt
        ? Math.floor(
            (Date.now() - new Date(w.documentedAt).getTime()) / 86400000,
          )
        : null,
    })),
    count: due.length,
  });
});

//////////////////////////////////////////////////////
// الإحصاءات
//////////////////////////////////////////////////////

/**
 * إحصاءات التوثيق.
 *
 * أهمّها سلسلة الالتزام: كم أسبوعاً متتالياً وثّق دون تخطٍّ؟
 * تُحسب عبر الأهداف كلها لا هدفاً هدفاً.
 */
export const getJournalStats = asyncHandler(async (req, res) => {
  const userId = req.user.userId;

  const [goals, weeks] = await Promise.all([
    prisma.goal.findMany({
      where: { userId },
      select: { id: true, completedAt: true, isActive: true },
      take: 200,
    }),
    // الأسابيع تتراكم أسبوعياً بلا سقف — نأخذ آخر 500
    // (عشر سنوات من التوثيق الأسبوعي المتواصل)
    prisma.goalWeek.findMany({
      where: { goal: { userId } },
      select: { status: true, documentedAt: true },
      orderBy: { createdAt: 'asc' },
      take: 500,
    }),
  ]);

  const documented = weeks.filter((w) => w.status === 'DOCUMENTED');
  const skipped = weeks.filter((w) => w.status === 'SKIPPED');

  // السلسلة: نمشي من الأحدث للأقدم ونتوقف عند أول تخطٍّ
  let streak = 0;
  for (let i = weeks.length - 1; i >= 0; i -= 1) {
    if (weeks[i].status === 'DOCUMENTED') streak += 1;
    else if (weeks[i].status === 'SKIPPED') break;
    // المفتوح لا يقطع السلسلة ولا يزيدها
  }

  const totalWords = documented.length; // مؤشر بسيط، يمكن توسيعه لاحقاً

  res.json({
    success: true,
    stats: {
      goals: {
        total: goals.length,
        active: goals.filter((g) => g.isActive && !g.completedAt).length,
        completed: goals.filter((g) => g.completedAt).length,
      },
      weeks: {
        total: weeks.length,
        documented: documented.length,
        skipped: skipped.length,
        open: weeks.filter((w) => w.status === 'OPEN').length,
      },
      /// أسابيع متتالية موثّقة — يتكسّر بالتخطي
      commitmentStreak: streak,
      completionRate:
        weeks.length > 0
          ? Math.round((documented.length / weeks.length) * 100)
          : 0,
      entries: totalWords,
    },
  });
});
