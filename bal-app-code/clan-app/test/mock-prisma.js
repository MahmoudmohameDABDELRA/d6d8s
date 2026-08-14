// عميل Prisma وهمي في الذاكرة — لاختبار المنطق بدون قاعدة بيانات حقيقية
import crypto from 'node:crypto';

const INITIAL_ACHIEVEMENTS = [
  { code: 'FOCUS_BRONZE', category: 'FOCUS', tier: 'BRONZE', title: 'بداية الشغف', description: 'أكمل أول 10 ساعات تركيز', targetValue: 600, icon: '⚡', bonusSparks: 100 },
  { code: 'FOCUS_SILVER', category: 'FOCUS', tier: 'SILVER', title: 'العقل العميق', description: 'أكمل 50 ساعة تركيز', targetValue: 3000, icon: '🧠', bonusSparks: 100 },
  { code: 'FOCUS_GOLD', category: 'FOCUS', tier: 'GOLD', title: 'أسطورة الانضباط', description: 'أكمل 200 ساعة تركيز عميق', targetValue: 12000, icon: '🏆', bonusSparks: 100 },
  { code: 'STREAK_BRONZE', category: 'STREAK', tier: 'BRONZE', title: 'شرارة الأسبوع', description: 'التزم 7 أيام متتالية', targetValue: 7, icon: '🔥', bonusSparks: 100 },
  { code: 'STREAK_SILVER', category: 'STREAK', tier: 'SILVER', title: 'محارب الشهر', description: 'التزم 30 يوماً متتالياً', targetValue: 30, icon: '⚔️', bonusSparks: 100 },
  { code: 'STREAK_GOLD', category: 'STREAK', tier: 'GOLD', title: 'لا يُقهر', description: 'التزم 100 يوم بلا انقطاع', targetValue: 100, icon: '👑', bonusSparks: 100 },
  { code: 'TRIBE_BRONZE', category: 'TRIBE', tier: 'BRONZE', title: 'الصديق الداعم', description: 'أرسل 50 تشجيعاً لأعضاء عشيرتك', targetValue: 50, icon: '🤝', bonusSparks: 100 },
  { code: 'TRIBE_SILVER', category: 'TRIBE', tier: 'SILVER', title: 'بطل الجلسة', description: 'شارك في 10 جلسات نبض جماعية', targetValue: 10, icon: '🛡️', bonusSparks: 100 },
  { code: 'TRIBE_GOLD', category: 'TRIBE', tier: 'GOLD', title: 'قائد الكتيبة', description: 'احضر 50 جلسة نبض جماعية كاملة', targetValue: 50, icon: '🎖️', bonusSparks: 100 },
  { code: 'REFLECTION_BRONZE', category: 'REFLECTION', tier: 'BRONZE', title: 'صريح مع نفسه', description: 'اكتب 10 مذكرات يومية', targetValue: 10, icon: '📝', bonusSparks: 100 },
  { code: 'REFLECTION_SILVER', category: 'REFLECTION', tier: 'SILVER', title: 'صفاء الذهن', description: 'اكتب 50 مذكرة وتفريغاً يومياً', targetValue: 50, icon: '🌙', bonusSparks: 100 },
  { code: 'REFLECTION_GOLD', category: 'REFLECTION', tier: 'GOLD', title: 'الحكيم', description: 'التزم بالمراجعة اليومية 90 يوماً', targetValue: 90, icon: '📜', bonusSparks: 100 },
  { code: 'EARLY_BIRD_BRONZE', category: 'EARLY_BIRD', tier: 'BRONZE', title: 'أول الفجر', description: 'استيقظ في موعدك 7 أيام متتالية', targetValue: 7, icon: '🌅', bonusSparks: 100 },
  { code: 'EARLY_BIRD_SILVER', category: 'EARLY_BIRD', tier: 'SILVER', title: 'سيّد الصباح', description: 'استيقظ في موعدك 30 يوماً متتالياً', targetValue: 30, icon: '☀️', bonusSparks: 100 },
  { code: 'EARLY_BIRD_GOLD', category: 'EARLY_BIRD', tier: 'GOLD', title: 'لا ينام عن هدفه', description: 'استيقظ في موعدك 100 يوم متتالٍ', targetValue: 100, icon: '🔆', bonusSparks: 100 },
].map((a) => ({ id: crypto.randomUUID(), ...a }));

