/**
 * بدائل وهمية لاختبار مسار الرد داخل البوب-أب.
 *
 * بتتحقن عبر `module.register` في checkin-reply.setup.mjs — بديل
 * حديث للـ loader القديم، وبيخلي الاختبار يشتغل بلا Postgres ولا
 * Redis ولا نداءات Gemini مدفوعة.
 */

export const state = {
  geminiCalls: 0,
  geminiReply: 'رد افتراضي من الرفيق',
  geminiError: null,
  lastGeminiArgs: null,
  updatedNotifications: [],
  createdNotifications: [],

  reset() {
    this.geminiCalls = 0;
    this.geminiReply = 'رد افتراضي من الرفيق';
    this.geminiError = null;
    this.lastGeminiArgs = null;
    this.updatedNotifications = [];
    this.createdNotifications = [];
    /**
     * ️ عزل الاختبارات: أي إشعار اتخلق أثناء اختبار لازم يختفي قبل
     *    اللي بعده. من غير ده اختبار «فتح خيط جديد» بيسيب إشعار
     *    فيفشل الاختبار اللي بعده لما يلاقيه موجود.
     */
    for (const id of Object.keys(NOTIFICATIONS)) {
      if (!BASE_NOTIFICATION_IDS.includes(id)) delete NOTIFICATIONS[id];
    }
  },
};

// ════════════════════════════════════════════════
//  بيانات وهمية
// ════════════════════════════════════════════════

const NOTIFICATIONS = {
  'notif-checkin': {
    id: 'notif-checkin',
    userId: 'user-1',
    type: 'TASK_CHECKIN',
    title: 'رفيقك بيسأل عنك',
    body: 'إيه أخبار «مذاكرة Dart»؟ عملت فيها إيه؟',
    data: { taskId: 'task-1', canReply: true, kind: 'checkin', source: 'AI' },
    isRead: false,
    createdAt: new Date('2026-08-14T18:00:00.000Z'),
  },
  'notif-plain': {
    id: 'notif-plain',
    userId: 'user-1',
    type: 'ACHIEVEMENT_UNLOCKED',
    title: 'إنجاز جديد',
    body: 'فتحت لقب جديد',
    data: { kind: 'achievement' },
    isRead: false,
    createdAt: new Date('2026-08-14T10:00:00.000Z'),
  },
  'notif-of-someone-else': {
    id: 'notif-of-someone-else',
    userId: 'user-999',
    type: 'TASK_CHECKIN',
    title: 'إشعار حد تاني',
    body: 'مش المفروض توصله',
    data: { taskId: 'task-9', canReply: true },
    isRead: false,
    createdAt: new Date(),
  },
};

/** الإشعارات الأساسية — أي حاجة غيرها بتتمسح عند reset() */
const BASE_NOTIFICATION_IDS = Object.keys(NOTIFICATIONS);

const TASKS = {
  /** مهمة الفطار — مالهاش إشعار، لاختبار فتح خيط جديد */
  'task-breakfast': {
    id: 'task-breakfast',
    userId: 'user-1',
    title: 'الفطار',
    isCompleted: false,
    startTime: '05:00',
    endTime: '06:00',
    goalStep: null,
  },
  'task-1': {
    id: 'task-1',
    userId: 'user-1',
    title: 'مذاكرة Dart',
    description: 'الفصل الرابع: async/await',
    isCompleted: false,
    priority: 'GROWTH',
    startTime: '15:00',
    endTime: '17:00',
    estimatedMin: 120,
    goalStep: {
      title: 'أساسيات Dart',
      goal: { title: 'أكون مبرمج Flutter محترف' },
    },
  },
};

const USERS = {
  'user-1': { username: 'محمود', companionName: 'بال' },
};

// ════════════════════════════════════════════════
//  Prisma وهمي
// ════════════════════════════════════════════════

export const prismaMock = {
  notification: {
    findFirst: async ({ where }) => {
      // بحث بالمهمة (openTaskCheckIn) — مش بالـ id
      if (!where.id && where.type === 'TASK_CHECKIN') {
        const taskId = where.data?.equals;
        const found = Object.values(NOTIFICATIONS).find(
          (n) => n.userId === where.userId && n.data?.taskId === taskId,
        );
        return found ? { ...found } : null;
      }
      const n = NOTIFICATIONS[where.id];
      if (!n) return null;
      if (where.userId && n.userId !== where.userId) return null;
      return { ...n };
    },
    create: async ({ data }) => {
      const created = {
        id: `notif-new-${state.createdNotifications.length + 1}`,
        createdAt: new Date(),
        ...data,
      };
      state.createdNotifications.push(created);
      NOTIFICATIONS[created.id] = created;
      return created;
    },
    update: async ({ where, data }) => {
      state.updatedNotifications.push({ id: where.id, data });
      return { ...NOTIFICATIONS[where.id], ...data };
    },
  },
  task: {
    findFirst: async ({ where }) => {
      const t = TASKS[where.id];
      if (!t) return null;
      if (where.userId && t.userId !== where.userId) return null;
      return { ...t };
    },
  },
  /** مهمة بلا إشعار — لاختبار فتح خيط جديد */
  __addTask: (t) => { TASKS[t.id] = t; },
  user: {
    findUnique: async ({ where }) => USERS[where.id] ?? null,
  },
};

// ════════════════════════════════════════════════
//  Gemini وهمي
// ════════════════════════════════════════════════

export const generateMock = async (systemInstruction, history, userMessage, opts) => {
  state.geminiCalls += 1;
  state.lastGeminiArgs = {
    system: systemInstruction,
    history,
    userMessage,
    opts,
  };
  if (state.geminiError) throw state.geminiError;
  return {
    text: state.geminiReply,
    tokensIn: 100,
    tokensOut: 30,
    functionCalls: [],
    model: 'mock',
    latencyMs: 5,
  };
};

export const isConfiguredMock = () => true;
