/**
 * ════════════════════════════════════════════════════════════
 *  النبض الاستباقي — المرافق يبدأ الكلام بصفر توكن
 * ════════════════════════════════════════════════════════════
 *
 *  دورة الحياة الكاملة:
 *
 *    ٣:٠٠  بدأ مهمة        →  IN_FOCUS: المرافق ساكت تماماً 
 *    ٥:٠٠  خلص وقتها       →  يُرصَد حدث PENDING بموعد استحقاق
 *    ٥:٣٠  (تأخير HIGH)    →   إشعار من قالب برمجي · صفر توكن
 *
 *            [لاحقاً] → صفر توكن ·  الموضوع يُقفل نهائياً
 *            [رد]     → القالب + رده → النموذج → محادثة ·  يُقفل
 *
 *  ️ ثلاثة قوانين حاكمة، كلٌّ منها قرار صريح من المستخدم:
 *
 *   ١. **مرة واحدة لكل حدث.** لا إعادة سؤال بعد "لاحقاً" ولا
 *      بعد الرد. القيد @@unique([userId, subjectKey]) يفرضها
 *      على مستوى القاعدة لا الكود.
 *
 *   ٢. **الدمج.** أحداث متقاربة → إشعار واحد. نافذة ٥ دقائق
 *      + تهدئة ٣٠ دقيقة بين الإشعارات. مستحيل أن يتلقى ثلاثة
 *      إشعارات في نصف ساعة.
 *
 *   ٣. **الصمت أثناء التركيز.** التطبيق كله مبني على "ركّز بلا
 *      مقاطعة" — فلا يقاطعه المرافق داخل الجلسة. حتى الأحداث
 *      المستحقة تنتظر انتهاءها.
 */

import prisma from '../config/prisma.js';
import { PLANS, dailyLimitFor, resolvePlan } from '../config/aiPlans.js';
import * as templates from '../config/pulseTemplates.js';

// ════════════════════════════════════════════════
//  ثوابت التوقيت
// ════════════════════════════════════════════════

/** أحداث داخل هذه النافذة تُدمج في إشعار واحد */
export const MERGE_WINDOW_MS = 5 * 60_000;

/**
 * أقل فاصل بين إشعارين — مهما تراكمت الأحداث.
 *
 * ️ توفيق بين قرارين للمستخدم: "دمج ٣ إشعارات في ٣٠ دقيقة"
 *    و"نافذة تجميع ٥ دقائق". النافذة تجمع المتزامن، والتهدئة
 *    تمنع التتابع. أي حدث يستحق أثناء التهدئة ينتظر التالي.
 */
export const COOLDOWN_MS = 30 * 60_000;

/** حدث أقدم من هذا لا يُسأل عنه — فات أوانه */
export const EVENT_TTL_MS = 12 * 3_600_000;

/** دورة تسليم السياق الثابتة — قرار المستخدم: كل 6 ساعات */
export const CONTEXT_SYNC_MS = 6 * 3_600_000;

const PRIORITY_AR = { CRITICAL: 'حرجة', GROWTH: 'نمو', QUICK: 'سريعة' };
const DAY_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

const startOfLocalDay = (offsetMinutes = 0) => {
  const local = new Date(Date.now() - offsetMinutes * 60_000);
  local.setHours(0, 0, 0, 0);
  return new Date(local.getTime() + offsetMinutes * 60_000);
};

// ════════════════════════════════════════════════
//  ١) ملف الحالة — كل ما يعرفه المرافق
// ════════════════════════════════════════════════

/**
 * يبني الصورة الكاملة.
 *
 * ️ كانت هذه الدالة تفوّت **الأهداف والتوثيق الأسبوعي**
 *    بينما بانية السياق العادية تراهما. النتيجة: المرافق
 *    يفقد نصف ذاكرته حين تُفتح المحادثة من إشعار.
 *    الآن مصدر واحد يرى كل شيء.
 *
 * ️ الملاحظات الحرة (Note) مشمولة — أثمن مصدر لأنها الشيء
 *    الوحيد الذي يكتبه المستخدم بكلماته بلا قالب.
 */
