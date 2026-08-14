/**
 * بدائل وهمية لاختبار مسار الحلم — بلا Postgres ولا Gemini.
 */
export const state = {
  geminiText: '',
  geminiError: null,
  lastCall: null,
  createdJourneys: [],
  createdDays: [],
  createdTasks: [],

  reset() {
    this.geminiText = '';
    this.geminiError = null;
    this.lastCall = null;
    this.createdJourneys = [];
    this.createdDays = [];
    this.createdTasks = [];
  },
};

const STEPS = {
  'step-1': {
    id: 'step-1',
    goalId: 'goal-1',
    title: 'إتقان قراءة القوائم المالية',
    isCompleted: false,
    userId: 'user-1',
    goal: { title: 'نفسي أكون CEO', userId: 'user-1' },
    journey: null,
  },
  'step-with-journey': {
    id: 'step-with-journey',
    goalId: 'goal-1',
    title: 'مرحلة ليها رحلة',
    isCompleted: false,
    userId: 'user-1',
    goal: { title: 'نفسي أكون CEO', userId: 'user-1' },
    journey: { id: 'existing-journey' },
  },
};

const USERS = {
  'user-1': {
    id: 'user-1',
    username: 'محمود',
    companionName: 'بال',
    timezone: 'Africa/Cairo',
    interests: ['BUSINESS'],
    specialty: 'MANAGER',
  },
};

let seq = 0;

const tx = {
  journey: {
    create: async ({ data }) => {
      const j = { id: `journey-${++seq}`, status: 'DRAFT', currentDay: 1, ...data };
      state.createdJourneys.push(j);
      return j;
    },
    update: async ({ where, data }) => {
      const j = state.createdJourneys.find((x) => x.id === where.id);
      Object.assign(j, data);
      return j;
    },
  },
  journeyDay: {
    createMany: async ({ data }) => {
      data.forEach((d, i) =>
        state.createdDays.push({ id: `day-${seq}-${i}`, status: 'PENDING', ...d }),
      );
      return { count: data.length };
    },
  },
};

export const prismaMock = {
  goalStep: {
    findFirst: async ({ where }) => {
      const s = STEPS[where.id];
      if (!s) return null;
      if (where.goal?.userId && s.goal.userId !== where.goal.userId) return null;
      if (where.isCompleted === false && s.isCompleted) return null;
      return JSON.parse(JSON.stringify(s));
    },
  },
  user: {
    findUnique: async ({ where }) => USERS[where.id] ?? null,
    findMany: async ({ where }) =>
      Object.values(USERS).filter((u) => where.id.in.includes(u.id)),
  },
  journey: {
    findMany: async ({ where }) => {
      const list = state.createdJourneys.filter(
        (j) => j.status === 'ACTIVE' && (!where.id || j.id === where.id),
      );
      return list.map((j) => ({
        ...j,
        step: { id: 'step-1', goalId: 'goal-1', goal: { userId: 'user-1' } },
        days: state.createdDays
          .filter((d) => d.journeyId === j.id && d.status === 'PENDING')
          .sort((a, b) => a.dayNumber - b.dayNumber),
      }));
    },
  },
  journeyDay: {
    findMany: async ({ where }) =>
      state.createdDays
        .filter((d) => d.journeyId === where.journeyId)
        .sort((a, b) => a.dayNumber - b.dayNumber),
  },
  task: {
    findUnique: async () => null,
    create: async ({ data }) => {
      const t = { id: `task-${state.createdTasks.length + 1}`, ...data };
      state.createdTasks.push(t);
      return t;
    },
  },
  notification: { create: async ({ data }) => ({ id: 'n1', ...data }) },
  $transaction: async (fn) => fn(tx),
};

export const generateMock = async (system, history, userMessage, opts) => {
  state.lastCall = { system, history, userMessage, opts };
  if (state.geminiError) throw state.geminiError;
  return { text: state.geminiText, tokensIn: 1, tokensOut: 1 };
};

export const isConfiguredMock = () => true;
