import crypto from 'node:crypto';
import prisma from '../config/prisma.js';
import * as analyticsService from './analytics.service.js';
import * as taskNudge from './taskNudge.service.js';
import * as streakService from './streak.service.js';
import { badRequest, notFound } from '../utils/AppError.js';
import { scoped } from '../config/logger.js';

const log = scoped('task-block-service');

/**
 * ════════════════════════════════════════════════════════════
 *  محرك بلوكات المهام المتعددة والتنبيهات المسبقة
 * ════════════════════════════════════════════════════════════
 *
 *  الركائز:
 *   ١. إضافة متعددة سريعة في بلوكات ذرية (Batch Multi-Date Blocks)
 *   ٢. نغمات جاهزة ومميزة لكل مهمة (Built-in Sound Themes)
 *   ٣. نظام تنبيه مسبق تلقائي قبل موعد المهمة بـ ٥ دقائق (5-Minute Pre-Reminder)
 *   ٤. جدول زمني يومي مرتب من الصباح للمساء (Chronological Timeline View)
 */

export const SOUND_THEMES = {
  ZEN_BELL: { code: 'ZEN_BELL', name: 'جرس زن هادئ ', icon: '', description: 'رنين تأملي هادئ يساعد على التهيؤ للتركيز' },
  WARRIOR_CHIME: { code: 'WARRIOR_CHIME', name: 'رنين المحارب ️', icon: '️', description: 'نغمة ملحمية تحفيزية للمهام الحرجة' },
  GENTLE_HARP: { code: 'GENTLE_HARP', name: 'قيثارة ناعمة ', icon: '', description: 'أوتار استرخاء لطيفة ومريحة' },
  PULSE_WAVE: { code: 'PULSE_WAVE', name: 'موجة النبض ', icon: '', description: 'نبضات إلكترونية حديثة وسريعة' },
  MORNING_BIRDS: { code: 'MORNING_BIRDS', name: 'عصافير الصباح ', icon: '', description: 'تغريد طبيعي لبدايات الصباح الباكر' },
  DEEP_GONG: { code: 'DEEP_GONG', name: 'صنج عميق ', icon: '', description: 'صوت عميق يقطع التشتت فوراً' },
};

/** حساب الفارق بالدقائق بين وقتين بصيغة HH:mm */
const calculateMinutes = (start, end) => {
  if (!start || !end) return null;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let diff = eh * 60 + em - (sh * 60 + sm);
  if (diff < 0) diff += 24 * 60; // إذا عبرت منتصف الليل
  return diff > 0 ? diff : 60;
};

//////////////////////////////////////////////////////
// 1. إنشاء حزمة بلوكات المهام المتعددة وتوزيع الأيام
//////////////////////////////////////////////////////