export const buildSnapshot = async (userId, tzOffsetMinutes = 0) => {
  const dayStart = startOfLocalDay(tzOffsetMinutes);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);

  const [user, sub, tasks, alarms, sessions, wake, goal, lastWeek, notes, activeSession] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          username: true,
          domain: true,
          specialty: true,
          timezone: true,
          sparksBalance: true,
          currentStreak: true,
          totalFocusMin: true,
        },
      }),

      prisma.subscription.findUnique({ where: { userId } }),

      prisma.task.findMany({
        where: {
          userId,
          OR: [
            { isCompleted: false },
            { completedAt: { gte: dayStart, lt: dayEnd } },
          ],
        },
        select: {
          id: true,
          title: true,
          description: true,
          priority: true,
          estimatedMin: true,
          dueDate: true,
          scheduledStart: true,
          scheduledEnd: true,
          isCompleted: true,
          completedAt: true,
          steps: {
            select: { title: true, isCompleted: true },
            orderBy: { orderIndex: 'asc' },
            take: 10,
          },
        },
        orderBy: [{ priority: 'asc' }, { dueDate: { sort: 'asc', nulls: 'last' } }],
        take: 25,
      }),

      prisma.battleAlarm.findMany({
        where: { userId, isActive: true },
        select: { id: true, time: true, days: true, wakeStreak: true },
        orderBy: { time: 'asc' },
        take: 10,
      }),

      prisma.focusSession.findMany({
        where: { userId, startedAt: { gte: dayStart } },
        select: {
          id: true,
          plannedMin: true,
          serverVerifiedMin: true,
          status: true,
          startedAt: true,
          endedAt: true,
        },
        orderBy: { startedAt: 'desc' },
        take: 10,
      }),

      prisma.wakeLog.findFirst({
        where: { userId, firedAt: { gte: dayStart } },
        select: { result: true, responseSec: true, firedAt: true },
        orderBy: { firedAt: 'desc' },
      }),

      /** ️ كانت مفقودة — الهدف والوعد أهم سياق طويل المدى */
      prisma.goal.findFirst({
        where: { userId, isActive: true, completedAt: null },
        select: {
          title: true,
          vision: true,
          pledge: true,
          currentWeek: true,
          weeks: {
            where: { status: 'OPEN' },
            select: { weekNumber: true, title: true },
            take: 1,
          },
        },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
      }),

      /** ️ كان مفقوداً — ما كتبه عن أخطائه بيده */
      prisma.goalWeek.findFirst({
        where: { goal: { userId }, status: 'DOCUMENTED' },
        select: { weekNumber: true, reflection: true, mistakes: true },
        orderBy: { documentedAt: 'desc' },
      }),

      /** الملاحظات الحرة */
      prisma.note.findMany({
        where: { userId },
        select: { title: true, body: true, tag: true, updatedAt: true },
        orderBy: [{ isPinned: 'desc' }, { updatedAt: 'desc' }],
        take: 5,
      }),

      prisma.focusSession.findFirst({
        where: { userId, status: 'ACTIVE' },
        select: { id: true, plannedMin: true, startedAt: true },
      }),
    ]);

  if (!user) return null;

  const plan = resolvePlan(sub);

  return {
    generatedAt: new Date().toISOString(),
    plan: { key: plan.key, nameAr: plan.nameAr, pulseDelayMin: plan.pulseDelayMin },

    /** الحالة اللحظية — يحكم الصمت */
    state: activeSession
      ? {
          name: 'IN_FOCUS',
          sessionId: activeSession.id,
          plannedMin: activeSession.plannedMin,
          elapsedMin: Math.floor(
            (Date.now() - new Date(activeSession.startedAt).getTime()) / 60_000,
          ),
        }
      : { name: 'IDLE' },

    user: {
      name: user.username,
      domain: user.domain,
      specialty: user.specialty,
      timezone: user.timezone,
      sparks: user.sparksBalance,
      streak: user.currentStreak,
      totalHours: Math.round((user.totalFocusMin ?? 0) / 60),
    },

    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      note: t.description ?? null,
      priority: PRIORITY_AR[t.priority] ?? t.priority,
      estimatedMin: t.estimatedMin,
      scheduledStart: t.scheduledStart ? new Date(t.scheduledStart).toISOString() : null,
      scheduledEnd: t.scheduledEnd ? new Date(t.scheduledEnd).toISOString() : null,
      due: t.dueDate ? new Date(t.dueDate).toISOString() : null,
      done: t.isCompleted,
      doneAt: t.completedAt ? new Date(t.completedAt).toISOString() : null,
      steps: t.steps.map((s) => ({ title: s.title, done: s.isCompleted })),
    })),

    alarms: alarms.map((a) => ({
      id: a.id,
      time: a.time,
      days: a.days,
      daysAr: a.days?.length === 7 ? 'يومياً' : (a.days ?? []).map((d) => DAY_AR[d]).join('، '),
      streak: a.wakeStreak,
    })),

    goal: goal
      ? {
          title: goal.title,
          vision: goal.vision,
          pledge: goal.pledge,
          week: goal.currentWeek,
          openWeek: goal.weeks[0]?.title ?? null,
        }
      : null,

    lastJournal: lastWeek
      ? {
          week: lastWeek.weekNumber,
          reflection: lastWeek.reflection?.slice(0, 160) ?? null,
          mistakes: lastWeek.mistakes?.slice(0, 160) ?? null,
        }
      : null,

    notes: notes.map((n) => ({
      title: n.title,
      body: n.body.slice(0, 200),
      tag: n.tag,
    })),

    sessions: sessions.map((s) => ({
      plannedMin: s.plannedMin,
      actualMin: s.serverVerifiedMin,
      status: s.status,
      endedAt: s.endedAt ? new Date(s.endedAt).toISOString() : null,
    })),

    today: {
      tasksDone: tasks.filter((t) => t.isCompleted).length,
      tasksPending: tasks.filter((t) => !t.isCompleted).length,
      focusMinutes: sessions
        .filter((s) => s.status === 'COMPLETED')
        .reduce((sum, s) => sum + (s.serverVerifiedMin ?? 0), 0),
      focusSessions: sessions.filter((s) => s.status === 'COMPLETED').length,
      wake: wake ? { result: wake.result, responseSec: wake.responseSec } : null,
    },
  };
};