const INITIAL_TITLES = [
  {
    code: 'SOLAR_TITAN',
    title: 'وحش اليوم الكامل 🐉',
    subtitle: 'إتقان الـ 10 ساعات والتركيز الفوري بعد الفجر',
    description: 'يُمنح لمن يكسر حاجز الـ 10 ساعات تركيز في يوم واحد مع بدء التركيز فور الاستيقاظ وإنجاز مهمة حرجة بصفر إخفاق.',
    tier: 'MYTHIC',
    auraEffect: 'CRIMSON_SOLAR_FLAME',
    glowColor: '#FF1744',
    soundFx: 'MYTHIC_DRAGON_ROAR',
    bannerTemplate: '🔥 تنبيه شرفي: تم تسجيل دخول حامل لقب [وحش اليوم الكامل 🐉] {username} إلى الغرفة!',
    badgeIcon: '🐉',
    bonusSparks: 500,
    requirements: { focusMinutesDaily: 600 },
  },
  {
    code: 'IRON_JUGGERNAUT',
    title: 'المحارب الفولاذي ⚡',
    subtitle: 'صمود الـ 5 ساعات يومياً لـ 30 يوماً متتالية وتوثيق الهدف الكامل',
    description: 'يُمنح للحديد الذي لا يلين: 5 ساعات تركيز يومياً لمدة شهر متواصل دون دروع مع إنهاء هدف توثيقي كامل.',
    tier: 'MYTHIC',
    auraEffect: 'IRON_LIGHTNING_STORM',
    glowColor: '#00E5FF',
    soundFx: 'MYTHIC_WAR_HORN',
    bannerTemplate: '⚡ انتبهوا جميعاً: دخل الكتيبة [المحارب الفولاذي ⚡] {username} — سيد الانضباط الشهري!',
    badgeIcon: '⚡',
    bonusSparks: 1000,
    requirements: { dailyFocusMin: 300, consecutiveDays: 30 },
  },
  {
    code: 'CONQUEROR_SOVEREIGN',
    title: 'الفاتح الأسطوري 👑',
    subtitle: 'قاهر تحديات العشيرة وسيد النبض الجماعي والأعلى 1%',
    description: 'يُمنح لقمة الهرم الإنتاجي: الفوز في 5 تحديات عشائرية بنسبة 100% وحضور 20 نبضاً وبلوغ أعلى 1% في المنصة.',
    tier: 'MYTHIC',
    auraEffect: 'GOLDEN_CONQUEROR_CROWN',
    glowColor: '#FFD700',
    soundFx: 'MYTHIC_ROYAL_FANFARE',
    bannerTemplate: '👑 تحية إجلال: تم تسجيل دخول [الفاتح الأسطوري 👑] {username} — قاهر التحديات وأعلى 1%!',
    badgeIcon: '👑',
    bonusSparks: 1500,
    requirements: { clanChallengesWon: 5 },
  },
].map((t) => ({ id: crypto.randomUUID(), ...t }));

const rawDb = {
  achievement: [...INITIAL_ACHIEVEMENTS],
  title: [...INITIAL_TITLES],
};

const db = new Proxy(rawDb, {
  get(target, prop) {
    if (typeof prop === 'string' && !(prop in target)) {
      target[prop] = [];
    }
    return target[prop];
  },
});

let seqTime = Date.now();
const nextDate = () => new Date(seqTime++);

export const _db = db;
export const _reset = () => {
  Object.keys(rawDb).forEach((k) => (rawDb[k] = k === 'achievement' ? [...INITIAL_ACHIEVEMENTS] : k === 'title' ? [...INITIAL_TITLES] : []));
};

const uuid = () => crypto.randomUUID();

class P2002 extends Error {
  constructor(target) { super('Unique constraint failed'); this.code = 'P2002'; this.meta = { target }; this.name = 'PrismaClientKnownRequestError'; }
}

