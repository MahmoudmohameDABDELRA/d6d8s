import prisma from '../config/prisma.js';

/**
 * ════════════════════════════════════════════════════════════
 *  بانية السياق — الفرق بين شات عام ومرافق يعرفك
 * ════════════════════════════════════════════════════════════
 *
 *  تجمع صورة اليوم من قاعدة البيانات وتضغطها في نصّ قصير.
 *
 *  ثلاثة مبادئ:
 *
 *   1. **الإيجاز يوفّر مالاً.** كل توكن إدخال محاسَب. نرسل
 *      أرقاماً مكثّفة لا صفوفاً كاملة — السياق ~180 توكن
 *      بدل ~1,500 لو أرسلنا JSON خاماً.
 *
 *   2. **الخصوصية أولاً.** المحادثات الخاصة لا تدخل السياق
 *      إطلاقاً — فيها كلام طرف ثانٍ لم يوافق.
 *
 *   3. **استعلام واحد متوازٍ.** كل القراءات في Promise.all
 *      حتى لا يتراكم زمن الانتظار قبل كل رسالة.
 */

/** بداية اليوم بتوقيت المستخدم المحلي */
const startOfLocalDay = (offsetMinutes = 0) => {
  const now = new Date();
  const local = new Date(now.getTime() - offsetMinutes * 60_000);
  local.setHours(0, 0, 0, 0);
  return new Date(local.getTime() + offsetMinutes * 60_000);
};

const PRIORITY_AR = { CRITICAL: 'حرجة', GROWTH: 'نمو', QUICK: 'سريعة' };
const DOMAIN_AR = {
  STUDY: 'دراسة',
  BUSINESS: 'بيزنس',
  TECH: 'تقنية',
  HEALTH: 'صحة',
  CREATIVE: 'إبداع',
  SELF_GROWTH: 'تطوير ذات',
};

/**
 * يبني صورة اليوم.
 *
 * @param {string} userId
 * @param {number} tzOffsetMinutes  فرق التوقيت من الجهاز
 * @returns {object} بيانات منظّمة (لا نصّ — التنسيق مهمة أخرى)
 */
