/**
 * ═══════════════════════════════════════════════════════════
 *  جدولة أيام الجبل — Journey Scheduler Service
 *
 *  يحوّل JourneyDay النشط (currentDay = أول يوم PENDING) إلى Task
 *  في قسم المهام — تلقائياً عند منتصف ليل المستخدم المحلي.
 *
 *  ⚠️ صفر AI — منطق برمجي خالص (قرار المالك: الـ AI خطط مرة واحدة فقط).
 *
 *  ⚠️ التوقيت محلي لكل مستخدم (قرار المالك):
 *     المهمة لا تتولد إلا عندما يكون scheduledDate <= اليوم المحلي للمستخدم
 *     (تاريخُه محسوب بـ timezone من User.timezone عبر Intl).
 *     أي يوم معاده في المستقبل → deferred (يُولَّد لما ييجي منتصف ليله).
 *
 *  Idempotent: اليوم الواحد يولّد مهمة واحدة فقط (unique على journeyDayId)
 *  — لو اتنادى مرات (جوب 15 دقيقة + فتح التطبيق) مفيش تكرار.
 * ═══════════════════════════════════════════════════════════
 */
import prisma from '../config/prisma.js';
import { localDate } from './streak.service.js';
import { scoped } from '../config/logger.js';

const log = scoped('journey-scheduler');

/**
 * توليد مهام اليوم النشط لكل رحلات ACTIVE لمستخدم (أو لرحلة محددة)
 * @param {object} opts
 * @param {string} [opts.userId]  — كل رحلات المستخدم النشطة
 * @param {string} [opts.journeyId] — رحلة واحدة محددة
 * @returns {Promise<{created: number, skipped: number, deferred: number}>}
 */
export const generateTodayTasks = async ({ userId, journeyId } = {}) => {
  const whereJourneys = { status: 'ACTIVE' };
  if (journeyId) whereJourneys.id = journeyId;
  else if (userId) whereJourneys.step = { goal: { userId } };

  const journeys = await prisma.journey.findMany({
    where: whereJourneys,
    include: {
      step: { select: { id: true, goalId: true, goal: { select: { userId: true } } } },
      days: {
        where: { status: 'PENDING' },
        orderBy: { dayNumber: 'asc' },
      },
    },
  });

  // خريطة المنطقة الزمنية لكل مستخدم — لتحديد "النهارده" المحلي
  const userIds = [...new Set(journeys.map((j) => j.step.goal.userId))];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, timezone: true },
  });
  const tzMap = new Map(users.map((u) => [u.id, u.timezone || 'Africa/Cairo']));

  let created = 0;
  let skipped = 0;
  let deferred = 0;
  const createdByUser = new Map(); // userId → [titles]

  for (const journey of journeys) {
    // اليوم النشط = أول يوم PENDING (المرونة: اليوم الجاي مفتوح دايماً)
    const day = journey.days[0];
    if (!day) continue;

    // Idempotent: لو في Task مولدة بالفعل لليوم ده → سكيب
    const existing = await prisma.task.findUnique({
      where: { journeyDayId: day.id },
      select: { id: true },
    });
    if (existing) {
      skipped++;
      continue;
    }

    // ═══ بوابة منتصف الليل المحلي ═══
    // اليوم لا يتولد قبل معاده (scheduledDate) — ينتظر منتصف ليل المستخدم
    const tz = tzMap.get(journey.step.goal.userId) || 'Africa/Cairo';
    const localToday = localDate(tz); // Date يمثل اليوم المحلي (منتصف ليل UTC-labelled)
    const dayDate = day.scheduledDate
      ? new Date(day.scheduledDate.toISOString().slice(0, 10) + 'T00:00:00.000Z')
      : localToday;

    if (dayDate.getTime() > localToday.getTime()) {
      deferred++;
      continue; // معاده لسه مجاش — الساعة 12 بليل المستخدم الجوب هيولّده
    }

    try {
      await prisma.task.create({
        data: {
          userId: journey.step.goal.userId,
          title: day.title,
          description: day.description ?? `اليوم ${day.dayNumber} من رحلة «${journey.title}»`,
          priority: 'GROWTH',
          source: 'JOURNEY',
          journeyDayId: day.id,
          goalStepId: journey.step.id,
          dueDate: day.scheduledDate ?? new Date(),
          slotDate: day.scheduledDate ?? new Date(),
        },
      });
      created++;
      const uid = journey.step.goal.userId;
      if (!createdByUser.has(uid)) createdByUser.set(uid, []);
      createdByUser.get(uid).push(day.title);
    } catch (e) {
      if (e.code === 'P2002') {
        // سباق: مهمة اتخلقت في نفس اللحظة — مفيش مشكلة
        skipped++;
      } else {
        throw e;
      }
    }
  }

  // إشعار خفيف: "مهامك النهارده جاهزة" — مرة لكل مستخدم اتولدت له مهام
  for (const [uid, titles] of createdByUser) {
    try {
      await prisma.notification.create({
        data: {
          userId: uid,
          type: 'TASK_REMINDER',
          title: 'مهامك لليوم جاهزة 🏔️',
          body: `النهارده عندك: ${titles.slice(0, 3).join(' · ')}${titles.length > 3 ? '…' : ''}`,
          data: { kind: 'journey-daily', count: titles.length },
        },
      });
    } catch {
      /* الإشعار لا يُفشل التوليد */
    }
  }

  if (created > 0) {
    log.info({ created, skipped, deferred }, 'journey-scheduler: تم توليد مهام اليوم');
  }
  return { created, skipped, deferred };
};
