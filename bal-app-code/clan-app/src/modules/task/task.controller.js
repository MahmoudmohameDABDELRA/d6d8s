import prisma from '../../config/prisma.js';
import { VALIDATION } from '../../config/constants.js';
import * as achievementService from '../../services/achievement.service.js';
import * as sparksService from '../../services/sparks.service.js';
import * as streakService from '../../services/streak.service.js';
import * as analyticsService from '../../services/analytics.service.js';
import * as taskBlockService from '../../services/taskBlock.service.js';
import * as taskNudge from '../../services/taskNudge.service.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { badRequest, conflict, notFound } from '../../utils/AppError.js';
import * as v from '../../utils/validate.js';

/**
 * ════════════════════════════════════════════════════════════
 *  محرك المهام
 * ════════════════════════════════════════════════════════════
 *
 * ثلاث فئات:  حرجة ·  نمو ·  سريعة
 * كل مهمة مكتملة = 2 شرارة (بلا تفرقة — قرار معتمد)
 *
 * المهمة تُربط بجلسات تركيز، فيظهر الوقت الفعلي المبذول فيها.
 */

const PRIORITIES = ['CRITICAL', 'GROWTH', 'QUICK'];

/** تحقق من ملكية المهمة — لا يكفي وجودها */
const findOwnedTask = async (id, userId, include = undefined) => {
  const task = await prisma.task.findFirst({ where: { id, userId }, include });
  if (!task) throw notFound('المهمة غير موجودة');
  return task;
};

const logHistory = (tx, taskId, action, meta = undefined) =>
  tx.taskHistory.create({ data: { taskId, action, meta } });

//////////////////////////////////////////////////////
// قائمة المهام
//////////////////////////////////////////////////////

export const listTasks = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { filter = 'all', priority } = req.query;

  const where = { userId };

  // ═══ قرار المالك: المهام المكتملة تختفي من القوائم ═══
  // الافتراضي (all/بلا فلتر) = المعلّقة فقط · التاريخ متاح عبر filter=completed صراحة
  if (!filter || filter === 'all' || filter === 'pending') where.isCompleted = false;
  if (filter === 'completed') where.isCompleted = true;

  if (priority) {
    if (!PRIORITIES.includes(priority)) throw badRequest('فئة غير صالحة');
    where.priority = priority;
  }

  if (filter === 'pending') where.isCompleted = false;
  if (filter === 'completed') where.isCompleted = true;

  if (filter === 'today') {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    });
    const start = streakService.startOfLocalDay(user.timezone);
    const end = new Date(start.getTime() + 86_400_000);

    where.isCompleted = false;
    // مهام اليوم = المستحقة اليوم أو المتأخرة أو بلا موعد
    where.OR = [{ dueDate: { lt: end } }, { dueDate: null }];
  }

  if (filter === 'overdue') {
    where.isCompleted = false;
    where.dueDate = { lt: new Date() };
  }

  /**
   * ️ التقسيم إجباري لا اختياري.
   *
   * قياس فعلي على 50,000 مهمة: بلا `take` استغرق الاستعلام
   * 1,881ms لأنه يجلب كل المهام مع كل خطواتها.
   * مع الحد أقل من 50ms.
   *
   * المستخدم لا يقرأ 50,000 مهمة — يقرأ الصفحة الأولى.
   */
  const MAX_LIMIT = 100;
  const DEFAULT_LIMIT = 50;

  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(req.query.limit) || DEFAULT_LIMIT),
  );
  const page = Math.max(1, Number(req.query.page) || 1);

  const [tasks, totalCount] = await Promise.all([
    prisma.task.findMany({
      where,
      include: {
        steps: { orderBy: { orderIndex: 'asc' } },
        _count: { select: { focusSessions: true } },
      },
      orderBy: [
        { isCompleted: 'asc' },
        // الحرجة أولاً — ترتيب الـ enum في المخطط يخدمنا هنا
        { priority: 'asc' },
        { dueDate: { sort: 'asc', nulls: 'last' } },
        { createdAt: 'desc' },
      ],
      take: limit,
      skip: (page - 1) * limit,
    }),
    prisma.task.count({ where }),
  ]);

  const grouped = {
    CRITICAL: tasks.filter((t) => t.priority === 'CRITICAL' && !t.isCompleted),
    GROWTH: tasks.filter((t) => t.priority === 'GROWTH' && !t.isCompleted),
    QUICK: tasks.filter((t) => t.priority === 'QUICK' && !t.isCompleted),
  };

  /**
   * العدّادات تأتي من القاعدة لا من الصفحة الحالية.
   *
   * بعد التقسيم صار `tasks` صفحةً واحدة، فحساب "المعلّقة"
   * منها يعطي رقماً خاطئاً — المستخدم يرى 50 وعنده 3,000.
   */
  const [pendingCount, completedCount] = await Promise.all([
    prisma.task.count({ where: { ...where, isCompleted: false } }),
    prisma.task.count({ where: { ...where, isCompleted: true } }),
  ]);

  res.json({
    success: true,
    total: totalCount,
    page,
    limit,
    hasMore: page * limit < totalCount,
    tasks,
    grouped,
    counts: {
      pending: pendingCount,
      completed: completedCount,
    },
  });
});