export const createBatchTaskBlocks = async ({ userId, blocks, timezone = 'Africa/Cairo' }) => {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    throw badRequest('يجب إرسال مصفوفة بلوكات مهام صالحة');
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });

  const tz = user?.timezone || timezone;
  const today = streakService.localDate(tz);

  const createdTasks = [];

  await prisma.$transaction(async (tx) => {
    for (const block of blocks) {
      const {
        title,
        description,
        priority = 'GROWTH',
        soundTheme = 'ZEN_BELL',
        reminderMinutesBefore = 5,
        hasPreReminder = true,
        isQuickErrand = false,
        routineType,
        scheduleSlots,
        steps,
      } = block;

      if (!title || !String(title).trim()) {
        throw badRequest('عنوان المهمة مطلوب في كل بلوك');
      }

      const validPriorities = ['CRITICAL', 'GROWTH', 'QUICK'];
      const chosenPriority = validPriorities.includes(priority) ? priority : 'GROWTH';

      // الروتين اليومي (قرار المالك): DAILY فقط أو null
      const chosenRoutine = routineType === 'DAILY' ? 'DAILY' : null;
      const chosenSound = SOUND_THEMES[soundTheme]?.code || 'ZEN_BELL';
      const preMin = Math.max(1, Math.min(60, Number(reminderMinutesBefore) || 5));
      const repeatGroupId = crypto.randomUUID();

      const slots = Array.isArray(scheduleSlots) && scheduleSlots.length > 0
        ? scheduleSlots
        : [{ date: today.toISOString().slice(0, 10), startTime: null, endTime: null }];

      for (const slot of slots) {
        const slotDateObj = slot.date ? new Date(`${slot.date}T00:00:00.000Z`) : today;
        const estMin = calculateMinutes(slot.startTime, slot.endTime);

        let scheduledStart = null;
        let scheduledEnd = null;

        if (slot.date && slot.startTime) {
          scheduledStart = new Date(`${slot.date}T${slot.startTime}:00.000Z`);
        }
        if (slot.date && slot.endTime) {
          scheduledEnd = new Date(`${slot.date}T${slot.endTime}:00.000Z`);
        }

        const task = await tx.task.create({
          data: {
            userId,
            title: String(title).trim(),
            description: description ? String(description).trim() : null,
            priority: chosenPriority,
            soundTheme: chosenSound,
            reminderMinutesBefore: preMin,
            hasPreReminder: Boolean(hasPreReminder),
            isQuickErrand: Boolean(isQuickErrand),
            repeatGroupId,
            slotDate: slotDateObj,
            startTime: slot.startTime || null,
            endTime: slot.endTime || null,
            estimatedMin: estMin,
            scheduledStart,
            scheduledEnd,
            dueDate: scheduledEnd || slotDateObj,
            routineType: chosenRoutine,
          },
        });

        // إضافة الخطوات الفرعية إن وجدت
        if (Array.isArray(steps) && steps.length > 0) {
          for (let i = 0; i < steps.length; i++) {
            const stepTitle = typeof steps[i] === 'string' ? steps[i] : steps[i].title;
            if (stepTitle && String(stepTitle).trim()) {
              await tx.taskStep.create({
                data: {
                  taskId: task.id,
                  title: String(stepTitle).trim(),
                  orderIndex: i,
                },
              });
            }
          }
        }

        createdTasks.push(task);
      }
    }
  });

  await analyticsService.invalidateAnalytics(userId);

  // جدولة النكشة قبل الموعد لكل مهمة مفعّلة التنبيه
  for (const task of createdTasks) {
    await taskNudge.scheduleNudge(task).catch(() => {});
  }

  log.info({ userId, blocksCount: blocks.length, createdTasksCount: createdTasks.length }, ' تم إنشاء حزمة بلوكات المهام بنجاح');

  return {
    success: true,
    message: `تم حفظ ${createdTasks.length} مهام بنجاح وتوزيعها على التقويم والجدول اليومي `,
    createdCount: createdTasks.length,
    tasks: createdTasks,
  };
};

//////////////////////////////////////////////////////
// 2. الجدول الزمني اليومي المرتب (Timeline Schedule)
//////////////////////////////////////////////////////