const matches = (row, where = {}) => {
  for (const [k, v] of Object.entries(where)) {
    if (k === 'OR') { if (!v.some((c) => matches(row, c))) return false; continue; }
    if (k === 'AND') { if (!v.every((c) => matches(row, c))) return false; continue; }
    if (k === 'NOT') { if (matches(row, v)) return false; continue; }
    if (v instanceof Date && row[k] instanceof Date) {
      if (row[k].getTime() !== v.getTime()) return false;
      continue;
    }
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      if ('lt' in v) {
        const val = row[k] instanceof Date ? row[k].getTime() : row[k];
        const target = v.lt instanceof Date ? v.lt.getTime() : v.lt;
        if (!(val < target)) return false;
      }
      if ('gt' in v) {
        const val = row[k] instanceof Date ? row[k].getTime() : row[k];
        const target = v.gt instanceof Date ? v.gt.getTime() : v.gt;
        if (!(val > target)) return false;
      }
      if ('lte' in v) {
        const val = row[k] instanceof Date ? row[k].getTime() : row[k];
        const target = v.lte instanceof Date ? v.lte.getTime() : v.lte;
        if (!(val <= target)) return false;
      }
      if ('gte' in v) {
        const val = row[k] instanceof Date ? row[k].getTime() : row[k];
        const target = v.gte instanceof Date ? v.gte.getTime() : v.gte;
        if (!(val >= target)) return false;
      }
      if ('equals' in v && row[k] !== v.equals) return false;
      if ('not' in v && row[k] === v.not) return false;
      if ('in' in v && !v.in.includes(row[k])) return false;
      if ('notIn' in v && v.notIn.includes(row[k])) return false;
      if (k === 'participants' && v.some && row.id) {
        const parts = (db.conversationParticipant || []).filter((p) => p.conversationId === row.id);
        const needed = v.some.userId;
        if (needed && !parts.some((p) => p.userId === needed)) return false;
        continue;
      }
      if (k === 'conversation' && row.conversationId) {
        const c = (db.conversation || []).find((x) => x.id === row.conversationId);
        if (!c || (v.type && c.type !== v.type)) return false;
      }
      if (k === 'clan' && row.clanId) {
        const clan = (db.clan || []).find((c) => c.id === row.clanId);
        if (!clan) return false;
        if (v.type && clan.type !== v.type) return false;
        if (v.members?.some?.userId) {
          const isMember = (db.clanMember || []).some((m) => m.clanId === clan.id && m.userId === v.members.some.userId);
          if (!isMember) return false;
        }
      }
      if (k === 'goal') {
        const g = (db.goal || []).find((x) => x.id === row.goalId);
        if (!g || (v.userId && g.userId !== v.userId)) return false;
      }
      if (k === 'achievement') {
        const ach = (db.achievement || []).find((a) => a.id === row.achievementId);
        if (!ach) return false;
        if (v.code?.in && !v.code.in.includes(ach.code)) return false;
      }
      continue;
    }
    if (row[k] !== v) return false;
  }
  return true;
};

const flatten = (where = {}) => {
  const out = {};
  for (const [k, v] of Object.entries(where)) {
    if (v && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v)) Object.assign(out, v);
    else out[k] = v;
  }
  return out;
};