//////////////////////////////////////////////////////
// مهمة واحدة
//////////////////////////////////////////////////////

export const getTask = asyncHandler(async (req, res) => {
  const task = await findOwnedTask(req.params.id, req.user.userId, {
    steps: { orderBy: { orderIndex: 'asc' } },
    focusSessions: {
      where: { status: 'COMPLETED' },
      select: { id: true, serverVerifiedMin: true, startedAt: true },
      orderBy: { startedAt: 'desc' },
    },
    history: { orderBy: { createdAt: 'desc' }, take: 20 },
  });

  const focusedMin = task.focusSessions.reduce(
    (s, f) => s + f.serverVerifiedMin,
    0,
  );

  res.json({ success: true, task: { ...task, focusedMin } });
});

//////////////////////////////////////////////////////
// إنشاء
//////////////////////////////////////////////////////

export const createTask = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { title, description, priority, estimatedMin, dueDate, steps } =
    req.body ?? {};

  /**
   * ️ رفض النوع الخاطئ لا تحويله.
   *
   *  كان `String(title ?? '')` — وهو **لا يرفض** بل يحوّل:
   *    {} → "[object Object]"  ·  0 → "0"  ·  false → "false"
   *
   *  قِسناه حيّاً: `{"title":{"$ne":null}}` رجع 201 وخُزّنت مهمة
   *  عنوانها `[object Object]`. ليست ثغرة حقن (Prisma يمنعه)
   *  لكنها فساد بيانات يظهر للمستخدم ويدخل سياق المرافق.
   */
  const trimmed = v.requireString(title, 'عنوان المهمة', {
    max: VALIDATION.TASK_TITLE_MAX,
  });

  v.optionalEnum(priority, 'الفئة', PRIORITIES);
  v.optionalInt(estimatedMin, 'الوقت المقدَّر', { min: 1, max: 1440 });
  const due = v.optionalDate(dueDate, 'تاريخ الاستحقاق');

  const task = await prisma.$transaction(async (tx) => {
    const created = await tx.task.create({
      data: {
        userId,
        title: trimmed,
        description: v.optionalString(description, 'الوصف', { max: 2000 }),
        priority: priority ?? 'GROWTH',
        estimatedMin: estimatedMin ?? null,
        dueDate: due,
        routineType: req.body?.routineType === 'DAILY' ? 'DAILY' : null,
      },
    });

    // خطوات فرعية اختيارية عند الإنشاء
    if (Array.isArray(steps) && steps.length > 0) {
      await tx.taskStep.createMany({
        data: steps.slice(0, 20).map((s, i) => ({
          taskId: created.id,
          title: String(typeof s === 'string' ? s : s.title).trim().slice(0, 200),
          orderIndex: i,
          estimatedMin: typeof s === 'object' ? (s.estimatedMin ?? null) : null,
        })),
      });
    }

    await logHistory(tx, created.id, 'CREATED');

    return tx.task.findUnique({
      where: { id: created.id },
      include: { steps: { orderBy: { orderIndex: 'asc' } } },
    });
  });

  // جدولة النكشة قبل الموعد (لو فيه dueDate مستقبلي)
  if (due) await taskNudge.scheduleNudge(task).catch(() => {});

  res.status(201).json({ success: true, message: 'تمت إضافة المهمة', task });
});