/**
 * يضغط الملف نصاً — أرخص من JSON بنحو 80%.
 */
export const snapshotToPrompt = (snap) => {
  if (!snap) return '';
  const L = [];
  const u = snap.user;

  L.push(`المستخدم: ${u.name}${u.specialty ? ` · ${u.specialty}` : ''}`);
  L.push(
    `اليوم: ${snap.today.tasksDone} مهمة · ${snap.today.focusMinutes}د تركيز · سلسلة ${u.streak} يوم`,
  );

  if (snap.state.name === 'IN_FOCUS') {
    L.push(` في جلسة الآن: ${snap.state.elapsedMin}د من ${snap.state.plannedMin}د`);
  }

  const done = snap.tasks.filter((t) => t.done);
  const open = snap.tasks.filter((t) => !t.done);

  if (done.length) L.push(`خلّص: ${done.map((t) => t.title).join(' · ')}`);

  if (open.length) {
    L.push(
      `معلّق: ${open
        .slice(0, 6)
        .map((t) => {
          const left = t.steps.filter((s) => !s.done).length;
          const when = t.scheduledEnd
            ? ` @${new Date(t.scheduledEnd).toISOString().slice(11, 16)}`
            : '';
          return `${t.title} [${t.priority}${when}]${left ? ` {${left} خطوة}` : ''}`;
        })
        .join(' | ')}`,
    );
  }

  if (snap.alarms.length) {
    L.push(`منبهات: ${snap.alarms.map((a) => `${a.time} (${a.daysAr})`).join(' · ')}`);
  }

  if (snap.goal) {
    L.push(`الهدف: ${snap.goal.title} — أسبوع ${snap.goal.week}`);
    if (snap.goal.pledge) L.push(`وعده: "${snap.goal.pledge}"`);
  }

  if (snap.lastJournal?.reflection) {
    L.push(`آخر توثيق: ${snap.lastJournal.reflection}`);
    if (snap.lastJournal.mistakes) L.push(`اعترف بخطأ: ${snap.lastJournal.mistakes}`);
  }

  if (snap.notes.length) {
    L.push(
      `ملاحظاته: ${snap.notes
        .map((n) => `${n.title ? `${n.title}: ` : ''}${n.body.slice(0, 80)}`)
        .join(' | ')}`,
    );
  }

  return L.join('\n');
};