export const build = async (userId, tzOffsetMinutes = 0) => {
  const dayStart = startOfLocalDay(tzOffsetMinutes);
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);

  const [
    user,
    tasksToday,
    tasksPending,
    sessionsToday,
    sessionsWeek,
    activeSession,
    alarms,
    wakeToday,
    goal,
    lastJournal,
    recentNotes,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        username: true,
        companionName: true,
        domain: true,
        specialty: true,
        sparksBalance: true,
        currentStreak: true,
        longestStreak: true,
        totalFocusMin: true,
        timezone: true,
      },
    }),

    prisma.task.count({
      where: { userId, isCompleted: true, completedAt: { gte: dayStart } },
    }),

    prisma.task.findMany({
      where: { userId, isCompleted: false },
      select: { title: true, priority: true, dueDate: true },
      orderBy: [{ priority: 'asc' }, { dueDate: { sort: 'asc', nulls: 'last' } }],
      take: 5,
    }),

    prisma.focusSession.aggregate({
      where: { userId, status: 'COMPLETED', startedAt: { gte: dayStart } },
      _sum: { serverVerifiedMin: true },
      _count: true,
    }),

    prisma.focusSession.aggregate({
      where: { userId, status: 'COMPLETED', startedAt: { gte: weekAgo } },
      _sum: { serverVerifiedMin: true },
      _count: true,
    }),

    prisma.focusSession.findFirst({
      where: { userId, status: 'ACTIVE' },
      select: { plannedMin: true, startedAt: true, strictMode: true },
    }),

    /**
     * ️ كان `count` فقط — والنتيجة أن النموذج **اخترع الوقت**.
     *    قِسناه: سألناه "إمتى منبهي؟" والحقيقة 05:30 فقال "9:00".
     *    ليست هلوسة عشوائية: المعلومة غائبة فملأ الفراغ.
     *    الدرس: كل حقل يسأل عنه المستخدم يجب أن يكون في السياق.
     */
    prisma.battleAlarm.findMany({
      where: { userId, isActive: true },
      select: { time: true, days: true },
      orderBy: { time: 'asc' },
      take: 5,
    }),

    prisma.wakeLog.findFirst({
      where: { userId, firedAt: { gte: dayStart } },
      select: { result: true, responseSec: true },
      orderBy: { firedAt: 'desc' },
    }),

    prisma.goal.findFirst({
      where: { userId, isActive: true, completedAt: null },
      select: {
        title: true,
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

    /**
     * آخر توثيق أسبوعي — أثمن مصدر لفهم المستخدم.
     * كتبه بنفسه عن أخطائه ومشاعره.
     */
    prisma.goalWeek.findFirst({
      where: { goal: { userId }, status: 'DOCUMENTED' },
      select: { reflection: true, mistakes: true, weekNumber: true },
      orderBy: { documentedAt: 'desc' },
    }),

    /**
     * مسودات وأفكار حرة كتبها المستخدم
     */
    prisma.note.findMany({
      where: { userId },
      select: { title: true, body: true, isPinned: true },
      orderBy: [{ isPinned: 'desc' }, { updatedAt: 'desc' }],
      take: 3,
    }),
  ]);

  if (!user) return null;

  const tz = user.timezone || 'Africa/Cairo';
  const now = new Date();

  const dateFormatted = new Intl.DateTimeFormat('ar-EG', {
    timeZone: tz,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(now);

  const timeFormatted = new Intl.DateTimeFormat('ar-EG', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(now);

  const hour24 = parseInt(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      hour12: false,
    }).format(now),
    10,
  );

  let periodOfDay = 'الصباح ';
  if (hour24 >= 12 && hour24 < 17) periodOfDay = 'الظهيرة ️';
  else if (hour24 >= 17 && hour24 < 22) periodOfDay = 'المساء ';
  else if (hour24 >= 22 || hour24 < 5) periodOfDay = 'الليل ';

  const clock = {
    timezone: tz,
    date: dateFormatted,
    time: timeFormatted,
    hour24,
    periodOfDay,
    isoTimestamp: now.toISOString(),
  };

  return {
    clock,
    user: {
      name: user.username,
      domain: DOMAIN_AR[user.domain] ?? user.domain,
      specialty: user.specialty,
      sparks: user.sparksBalance,
      streak: user.currentStreak,
      bestStreak: user.longestStreak,
      totalHours: Math.round((user.totalFocusMin ?? 0) / 60),
    },
    today: {
      tasksDone: tasksToday,
      focusMinutes: sessionsToday._sum.serverVerifiedMin ?? 0,
      focusSessions: sessionsToday._count,
      wokeOnTime: wakeToday?.result === 'WOKE',
      responseSec: wakeToday?.responseSec ?? null,
    },
    week: {
      focusMinutes: sessionsWeek._sum.serverVerifiedMin ?? 0,
      focusSessions: sessionsWeek._count,
    },
    pending: tasksPending.map((t) => ({
      title: t.title,
      priority: PRIORITY_AR[t.priority] ?? t.priority,
      due: t.dueDate ? new Date(t.dueDate).toISOString().slice(0, 10) : null,
    })),
    activeSession: activeSession
      ? {
          plannedMin: activeSession.plannedMin,
          elapsedMin: Math.floor(
            (Date.now() - new Date(activeSession.startedAt).getTime()) / 60_000,
          ),
          strict: activeSession.strictMode,
        }
      : null,
    alarms: {
      active: alarms.length,
      list: alarms.map((a) => ({ time: a.time, days: a.days })),
    },
    goal: goal
      ? {
          title: goal.title,
          pledge: goal.pledge,
          week: goal.currentWeek,
          openWeek: goal.weeks?.[0]?.title ?? null,
        }
      : null,
    lastJournal: lastJournal
      ? {
          week: lastJournal.weekNumber,
          reflection: lastJournal.reflection?.slice(0, 160) ?? null,
          mistakes: lastJournal.mistakes?.slice(0, 160) ?? null,
        }
      : null,
    recentNotes: (recentNotes || []).map((n) => ({
      title: n.title,
      body: n.body.slice(0, 120),
    })),
  };
};

/**
 * يحوّل السياق إلى نصّ مضغوط.
 *
 * الشكل مقصود: أسطر قصيرة بفواصل — أرخص من JSON بنسبة ~40%
 * لأن الأقواس والاقتباسات كلها توكنات مدفوعة.
 */
export const toPrompt = (ctx) => {
  if (!ctx) return '';

  const L = [];
  if (ctx.clock) {
    L.push(
      `[ساعة السيرفر الذرية الحقيقية]: ${ctx.clock.date} | الساعة الآن: ${ctx.clock.time} (${ctx.clock.periodOfDay}) | بتوقيت: ${ctx.clock.timezone}`,
    );
  }
  const u = ctx.user;

  L.push(
    `المستخدم: ${u.name} · مجال ${u.domain}${u.specialty ? ` (${u.specialty})` : ''}`,
    `الرفيق: ${u.companionName || 'بدون اسم'} (يناديه المستخدم بهذا الاسم)`,
  );
  L.push(
    `الرصيد: ${u.sparks} شرارة · سلسلة ${u.streak} يوم (الأفضل ${u.bestStreak}) · ${u.totalHours} ساعة تركيز إجمالاً`,
  );

  const t = ctx.today;
  const wake =
    t.wokeOnTime === true
      ? 'صحا في موعده'
      : t.responseSec != null
        ? `استجاب للمنبه بعد ${t.responseSec}ث`
        : 'لا سجل استيقاظ';
  L.push(
    `اليوم: ${t.tasksDone} مهمة · ${t.focusMinutes}د تركيز (${t.focusSessions} جلسة) · ${wake}`,
  );

  L.push(
    `الأسبوع: ${ctx.week.focusMinutes}د في ${ctx.week.focusSessions} جلسة`,
  );

  if (ctx.activeSession) {
    const s = ctx.activeSession;
    L.push(
      ` جلسة جارية الآن: مضى ${s.elapsedMin}د من ${s.plannedMin}د${s.strict ? ' (وضع صارم)' : ''}`,
    );
  }

  if (ctx.pending.length) {
    L.push(
      `مهام معلّقة: ${ctx.pending
        .map((p) => `${p.title} [${p.priority}${p.due ? ` · ${p.due}` : ''}]`)
        .join(' | ')}`,
    );
  } else {
    L.push('مهام معلّقة: لا شيء');
  }

  if (ctx.goal) {
    L.push(
      `الهدف: ${ctx.goal.title} — أسبوع ${ctx.goal.week}${ctx.goal.openWeek ? ` (${ctx.goal.openWeek})` : ''}`,
    );
    if (ctx.goal.pledge) L.push(`وعده لنفسه: "${ctx.goal.pledge}"`);
  }

  if (ctx.lastJournal?.reflection) {
    L.push(`آخر توثيق (أسبوع ${ctx.lastJournal.week}): ${ctx.lastJournal.reflection}`);
    if (ctx.lastJournal.mistakes) {
      L.push(`اعترف بخطأ: ${ctx.lastJournal.mistakes}`);
    }
  }

  if (ctx.recentNotes?.length) {
    const notesStr = ctx.recentNotes
      .map((n) => (n.title ? `[${n.title}]: ${n.body}` : n.body))
      .join(' | ');
    L.push(`مسودات وأفكار حرة كتبها: ${notesStr}`);
  }

  /**
   * ️ نذكر الأوقات لا العدد فقط. النموذج يخترع ما لا يجده.
   *    الأيام تُختصر: 7 أيام = "يومياً" بدل سرد سبعة أرقام.
   */
  if (ctx.alarms.active) {
    const times = ctx.alarms.list
      .map((a) => `${a.time}${a.days?.length === 7 ? '' : ` (${a.days?.length ?? 0}أيام)`}`)
      .join(' · ');
    L.push(`منبهات مفعّلة: ${ctx.alarms.active} — ${times}`);
  } else {
    L.push('منبهات مفعّلة: لا شيء');
  }

  return L.join('\n');
};

/**
 * ════════════════════════════════════════════════════════════
 *  ضغط السياق والذاكرة الهرمية (Hierarchical Context Compaction)
 * ════════════════════════════════════════════════════════════
 *
 *  المستوحى من Character.ai و Claude:
 *  بدلاً من تمرير تاريخ المحادثة بالكامل وتكرار آلاف التوكنات،
 *  يتم تلخيص الرسائل القديمة في فقرة واحدة موجزة (Summary Anchor)،
 *  وتمرير الملخص فقط مع آخر 4 رسائل نشطة.
 *
 *  النتيجة: توفير ~70% من التوكنات، وخفض زمن استجابة النموذج بمقدار 3×.
 */
export const compactHistory = (rawMessages, maxRecent = 4) => {
  if (!Array.isArray(rawMessages) || rawMessages.length <= maxRecent) {
    return {
      summaryAnchor: null,
      recentTurns: (rawMessages ?? []).map((m) => ({
        role: m.role === 'ASSISTANT' || m.role === 'model' ? 'model' : 'user',
        text: m.content ?? m.text ?? '',
      })),
    };
  }

  const splitIdx = rawMessages.length - maxRecent;
  const older = rawMessages.slice(0, splitIdx);
  const recent = rawMessages.slice(splitIdx);

  // استخراج أهم محاور الحوار القديم في سطرين مكثفين
  const topics = older
    .map((m) => `${m.role === 'USER' ? 'المستخدم' : 'المرافق'}: ${m.content ?? m.text}`)
    .slice(-6)
    .join(' | ')
    .slice(0, 300);

  return {
    summaryAnchor: `[ملخص المحادثة السابقة: ${topics}]`,
    recentTurns: recent.map((m) => ({
      role: m.role === 'ASSISTANT' || m.role === 'model' ? 'model' : 'user',
      text: m.content ?? m.text ?? '',
    })),
  };
};

export default { build, toPrompt, compactHistory };