//////////////////////////////////////////////////////
// تعديل
//////////////////////////////////////////////////////

export const updateTask = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await findOwnedTask(id, req.user.userId);

  const { title, description, priority, estimatedMin, dueDate } = req.body ?? {};
  const data = {};

  if (title !== undefined) {
    const trimmed = String(title).trim();
    if (!trimmed) throw badRequest('العنوان لا يمكن أن يكون فارغاً');
    data.title = trimmed.slice(0, VALIDATION.TASK_TITLE_MAX);
  }

  if (description !== undefined) data.description = description?.trim() || null;

  if (priority !== undefined) {
    if (!PRIORITIES.includes(priority)) throw badRequest('الفئة غير صالحة');
    data.priority = priority;
  }

  if (estimatedMin !== undefined) data.estimatedMin = estimatedMin ?? null;

  if (dueDate !== undefined) {
    if (dueDate === null) data.dueDate = null;
    else {
      const d = new Date(dueDate);
      if (Number.isNaN(d.getTime())) throw badRequest('تاريخ غير صالح');
      data.dueDate = d;
    }
  }

  if (Object.keys(data).length === 0) throw badRequest('لا يوجد ما يُحدَّث');

  const task = await prisma.$transaction(async (tx) => {
    const updated = await tx.task.update({
      where: { id },
      data,
      include: { steps: { orderBy: { orderIndex: 'asc' } } },
    });
    await logHistory(tx, id, 'UPDATED', data);
    return updated;
  });

  // ═══ P2: لو اتغير الوقت/التاريخ → إعادة جدولة النكشة (jobId ثابت يستبدل القديمة) ═══
  if (data.dueDate !== undefined || data.startTime !== undefined || data.endTime !== undefined) {
    await taskNudge.scheduleNudge(task).catch(() => {});
  }

  res.json({ success: true, task });
});

//////////////////////////////////////////////////////
// إتمام المهمة  → شرارات
//////////////////////////////////////////////////////