// ════════════════════════════════════════════════
//  ٢) الرصد — تحويل الأحداث إلى صفوف PENDING
// ════════════════════════════════════════════════

/**
 * يرصد ما استجدّ ويسجّله كأحداث معلّقة.
 *
 * ️ لا يُرسل شيئاً ولا ينادي النموذج. مجرد تسجيل.
 *    القيد @@unique يمنع تكرار الرصد تلقائياً — نبتلع P2002.
 *
 * @returns {number} كم حدثاً جديداً رُصد
 */
export const detectEvents = async (userId, snap) => {
  if (!snap) return 0;

  const now = Date.now();
  const delayMs = snap.plan.pulseDelayMin * 60_000;
  const found = [];

  for (const t of snap.tasks) {
    // أُنجزت فعلاً
    if (t.done && t.doneAt) {
      const at = new Date(t.doneAt).getTime();
      if (now - at <= EVENT_TTL_MS) {
        found.push({
          subjectKey: `task_done:${t.id}`,
          trigger: 'TASK_DONE',
          subjectName: t.title,
          dueAt: new Date(at + delayMs),
        });
      }
      continue;
    }

    /**
     * ️ انتهى وقتها المجدول ولم يقفلها.
     *    قرار المستخدم: "نسأله بعد الوقت المجدول على طول".
     *    نسأل بلا افتراض — "لحقت تخلّصها؟" لا "برافو خلّصت".
     */
    const endAt = t.scheduledEnd
      ? new Date(t.scheduledEnd).getTime()
      : t.due
        ? new Date(t.due).getTime()
        : null;

    if (endAt && endAt <= now && now - endAt <= EVENT_TTL_MS) {
      found.push({
        subjectKey: `task_end:${t.id}`,
        trigger: 'TASK_SCHEDULED_END',
        subjectName: t.title,
        dueAt: new Date(endAt + delayMs),
      });
    }
  }

  // جلسات تركيز اكتملت
  for (const s of snap.sessions) {
    if (s.status !== 'COMPLETED' || !s.endedAt) continue;
    const at = new Date(s.endedAt).getTime();
    if (now - at > EVENT_TTL_MS) continue;
    found.push({
      subjectKey: `focus:${s.endedAt}`,
      trigger: 'FOCUS_DONE',
      subjectName: String(s.actualMin ?? s.plannedMin),
      dueAt: new Date(at + delayMs),
    });
  }

  // الاستيقاظ
  if (snap.today.wake) {
    found.push({
      subjectKey: `wake:${new Date().toISOString().slice(0, 10)}`,
      trigger: 'ALARM_FIRED',
      subjectName: '',
      dueAt: new Date(now + delayMs),
    });
  }

  let created = 0;
  for (const e of found) {
    try {
      await prisma.aiPulseEvent.create({ data: { userId, ...e, status: 'PENDING' } });
      created += 1;
    } catch (err) {
      if (err?.code !== 'P2002') throw err; // مرصود من قبل — طبيعي
    }
  }

  return created;
};

// ════════════════════════════════════════════════
//  ٣) الأهلية — خمسة أبواب قبل أي إشعار
// ════════════════════════════════════════════════

/**
 * @returns {{eligible, reason?, plan?, events?, snapshot?}}
 */