const model = (name, uniques = []) => ({
  findUnique: async ({ where = {}, select, include } = {}) => {
    const w = flatten(where);
    const row = db[name].find((r) => matches(r, w));
    return row ? decorate(name, row, { select, include }) : null;
  },
  findFirst: async ({ where = {}, select, include, orderBy } = {}) => {
    let rows = db[name].filter((r) => matches(r, where));
    if (orderBy) {
      const rules = Array.isArray(orderBy) ? orderBy : [orderBy];
      rows = [...rows].sort((a, b) => {
        for (const rule of rules) {
          const [key, dir] = Object.entries(rule)[0];
          let av = a[key], bv = b[key];
          if (av instanceof Date) av = av.getTime();
          if (bv instanceof Date) bv = bv.getTime();
          if (av !== bv) return dir === 'desc' ? (bv > av ? 1 : -1) : (av > bv ? 1 : -1);
        }
        return 0;
      });
    }
    const row = rows[0] || null;
    return row ? decorate(name, row, { select, include }) : null;
  },
  findMany: async ({ where = {}, select, include, orderBy, skip = 0, take } = {}) => {
    let rows = db[name].filter((r) => matches(r, where));
    if (orderBy) {
      const rules = Array.isArray(orderBy) ? orderBy : [orderBy];
      rows = [...rows].sort((a, b) => {
        for (const rule of rules) {
          const [key, dir] = Object.entries(rule)[0];
          let av = a[key], bv = b[key];
          if (typeof dir === 'object') { const [k2, d2] = Object.entries(dir)[0];
            let ra = {}, rb = {};
            if (key === 'conversation') {
              ra = (db.conversation || []).find((c) => c.id === a.conversationId) || {};
              rb = (db.conversation || []).find((c) => c.id === b.conversationId) || {};
            } else {
              ra = db.user.find((u) => u.id === a.userId) || {};
              rb = db.user.find((u) => u.id === b.userId) || {};
            }
            av = ra[k2]; bv = rb[k2];
            if (av !== bv) return d2 === 'desc' ? (bv > av ? 1 : -1) : (av > bv ? 1 : -1);
            continue;
          }
          if (av !== bv) return dir === 'desc' ? (bv > av ? 1 : -1) : (av > bv ? 1 : -1);
        }
        return 0;
      });
    }
    rows = rows.slice(skip, take ? skip + take : undefined);
    return rows.map((r) => decorate(name, r, { select, include }));
  },
  groupBy: async ({ by, where = {} } = {}) => {
    const rows = db[name].filter((r) => matches(r, where));
    const groups = {};
    for (const r of rows) {
      const key = by.map((k) => r[k]).join('__');
      if (!groups[key]) {
        const g = {};
        by.forEach((k) => (g[k] = r[k]));
        g._count = 0;
        groups[key] = g;
      }
      groups[key]._count += 1;
    }
    return Object.values(groups);
  },
  count: async ({ where = {} } = {}) => db[name].filter((r) => matches(r, where)).length,
  create: async ({ data, select, include }) => {
    for (const u of uniques) {
      const key = Array.isArray(u) ? u : [u];
      if (db[name].some((r) => key.every((k) => data[k] !== undefined && r[k] === data[k]))) throw new P2002(key);
    }
    const cleanData = { ...data };
    const nestedSteps = data.steps?.create;
    const nestedWeeks = data.weeks?.create;
    const nestedParticipants = data.participants?.create;
    delete cleanData.steps;
    delete cleanData.weeks;
    delete cleanData.participants;

    const row = {
      id: uuid(),
      createdAt: nextDate(),
      updatedAt: new Date(),
      joinedAt: new Date(),
      startedAt: new Date(),
      completedAt: null,
      isActive: true,
      draft: false,
      status: 'ACTIVE',
      result: 'PENDING',
      isCompleted: false,
      earnedSparks: 0,
      serverVerifiedMin: 0,
      role: 'MEMBER',
      maxMembers: 50,
      unlockedAudioSlots: 1,
      bonusAiMessages: 0,
      sparksBalance: 0,
      totalSparksEarned: 0,
      sparksCount: 0,
      totalFocusMin: 0,
      progressMinutes: 0,
      wakeStreak: 0,
      longestWakeStreak: 0,
      successDays: 0,
      missedDays: 0,
      isEliminated: false,
      rewarded: false,
      violations: 0,
      failed: false,
      isRead: false,
      isDeleted: false,
      pushSent: false,
      isBanned: false,
      lastMessageAt: null,
      syncedAt: new Date(),
      tokensUsed: 0,
      isVerified: false,
      revokedAt: null,
      showcaseIds: [],
      privacyLevel: 'REQUESTS_ONLY',
      companionName: null,
      ...cleanData,
    };
    db[name].push(row);

    if (name === 'task' && Array.isArray(nestedSteps)) {
      if (!db.taskStep) db.taskStep = [];
      nestedSteps.forEach((s, idx) => {
        db.taskStep.push({
          id: uuid(),
          taskId: row.id,
          title: typeof s === 'string' ? s : s.title,
          orderIndex: s.orderIndex ?? idx,
          isCompleted: false,
          createdAt: nextDate(),
        });
      });
    }

    if (name === 'goal' && nestedWeeks) {
      if (!db.goalWeek) db.goalWeek = [];
      const wList = Array.isArray(nestedWeeks) ? nestedWeeks : [nestedWeeks];
      wList.forEach((w) => {
        db.goalWeek.push({
          id: uuid(),
          goalId: row.id,
          userId: row.userId,
          status: 'PENDING',
          isDocumented: false,
          isSkipped: false,
          createdAt: nextDate(),
          ...w,
        });
      });
    }

    if (name === 'message') {
      const conv = (db.conversation || []).find((c) => c.id === row.conversationId);
      if (conv) conv.lastMessageAt = row.createdAt;
    }
    if (name === 'conversation' && nestedParticipants) {
      if (!db.conversationParticipant) db.conversationParticipant = [];
      const pList = Array.isArray(nestedParticipants) ? nestedParticipants : [nestedParticipants];
      pList.forEach((p) => {
        db.conversationParticipant.push({
          id: uuid(),
          conversationId: row.id,
          userId: p.userId,
          lastReadAt: new Date(),
          isMuted: false,
          joinedAt: nextDate(),
        });
      });
    }

    return decorate(name, row, { select, include });
  },
  createMany: async ({ data }) => {
    const arr = Array.isArray(data) ? data : [data];
    arr.forEach((item) => {
      db[name].push({
        id: uuid(),
        createdAt: nextDate(),
        updatedAt: new Date(),
        isCompleted: false,
        ...item,
      });
    });
    return { count: arr.length };
  },
  delete: async ({ where }) => {
    const w = flatten(where);
    const i = db[name].findIndex((r) => matches(r, w));
    if (i === -1) { const e = new Error('Record not found'); e.code = 'P2025'; throw e; }
    const deleted = db[name].splice(i, 1)[0];
    if (name === 'conversation') {
      db.message = (db.message || []).filter((m) => m.conversationId !== deleted.id);
      db.conversationParticipant = (db.conversationParticipant || []).filter((p) => p.conversationId !== deleted.id);
    }
    if (name === 'clan') {
      const list = db['clanMember'];
      for (let j = list.length - 1; j >= 0; j--) {
        if (list[j].clanId === deleted.id) list.splice(j, 1);
      }
    }
    if (name === 'task') {
      const list = rawDb['focusSession'];
      if (Array.isArray(list)) {
        for (const item of list) {
          if (item && item.taskId === deleted.id) item.taskId = null;
        }
      }
    }
    return deleted;
  },
  update: async ({ where, data }) => {
    const w = flatten(where);
    const row = db[name].find((r) => matches(r, w));
    if (!row) { const e = new Error('Record not found'); e.code = 'P2025'; throw e; }
    for (const [k, v] of Object.entries(data)) {
      if (v && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v)) {
        if ('increment' in v) row[k] = (Number(row[k]) || 0) + Number(v.increment);
        else if ('decrement' in v) row[k] = (Number(row[k]) || 0) - Number(v.decrement);
        else Object.assign(row, { [k]: v });
      } else {
        row[k] = v;
      }
    }
    row.updatedAt = new Date();
    return { ...row };
  },
  updateMany: async ({ where, data }) => {
    const rows = db[name].filter((r) => matches(r, where));
    rows.forEach((row) => {
      for (const [k, v] of Object.entries(data)) {
        if (v && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v)) {
          if ('increment' in v) row[k] = (Number(row[k]) || 0) + Number(v.increment);
          else if ('decrement' in v) row[k] = (Number(row[k]) || 0) - Number(v.decrement);
        } else {
          row[k] = v;
        }
      }
      row.updatedAt = new Date();
    });
    return { count: rows.length };
  },
  aggregate: async ({ where = {}, _sum = {}, _count = {} } = {}) => {
    const rows = db[name].filter((r) => matches(r, where));
    const sumRes = {};
    for (const k of Object.keys(_sum)) {
      sumRes[k] = rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
    }
    return { _sum: sumRes, _count: rows.length };
  },
  upsert: async ({ where, create, update }) => {
    const w = flatten(where);
    const row = db[name].find((r) => matches(r, w));
    if (row) { Object.assign(row, update); return { ...row }; }
    return model(name, uniques).create({ data: create });
  },
  delete: async ({ where }) => {
    const w = flatten(where);
    const i = db[name].findIndex((r) => matches(r, w));
    if (i === -1) { const e = new Error('Record not found'); e.code = 'P2025'; throw e; }
    const deleted = db[name].splice(i, 1)[0];
    if (name === 'conversation') {
      db.message = (db.message || []).filter((m) => m.conversationId !== deleted.id);
      db.conversationParticipant = (db.conversationParticipant || []).filter((p) => p.conversationId !== deleted.id);
    }
    return deleted;
  },
  deleteMany: async ({ where = {} } = {}) => {
    const before = db[name].length;
    db[name] = db[name].filter((r) => !matches(r, where));
    return { count: before - db[name].length };
  },
});