export const completeTask = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { id } = req.params;

  const task = await findOwnedTask(id, userId);

  if (task.isCompleted) {
    throw conflict('المهمة منجزة بالفعل', 'TASK_ALREADY_COMPLETED');
  }

  const sparks = sparksService.calcTaskSparks();

  // ═══ سلسلة تقدم الجبل (نسخة معتمدة): لما مهمة مولدة تخلص ═══
  // Task ✅ → JourneyDay ✅ → كل الأيام؟ → Journey ✅ + GoalStep ✅ → كل الخطوات؟ → Goal (القمة) 🏁
  let mountainProgress = null;

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.task.updateMany({
      where: { id, userId, isCompleted: false },
      data: {
        isCompleted: true,
        completedAt: new Date(),
        earnedSparks: sparks,
      },
    });

    if (updated.count === 0) {
      throw conflict('المهمة منجزة بالفعل', 'TASK_ALREADY_COMPLETED');
    }

    // إتمام المهمة يُتمّ خطواتها المعلّقة
    await tx.taskStep.updateMany({
      where: { taskId: id, isCompleted: false },
      data: { isCompleted: true },
    });

    await logHistory(tx, id, 'COMPLETED');

    const awarded = await sparksService.award(userId, {
      source: 'TASK_COMPLETED',
      baseAmount: sparks,
      refId: id,
      tx,
    });

    const streak = await streakService.touch(userId, { tx });

    // ── ربط الجبل: المهمة مولدة من رحلة (JOURNEY) ──
    if (task.source === 'JOURNEY' && task.journeyDayId) {
      const day = await tx.journeyDay.findUnique({
        where: { id: task.journeyDayId },
        select: { id: true, status: true, journeyId: true },
      });
      if (day && day.status === 'PENDING') {
        await tx.journeyDay.update({
          where: { id: day.id },
          data: { status: 'COMPLETED', completedAt: new Date() },
        });

        // هل كل أيام الرحلة اكتملت؟
        const journey = await tx.journey.findUnique({
          where: { id: day.journeyId },
          include: {
            days: { select: { status: true, dayNumber: true } },
            step: { select: { id: true, goalId: true } },
          },
        });
        const allDaysDone = journey.days.every((d) => d.status === 'COMPLETED');

        if (allDaysDone) {
          // الرحلة اكتملت → المرحلة (GoalStep) اكتملت
          await tx.journey.update({
            where: { id: journey.id },
            data: { status: 'COMPLETED', completedAt: new Date() },
          });
          await tx.goalStep.update({
            where: { id: journey.step.id },
            data: { isCompleted: true, completedAt: new Date() },
          });

          // هل كل مراحل الهدف اكتملت؟ → القمة 🏁
          const goal = await tx.goal.findUnique({
            where: { id: journey.step.goalId },
            include: { steps: { select: { isCompleted: true } } },
          });
          const allStepsDone = goal.steps.length > 0 && goal.steps.every((s) => s.isCompleted);
          if (allStepsDone && !goal.completedAt) {
            await tx.goal.update({
              where: { id: goal.id },
              data: { completedAt: new Date(), isActive: false },
            });
            mountainProgress = { goalCompleted: true, summit: true };
          } else {
            mountainProgress = { goalCompleted: false, summit: false };
          }
        } else {
          // الرحلة لسه مستمرة — اليوم الجاي مفتوح (المرونة)
          const nextPending = journey.days.find((d) => d.status === 'PENDING');
          if (nextPending) {
            await tx.journey.update({
              where: { id: journey.id },
              data: { currentDay: nextPending.dayNumber ?? 1 },
            });
          }
          mountainProgress = { goalCompleted: false, summit: false };
        }
      }
    }

    return { awarded, streak };
  });

  const unlocked = await achievementService.evaluateSafe(userId, 'STREAK');

  await analyticsService.invalidateAnalytics(userId);

  // ═══ اطمئنان الـ AI بعد 10 دقائق (Follow-up Coach) — لكل المهام ═══
  try {
    const { scheduleTaskCheckIn } = await import('../../services/taskCheckIn.service.js');
    await scheduleTaskCheckIn(task.id);
  } catch (e) {
    // عدم نجاح الجدولة لا يُفشل الإتمام — يُسجَّل فقط
    console.warn('فشل جدولة الاطمئنان:', e.message);
  }

  // ═══ الروتين اليومي (قرار المالك): الإتمام يُنشئ نسخة الغد تلقائياً ═══
  let nextRoutineTask = null;
  if (task.routineType === 'DAILY' && task.repeatGroupId) {
    try {
      nextRoutineTask = await createNextRoutineOccurrence(task);
    } catch (e) {
      // لا نفشل الإتمام بسبب خطأ في إنشاء الغد — نسجّل ونتابع
      console.warn('فشل إنشاء روتين الغد:', e.message);
    }
  }

  res.json({
    success: true,
    message: 'أحسنت! مهمة منجزة',
    sparks: { earned: sparks, balance: result.awarded.balance },
    streak: result.streak,
    unlockedAchievements: unlocked,
    nextRoutine: nextRoutineTask
      ? { id: nextRoutineTask.id, title: nextRoutineTask.title, slotDate: nextRoutineTask.slotDate }
      : null,
    ...(mountainProgress ? { mountain: mountainProgress } : {}),
  });
});

/**
 * إنشاء نسخة الغد لمهمة روتين يومي (نفس الاسم والوقت والصوت والمجموعة).
 * يمنع التكرار: لو فيه مهمة لنفس المجموعة في نفس تاريخ الغد → يتخطّى.
 */