export const checkEligibility = async (userId, tzOffsetMinutes = 0) => {
  const snap = await buildSnapshot(userId, tzOffsetMinutes);
  if (!snap) return { eligible: false, reason: 'NO_USER' };

  /**
   * ️ الباب الأول: الصمت أثناء التركيز.
   *    يسبق كل شيء — حتى الحدث المستحق ينتظر.
   */
  if (snap.state.name === 'IN_FOCUS') {
    return { eligible: false, reason: 'IN_FOCUS', plan: snap.plan.key };
  }

  // ساعات الهدوء
  const localHour = new Date(Date.now() - tzOffsetMinutes * 60_000).getHours();
  if (localHour >= 23 || localHour < 7) {
    return { eligible: false, reason: 'QUIET_HOURS', plan: snap.plan.key };
  }

  // نرصد ما استجدّ قبل الفحص
  await detectEvents(userId, snap);

  const plan = PLANS[snap.plan.key] ?? PLANS.FREE;
  const dayStart = startOfLocalDay(tzOffsetMinutes);
  const now = Date.now();

  const [lastPulse, pulsesToday, pending] = await Promise.all([
    prisma.aiPulse.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    prisma.aiPulse.count({ where: { userId, createdAt: { gte: dayStart } } }),
    prisma.aiPulseEvent.findMany({
      where: { userId, status: 'PENDING', dueAt: { lte: new Date(now) } },
      orderBy: { dueAt: 'asc' },
      take: 10,
    }),
  ]);

  // التهدئة — مهما تراكم
  if (lastPulse) {
    const since = now - new Date(lastPulse.createdAt).getTime();
    if (since < COOLDOWN_MS) {
      return {
        eligible: false,
        reason: 'COOLDOWN',
        plan: snap.plan.key,
        waitMin: Math.ceil((COOLDOWN_MS - since) / 60_000),
      };
    }
  }

  // سقف الإشعارات المجانية
  if (pulsesToday >= plan.maxPulsesPerDay) {
    return { eligible: false, reason: 'PULSE_CAP', plan: snap.plan.key };
  }

  if (!pending.length) {
    return { eligible: false, reason: 'NOTHING_TO_ASK', plan: snap.plan.key };
  }

  /**
   * ️ الدمج: نأخذ الأحداث داخل نافذة ٥ دقائق من الأقدم المستحق.
   *    الباقي يبقى PENDING وينتظر الإشعار التالي بعد التهدئة.
   */
  const anchor = new Date(pending[0].dueAt).getTime();
  const batch = pending.filter(
    (e) => new Date(e.dueAt).getTime() - anchor <= MERGE_WINDOW_MS,
  );

  return { eligible: true, plan: snap.plan.key, snapshot: snap, events: batch };
};

// ════════════════════════════════════════════════
//  ٤) الإشعار — قالب برمجي بصفر توكن
// ════════════════════════════════════════════════

/**
 * يبني الإشعار ويسجّله. **لا ينادي النموذج إطلاقاً.**
 *
 * ️ هذه هي فكرة المستخدم التي توفّر ~85%: السؤال يُكتب
 *    برمجياً، والنموذج لا يُنادى إلا حين يضغط "رد".
 */
export const createTemplatePulse = async (userId, events) => {
  const text = templates.merged(
    events.map((e) => ({ trigger: e.trigger, subjectName: e.subjectName })),
  );

  const pulse = await prisma.aiPulse.create({
    data: { userId, kind: 'TEMPLATE', message: text },
    select: { id: true },
  });

  const notification = await prisma.notification.create({
    data: {
      userId,
      type: 'AI_PROACTIVE',
      title: templates.title(events),
      body: text.slice(0, 250),
      data: {
        pulseId: pulse.id,
        eventCount: events.length,
        subjects: events.map((e) => e.subjectName).filter(Boolean),
        actions: ['REPLY', 'LATER'],
      },
    },
    select: { id: true },
  });

  /**
   * ️ SENT لا DELETED: الصفوف تبقى فيبقى قيد @@unique فاعلاً،
   *    فلا يُسأل عن نفس الحدث مرة أخرى أبداً — حتى بعد سنة.
   */
  await prisma.aiPulseEvent.updateMany({
    where: { id: { in: events.map((e) => e.id) } },
    data: { status: 'SENT', pulseId: pulse.id },
  });

  await prisma.aiPulse.update({
    where: { id: pulse.id },
    data: { notificationId: notification.id },
  });

  return { pulseId: pulse.id, notificationId: notification.id, message: text };
};

export default {
  buildSnapshot,
  snapshotToPrompt,
  detectEvents,
  checkEligibility,
  createTemplatePulse,
  MERGE_WINDOW_MS,
  COOLDOWN_MS,
  EVENT_TTL_MS,
  CONTEXT_SYNC_MS,
};