export const getTimelineSchedule = async ({ userId, date, startDate, endDate, timezone = 'Africa/Cairo' }) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });

  const tz = user?.timezone || timezone;
  const todayStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  const targetStart = startDate || date || todayStr;
  const targetEnd = endDate || date || todayStr;

  const startObj = new Date(`${targetStart}T00:00:00.000Z`);
  const endObj = new Date(`${targetEnd}T23:59:59.999Z`);

  const tasks = await prisma.task.findMany({
    where: {
      userId,
      OR: [
        { slotDate: { gte: startObj, lte: endObj } },
        { dueDate: { gte: startObj, lte: endObj } },
      ],
    },
    include: {
      steps: { orderBy: { orderIndex: 'asc' } },
      focusSessions: {
        select: { id: true, status: true, serverVerifiedMin: true },
      },
    },
    orderBy: [
      { slotDate: 'asc' },
      { startTime: { sort: 'asc', nulls: 'last' } },
      { priority: 'asc' },
      { createdAt: 'asc' },
    ],
  });

  // تجميع المهام حسب التاريخ
  const daysMap = new Map();

  tasks.forEach((t) => {
    const dStr = t.slotDate
      ? t.slotDate.toISOString().slice(0, 10)
      : t.dueDate
      ? t.dueDate.toISOString().slice(0, 10)
      : targetStart;

    if (!daysMap.has(dStr)) {
      const dObj = new Date(`${dStr}T00:00:00.000Z`);
      const weekdayStr = new Intl.DateTimeFormat('ar-EG', {
        timeZone: tz,
        weekday: 'long',
      }).format(dObj);

      daysMap.set(dStr, {
        date: dStr,
        weekday: weekdayStr,
        isToday: dStr === todayStr,
        totalPlannedMinutes: 0,
        completedMinutes: 0,
        tasksCount: 0,
        completedCount: 0,
        criticalCount: 0,
        tasks: [],
      });
    }

    const dayEntry = daysMap.get(dStr);
    dayEntry.tasksCount += 1;
    if (t.isCompleted) dayEntry.completedCount += 1;
    if (t.priority === 'CRITICAL') dayEntry.criticalCount += 1;
    if (t.estimatedMin) dayEntry.totalPlannedMinutes += t.estimatedMin;

    const focusedMin = t.focusSessions.reduce((acc, f) => acc + (f.serverVerifiedMin || 0), 0);
    if (t.isCompleted) dayEntry.completedMinutes += focusedMin || t.estimatedMin || 0;

    dayEntry.tasks.push({
      id: t.id,
      title: t.title,
      description: t.description,
      priority: t.priority,
      isCompleted: t.isCompleted,
      completedAt: t.completedAt,
      startTime: t.startTime,
      endTime: t.endTime,
      timeSlotFormatted: t.startTime && t.endTime ? `${t.startTime} - ${t.endTime}` : null,
      estimatedMin: t.estimatedMin,
      focusedMin,
      soundTheme: t.soundTheme,
      soundThemeDetails: SOUND_THEMES[t.soundTheme] || SOUND_THEMES.ZEN_BELL,
      reminderMinutesBefore: t.reminderMinutesBefore,
      hasPreReminder: t.hasPreReminder,
      isQuickErrand: t.isQuickErrand,
      repeatGroupId: t.repeatGroupId,
      steps: t.steps,
    });
  });

  const days = Array.from(daysMap.values());

  return {
    success: true,
    timezone: tz,
    range: { startDate: targetStart, endDate: targetEnd },
    totalDays: days.length,
    days,
  };
};

//////////////////////////////////////////////////////
// 3. مشوار سريع بنقرة واحدة (Quick Errand)
//////////////////////////////////////////////////////

export const createQuickErrand = async ({
  userId,
  title,
  date,
  startTime,
  soundTheme = 'ZEN_BELL',
  reminderMinutesBefore = 5,
  timezone = 'Africa/Cairo',
}) => {
  if (!title || !String(title).trim()) {
    throw badRequest('عنوان المشوار السريع مطلوب');
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });

  const tz = user?.timezone || timezone;
  const today = streakService.localDate(tz);
  const slotDateObj = date ? new Date(`${date}T00:00:00.000Z`) : today;

  const task = await prisma.task.create({
    data: {
      userId,
      title: String(title).trim(),
      priority: 'QUICK',
      isQuickErrand: true,
      soundTheme: SOUND_THEMES[soundTheme]?.code || 'ZEN_BELL',
      reminderMinutesBefore: Number(reminderMinutesBefore) || 5,
      hasPreReminder: true,
      slotDate: slotDateObj,
      startTime: startTime || null,
      dueDate: slotDateObj,
    },
  });

  await analyticsService.invalidateAnalytics(userId);

  return {
    success: true,
    message: 'تمت إضافة المشوار السريع بنجاح ️',
    task,
  };
};

//////////////////////////////////////////////////////
// 4. استعراض النغمات والتنبيهات المجهزة
//////////////////////////////////////////////////////

export const getSoundThemesList = () => {
  return {
    success: true,
    defaultTheme: 'ZEN_BELL',
    defaultPreReminderMinutes: 5,
    themes: Object.values(SOUND_THEMES),
  };
};

export default {
  createBatchTaskBlocks,
  getTimelineSchedule,
  createQuickErrand,
  getSoundThemesList,
  SOUND_THEMES,
};
