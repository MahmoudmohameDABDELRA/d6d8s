/**
 * ═══════════════════════════════════════════════════════════
 *  إقلاع رحلة الهدف — Journey Bootstrap Service
 *
 *  بيولّد رحلة هدف واحد ويفعّلها ويطلّع مهمة اليوم الأول —
 *  العملية كاملة في نداء واحد.
 *
 *  ️ ليه خدمة منفصلة مش دالة في الكنترولر؟
 *     لأنها بتتنادى من مكانين مختلفين تماماً:
 *       1. `approveDreamPlan` — تلقائياً بعد ما المستخدم يوافق على
 *          جبله (عشان ما يلاقيش المهام فاضية)
 *       2. `generateStepJourney` — يدوياً لما يفتح مرحلة تانية
 *     والكنترولر مربوط بـ req/res فمينفعش يتنادى من جوه نفسه.
 *
 *  ️ Fail-Safe مش Fail-Fast: لو الـ AI وقع أثناء الإقلاع التلقائي،
 *     الجبل يفضل متثبّت والمستخدم يقدر يولّد الرحلة يدوياً بعدين.
 *     تعطّل رفاهية ما يلغيش إنجاز.
 * ═══════════════════════════════════════════════════════════
 */
import prisma from '../config/prisma.js';
import * as journeyPlanner from './journeyPlanner.service.js';
import * as journeyScheduler from './journeyScheduler.service.js';
import { localDate } from './streak.service.js';
import { scoped } from '../config/logger.js';

const log = scoped('journey-bootstrap');

/**
 * يولّد رحلة مرحلة ويفعّلها ويطلّع مهمة اليوم الأول.
 *
 * @param {object} opts
 * @param {string} opts.stepId
 * @param {string} opts.userId
 * @param {boolean} [opts.autoApprove=false]
 *   true  → الرحلة تتفعّل فوراً وتتولّد مهمة اليوم (الإقلاع التلقائي)
 *   false → تتساب DRAFT عشان المستخدم يراجعها ويوافق (المسار اليدوي)
 *
 * @returns {Promise<{journey, days, generatedTasks}>}
 * @throws  {Error} بـ code: AI_NOT_READY · JOURNEY_EXISTS · STEP_NOT_FOUND
 *                  أو أكواد Gemini (GEMINI_QUOTA …)
 */
export const bootstrapStepJourney = async ({ stepId, userId, autoApprove = false }) => {
  const step = await prisma.goalStep.findFirst({
    where: { id: stepId, goal: { userId }, isCompleted: false },
    include: {
      goal: { select: { title: true } },
      journey: { select: { id: true } },
    },
  });

  if (!step) {
    throw Object.assign(new Error('المرحلة غير موجودة أو مكتملة'), {
      code: 'STEP_NOT_FOUND',
    });
  }

  // رحلة واحدة لكل مرحلة — بيمنع التكرار لو الطلب اتبعت مرتين
  if (step.journey) {
    throw Object.assign(new Error('هذه المرحلة ليها رحلة بالفعل'), {
      code: 'JOURNEY_EXISTS',
    });
  }

  if (!journeyPlanner.isJourneyPlannerReady()) {
    throw Object.assign(new Error('الرفيق غير متاح حالياً'), {
      code: 'GEMINI_NOT_CONFIGURED',
    });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true, companionName: true, timezone: true },
  });

  // ── نداء الـ AI: الهدف → أيام ──
  const plan = await journeyPlanner.generateJourney({
    username: user?.username,
    dreamTitle: step.goal.title,
    goalTitle: step.title,
    companionName: user?.companionName,
  });

  const tz = user?.timezone || 'Africa/Cairo';
  const startOfToday = localDate(tz);

  // ── التخزين: Journey + أيامها في transaction واحدة ──
  const journey = await prisma.$transaction(async (tx) => {
    const j = await tx.journey.create({
      data: {
        goalStepId: step.id,
        title: `رحلة «${step.title}»`,
        durationDays: plan.days.length,
        ...(autoApprove
          ? { status: 'ACTIVE', approvedAt: new Date(), currentDay: 1 }
          : {}),
      },
    });

    await tx.journeyDay.createMany({
      data: plan.days.map((d) => ({
        journeyId: j.id,
        dayNumber: d.day,
        title: d.title,
        description: d.description,
        /**
         * ️ التواريخ بتتوزّع هنا في نفس الـ transaction لما نكون
         *    بنفعّل تلقائياً — لو سبناها للموافقة اليدوية هتفضل
         *    null والـ scheduler مش هيعرف يقرر إمتى يولّد المهمة.
         */
        ...(autoApprove
          ? {
              scheduledDate: (() => {
                const dt = new Date(startOfToday);
                dt.setDate(dt.getDate() + (d.day - 1));
                return dt;
              })(),
            }
          : {}),
      })),
    });

    return j;
  });

  // ── مهمة اليوم الأول (صفر AI — منطق برمجي) ──
  let generatedTasks = 0;
  if (autoApprove) {
    const sched = await journeyScheduler.generateTodayTasks({ journeyId: journey.id });
    generatedTasks = sched.created;
  }

  const days = await prisma.journeyDay.findMany({
    where: { journeyId: journey.id },
    orderBy: { dayNumber: 'asc' },
  });

  log.info(
    { stepId, userId, days: days.length, autoApprove, generatedTasks },
    'اتولدت رحلة مرحلة',
  );

  return { journey, days, generatedTasks };
};

export default { bootstrapStepJourney };