function decorate(name, row, { select, include } = {}) {
  let out = { ...row };
  if (name === 'clanMember' && include?.clan) {
    const clan = db.clan.find((c) => c.id === row.clanId);
    out.clan = include.clan?.include?._count
      ? { ...clan, _count: { members: db.clanMember.filter((m) => m.clanId === clan.id).length } }
      : { ...clan };
  }
  if (name === 'clanMember' && (include?.user || select?.user)) {
    const u = db.user.find((x) => x.id === row.userId);
    out.user = u ? { id: u.id, username: u.username, profileImage: u.profileImage ?? null, sparksCount: u.sparksCount, totalFocusMin: u.totalFocusMin } : null;
  }
  if (name === 'conversationParticipant' && (include?.conversation || select?.conversation)) {
    const conv = (db.conversation || []).find((c) => c.id === row.conversationId);
    let convOut = conv ? { ...conv } : null;
    if (conv && include?.conversation?.include?.participants) {
      const parts = (db.conversationParticipant || [])
        .filter((p) => p.conversationId === conv.id)
        .filter((p) => !include?.conversation?.include?.participants?.where?.userId?.not || p.userId !== row.userId);
      convOut.participants = parts.map((p) => {
        const u = (db.user || []).find((x) => x.id === p.userId);
        return {
          ...p,
          user: u ? { id: u.id, username: u.username, profileImage: u.profileImage ?? null, domain: u.domain, specialty: u.specialty } : null,
        };
      });
    }
    out.conversation = convOut;
  }
  if (name === 'conversation' && (include?.participants || select?.participants)) {
    out.participants = (db.conversationParticipant || []).filter((p) => p.conversationId === row.id);
  }
  if (name === 'referral' && (include?.referred || select?.referred)) {
    const u = (db.user || []).find((x) => x.id === row.referredUserId);
    out.referred = u ? { id: u.id, username: u.username, profileImage: u.profileImage ?? null, domain: u.domain, createdAt: u.createdAt } : null;
  }
  if (name === 'audioPurchase' && (include?.track || select?.track)) {
    out.track = (db.audioTrack || []).find((t) => t.id === row.trackId) || null;
  }
  if (name === 'videoPurchase' && (include?.video || select?.video)) {
    out.video = (db.video || []).find((v) => v.id === row.videoId) || null;
  }
  if (name === 'goal' && (include?.weeks || select?.weeks)) {
    out.weeks = (db.goalWeek || []).filter((w) => w.goalId === row.id);
  }
  if (name === 'aiConversation' && (include?.messages || select?.messages)) {
    out.messages = (db.aiMessage || []).filter((m) => m.conversationId === row.id).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  }
  if (name === 'message' && (include?.conversation || select?.conversation)) {
    out.conversation = (db.conversation || []).find((c) => c.id === row.conversationId) || null;
  }
  if (name === 'userTitle' && (include?.title || select?.title)) {
    out.title = (db.title || []).find((t) => t.id === row.titleId) || null;
  }
  if (name === 'title' && (include?.usersHolding || select?.usersHolding)) {
    const holdings = (db.userTitle || []).filter((ut) => ut.titleId === row.id && (!include?.usersHolding?.where?.isUnlocked || ut.isUnlocked));
    out.usersHolding = holdings.map((h) => {
      const u = (db.user || []).find((x) => x.id === h.userId);
      return {
        ...h,
        user: u ? { id: u.id, username: u.username, profileImage: u.profileImage ?? null, domain: u.domain, totalFocusMin: u.totalFocusMin, currentStreak: u.currentStreak } : null,
      };
    });
  }
  if (name === 'user' && (include?.equippedTitle || select?.equippedTitle)) {
    out.equippedTitle = (db.title || []).find((t) => t.id === row.equippedTitleId) || null;
  }
  if (name === 'user' && (include?._count || select?._count)) {
    out._count = {
      focusSessions: (db.focusSession || []).filter((s) => s.userId === row.id).length,
      tasks: (db.task || []).filter((t) => t.userId === row.id).length,
      journalEntries: (db.journalEntry || []).filter((j) => j.userId === row.id).length,
      goals: (db.goal || []).filter((g) => g.userId === row.id).length,
      sparkTx: (db.sparkTransaction || []).filter((tx) => tx.userId === row.id).length,
      achievements: (db.userAchievement || []).filter((a) => a.userId === row.id && a.isUnlocked).length,
      titles: (db.userTitle || []).filter((t) => t.userId === row.id && t.isUnlocked).length,
      followers: (db.follow || []).filter((f) => f.followingId === row.id && f.status === 'ACCEPTED').length,
      following: (db.follow || []).filter((f) => f.followerId === row.id && f.status === 'ACCEPTED').length,
      reportsReceived: (db.userReport || []).filter((r) => r.reportedId === row.id).length,
      devices: (db.device || []).filter((d) => d.userId === row.id).length,
    };
  }
  if (name === 'follow' && (include?.follower || select?.follower)) {
    const u = (db.user || []).find((x) => x.id === row.followerId);
    out.follower = u ? { id: u.id, username: u.username, profileImage: u.profileImage ?? null, domain: u.domain, specialty: u.specialty, customStatus: u.customStatus, statusEmoji: u.statusEmoji, createdAt: u.createdAt } : null;
  }
  if (name === 'follow' && (include?.following || select?.following)) {
    const u = (db.user || []).find((x) => x.id === row.followingId);
    out.following = u ? { id: u.id, username: u.username, profileImage: u.profileImage ?? null, domain: u.domain, specialty: u.specialty, customStatus: u.customStatus, statusEmoji: u.statusEmoji, createdAt: u.createdAt } : null;
  }
  if (name === 'userReport' && (include?.reporter || select?.reporter)) {
    const u = (db.user || []).find((x) => x.id === row.reporterId);
    out.reporter = u ? { id: u.id, username: u.username, email: u.email } : null;
  }
  if (name === 'userReport' && (include?.reported || select?.reported)) {
    const u = (db.user || []).find((x) => x.id === row.reportedId);
    out.reported = u ? { id: u.id, username: u.username, email: u.email, isBanned: u.isBanned } : null;
  }
  if (name === 'clanBan' && (include?.user || select?.user)) {
    const u = db.user.find((x) => x.id === row.userId);
    out.user = u ? { id: u.id, username: u.username, profileImage: u.profileImage ?? null } : null;
  }
  if (name === 'focusCheck') {
    out.result = row.result ?? row.status ?? 'PENDING';
  }
  if (name === 'wakeChallenge' && include?.participants) {
    const parts = (db.wakeChallengeParticipant || []).filter((p) => p.challengeId === row.id);
    out.participants = parts.map((p) => {
      const u = (db.user || []).find((x) => x.id === p.userId);
      return {
        ...p,
        user: u ? { id: u.id, username: u.username, profileImage: u.profileImage ?? null, domain: u.domain } : null,
      };
    });
  }
  if (name === 'wakeChallengeParticipant' && (include?.challenge || select?.challenge)) {
    out.challenge = (db.wakeChallenge || []).find((c) => c.id === row.challengeId) || null;
  }
  if (name === 'goal' && include?.weeks) {
    out.weeks = (db.goalWeek || []).filter((w) => w.goalId === row.id).sort((a, b) => a.weekNumber - b.weekNumber);
  }
  if (name === 'goalWeek' && include?.goal) {
    out.goal = (db.goal || []).find((g) => g.id === row.goalId) || null;
  }
  if (name === 'task' && (include?.steps || select?.steps)) {
    out.steps = (db.taskStep || []).filter((s) => s.taskId === row.id).sort((a, b) => a.orderIndex - b.orderIndex);
  }
  if (name === 'task' && include?.focusSessions) {
    out.focusSessions = (db.focusSession || []).filter((s) => s.taskId === row.id && (!include.focusSessions.where || matches(s, include.focusSessions.where)));
  }
  if (name === 'task' && include?._count?.select?.focusSessions) {
    out._count = { focusSessions: (db.focusSession || []).filter((s) => s.taskId === row.id).length };
  }
  if (name === 'task' && (include?.history || select?.history)) {
    out.history = (db.taskHistory || []).filter((h) => h.taskId === row.id);
  }
  if (name === 'focusSession' && (include?.task || select?.task)) {
    out.task = (db.task || []).find((t) => t.id === row.taskId) || null;
  }
  if (name === 'dailyInsightLog' && (include?.insight || select?.insight)) {
    out.insight = (db.dailyInsightItem || []).find((i) => i.id === row.insightId) || null;
  }
  if (name === 'userAchievement') {
    const ach = (db.achievement || []).find((a) => a.id === row.achievementId);
    out.achievement = ach ? { code: ach.code, title: ach.title, icon: ach.icon, category: ach.category, tier: ach.tier } : null;
  }
  if (name === 'clanInvite' && include?.clan) {
    const clan = db.clan.find((c) => c.id === row.clanId);
    out.clan = clan ? { id: clan.id, maxMembers: clan.maxMembers } : null;
  }
  if (select) {
    const picked = {};
    for (const k of Object.keys(select)) if (select[k]) picked[k] = out[k];
    return picked;
  }
  return out;
}