const createNextRoutineOccurrence = async (task) => {
  if (!task.slotDate) return null;

  // تاريخ الغد من slotDate (يُخزَّن كـ @db.Date = منتصف ليل UTC)
  const tomorrow = new Date(new Date(task.slotDate).getTime() + 86_400_000);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  // منع التكرار: نفس المجموعة + نفس التاريخ
  const existing = await prisma.task.findFirst({
    where: { repeatGroupId: task.repeatGroupId, slotDate: new Date(`${tomorrowStr}T00:00:00.000Z`) },
    select: { id: true },
  });
  if (existing) return null;

  let scheduledStart = null;
  let scheduledEnd = null;
  if (task.startTime) scheduledStart = new Date(`${tomorrowStr}T${task.startTime}:00.000Z`);
  if (task.endTime) scheduledEnd = new Date(`${tomorrowStr}T${task.endTime}:00.000Z`);

  const created = await prisma.task.create({
    data: {
      userId: task.userId,
      title: task.title,
      description: task.description,
      priority: task.priority,
      soundTheme: task.soundTheme,
      reminderMinutesBefore: task.reminderMinutesBefore,
      hasPreReminder: task.hasPreReminder,
      isQuickErrand: task.isQuickErrand,
      repeatGroupId: task.repeatGroupId,
      routineType: 'DAILY',
      slotDate: new Date(`${tomorrowStr}T00:00:00.000Z`),
      startTime: task.startTime,
      endTime: task.endTime,
      estimatedMin: task.estimatedMin,
      scheduledStart,
      scheduledEnd,
      dueDate: scheduledEnd || new Date(`${tomorrowStr}T00:00:00.000Z`),
    },
  });

  // جدولة نكشة الغد
  await taskNudge.scheduleNudge(created).catch(() => {});

  return created;
};

//////////////////////////////////////////////////////
// إعادة فتح
//////////////////////////////////////////////////////

/**
 * الشرارات المكتسبة لا تُسترجع.
 * السبب: الاسترجاع يفتح باباً للتلاعب (أكمل/أعد الفتح مراراً)،
 * ويعاقب من يصحّح خطأً بريئاً. التكلفة مقبولة.
 */
export const reopenTask = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.userId;
  await findOwnedTask(id, userId);

  await prisma.$transaction(async (tx) => {
    const updated = await tx.task.updateMany({
      where: { id, userId, isCompleted: true },
      data: { isCompleted: false, completedAt: null },
    });

    if (updated.count === 0) {
      throw conflict('المهمة غير منجزة أصلاً', 'TASK_NOT_COMPLETED');
    }

    await logHistory(tx, id, 'REOPENED');
  });

  res.json({
    success: true,
    message: 'تمت إعادة فتح المهمة',
    note: 'الشرارات المكتسبة سابقاً تبقى كما هي',
  });
});

//////////////////////////////////////////////////////
// حذف
//////////////////////////////////////////////////////

export const deleteTask = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await findOwnedTask(id, req.user.userId);

  // الجلسات المرتبطة تبقى (onDelete: SetNull في المخطط)
  await prisma.focusSession.updateMany({
    where: { taskId: id },
    data: { taskId: null },
  });

  await prisma.task.delete({ where: { id } });

  // ═══ P2: إلغاء النكشة المجدولة للمهمة المحذوفة ═══
  await taskNudge.cancelNudge(id).catch(() => {});

  res.json({ success: true, message: 'تم حذف المهمة' });
});

//////////////////////////////////////////////////////
// ترحيل مهمة
//////////////////////////////////////////////////////

export const rescheduleTask = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { dueDate } = req.body ?? {};

  const task = await findOwnedTask(id, req.user.userId);
  if (task.isCompleted) throw conflict('المهمة منجزة');

  let due;
  if (dueDate) {
    due = new Date(dueDate);
    if (Number.isNaN(due.getTime())) throw badRequest('تاريخ غير صالح');
  } else {
    // بلا تاريخ = الغد
    due = new Date();
    due.setDate(due.getDate() + 1);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const t = await tx.task.update({
      where: { id },
      data: { dueDate: due, rescheduleCount: { increment: 1 } },
    });
    await logHistory(tx, id, 'RESCHEDULED', { to: due.toISOString() });
    return t;
  });

  res.json({
    success: true,
    message: 'تم ترحيل المهمة',
    task: updated,
    /** تنبيه: الترحيل المتكرر علامة على أن المهمة كبيرة وتحتاج تفكيكاً */
    hint:
      updated.rescheduleCount >= 3
        ? 'رُحّلت هذه المهمة كثيراً — جرّب تقسيمها لخطوات أصغر'
        : null,
  });
});

//////////////////////////////////////////////////////
// الخطوات الفرعية
//////////////////////////////////////////////////////

export const addStep = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { title, estimatedMin } = req.body ?? {};

  await findOwnedTask(id, req.user.userId);

  const trimmed = String(title ?? '').trim();
  if (!trimmed) throw badRequest('عنوان الخطوة مطلوب');

  const last = await prisma.taskStep.findFirst({
    where: { taskId: id },
    orderBy: { orderIndex: 'desc' },
    select: { orderIndex: true },
  });

  const step = await prisma.taskStep.create({
    data: {
      taskId: id,
      title: trimmed.slice(0, 200),
      orderIndex: (last?.orderIndex ?? -1) + 1,
      estimatedMin: estimatedMin ?? null,
    },
  });

  res.status(201).json({ success: true, step });
});

export const toggleStep = asyncHandler(async (req, res) => {
  const { stepId } = req.params;

  const step = await prisma.taskStep.findFirst({
    where: { id: stepId, task: { userId: req.user.userId } },
  });

  if (!step) throw notFound('الخطوة غير موجودة');

  const updated = await prisma.taskStep.update({
    where: { id: stepId },
    data: { isCompleted: !step.isCompleted },
  });

  // كل الخطوات اكتملت؟ نلمّح للعميل بإتمام المهمة
  const remaining = await prisma.taskStep.count({
    where: { taskId: step.taskId, isCompleted: false },
  });

  res.json({
    success: true,
    step: updated,
    allStepsDone: remaining === 0,
  });
});

export const deleteStep = asyncHandler(async (req, res) => {
  const { stepId } = req.params;

  const step = await prisma.taskStep.findFirst({
    where: { id: stepId, task: { userId: req.user.userId } },
    select: { id: true },
  });

  if (!step) throw notFound('الخطوة غير موجودة');

  await prisma.taskStep.delete({ where: { id: stepId } });

  res.json({ success: true, message: 'تم حذف الخطوة' });
});

//////////////////////////////////////////////////////
// إحصائيات
//////////////////////////////////////////////////////

export const getTaskStats = asyncHandler(async (req, res) => {
  const userId = req.user.userId;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });

  const todayStart = streakService.startOfLocalDay(user.timezone);

  const [total, completed, todayDone, overdue, byPriority] = await Promise.all([
    prisma.task.count({ where: { userId } }),
    prisma.task.count({ where: { userId, isCompleted: true } }),
    prisma.task.count({
      where: { userId, isCompleted: true, completedAt: { gte: todayStart } },
    }),
    prisma.task.count({
      where: { userId, isCompleted: false, dueDate: { lt: new Date() } },
    }),
    prisma.task.groupBy({
      by: ['priority'],
      where: { userId, isCompleted: false },
      _count: true,
    }),
  ]);

  res.json({
    success: true,
    stats: {
      total,
      completed,
      pending: total - completed,
      completedToday: todayDone,
      overdue,
      completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
      pendingByPriority: Object.fromEntries(
        PRIORITIES.map((p) => [
          p,
          byPriority.find((b) => b.priority === p)?._count ?? 0,
        ]),
      ),
    },
  });
});

//////////////////////////////////////////////////////
// بلوكات المهام المتعددة والجدول الزمني المرتب
//////////////////////////////////////////////////////

export const createBatchBlocks = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { blocks, timezone } = req.body ?? {};

  const result = await taskBlockService.createBatchTaskBlocks({
    userId,
    blocks,
    timezone,
  });

  res.status(201).json(result);
});

export const getTimelineSchedule = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { date, startDate, endDate, timezone } = req.query;

  const result = await taskBlockService.getTimelineSchedule({
    userId,
    date,
    startDate,
    endDate,
    timezone,
  });

  res.status(200).json(result);
});

export const createQuickErrand = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { title, date, startTime, soundTheme, reminderMinutesBefore, timezone } = req.body ?? {};

  const result = await taskBlockService.createQuickErrand({
    userId,
    title,
    date,
    startTime,
    soundTheme,
    reminderMinutesBefore,
    timezone,
  });

  res.status(201).json(result);
});

export const getSoundThemes = asyncHandler(async (req, res) => {
  const result = taskBlockService.getSoundThemesList();
  res.status(200).json(result);
});