const basePrisma = {
  user: model('user', ['email', 'username', 'googleId', 'referralCode']),
  referral: model('referral', ['referredUserId']),
  dailyInsightLog: model('dailyInsightLog', [['userId', 'date']]),
  dailyInsightItem: model('dailyInsightItem', []),
  dailyMoodLog: model('dailyMoodLog', [['userId', 'date']]),
  refreshToken: model('refreshToken', ['token']),
  clan: model('clan', ['inviteCode']),
  clanMember: model('clanMember', [['userId', 'clanId']]),
  clanInvite: model('clanInvite', ['inviteCode']),
  aiPulseEvent: model('aiPulseEvent', [['userId', 'subjectKey']]),
  $queryRaw: async () => [{ ok: 1 }],
  $queryRawUnsafe: async () => [{ 'QUERY PLAN': 'Index Scan using message_conversationId_createdAt_idx' }],
  $transaction: async (fn) => (typeof fn === 'function' ? fn(prisma) : Promise.all(fn)),
  $disconnect: async () => {},
  $extends: (ext) => {
    if (ext?.query?.$allModels?.findMany) {
      const origFindMany = model;
      // wrap findMany with extension
      const extFindMany = ext.query.$allModels.findMany;
      return new Proxy(basePrisma, {
        get(t, prop) {
          const m = prisma[prop];
          if (m && typeof m === 'object') {
            return {
              ...m,
              findMany: (args) => extFindMany({ model: prop, args: args || {}, query: (a) => m.findMany(a) }),
            };
          }
          return prisma[prop];
        },
      });
    }
    return prisma;
  },
};

const prisma = new Proxy(basePrisma, {
  get(target, prop) {
    if (prop in target) return target[prop];
    if (typeof prop === 'string' && !prop.startsWith('$') && prop !== 'then') {
      if (!db[prop]) db[prop] = [];
      target[prop] = model(prop);
      return target[prop];
    }
    return target[prop];
  },
});

prisma.__isMock = true;
export default prisma;
