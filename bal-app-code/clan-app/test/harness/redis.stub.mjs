/**
 * ═══════════════════════════════════════════════════════════
 *  بديل Redis للفحص — بيخزّن فعلاً، مش بيرجّع فاضي
 *
 *  ️ ليه اتعاد كتابته:
 *
 *  النسخة القديمة كانت ناقصة أوامر (`hSet`, `hDel`, `setEx`,
 *  `mGet`, `incrBy`) وكان اللي موجود منها **صوري**: `hGetAll`
 *  كان بيرجّع `{}` دايماً و`sMembers` بيرجّع `[]`.
 *
 *  النتيجة كانت أسوأ من مجرد نقص: أول ما `chat.socket.js`
 *  نده `presence.setTyping` (اللي بينده `redis.hSet`)، السيرفر
 *  كان **بيموت** بـ `TypeError: redis.hSet is not a function`.
 *  فمؤشر «بيكتب…» وإيصالات القراءة مكانش ينفع يتفحصوا خالص —
 *  السيرفر بيقع قبل ما يبعت أي حدث.
 *
 *  دلوقتي التخزين حقيقي (Map جوّه Map للهاشات) عشان الفحص
 *  يقيس السلوك الفعلي مش سلوك مزيّف.
 *
 *  ️ لسه مش Redis حقيقي: مفيش TTL فعلي (بنسجّل الوقت بس مش
 *    بنمسح)، ومفيش تعدد عمليات. كفاية لفحص المنطق.
 * ═══════════════════════════════════════════════════════════
 */

/** مفاتيح عادية: key → value */
const store = new Map();

/** هاشات: key → Map(field → value) */
const hashes = new Map();

/** مجموعات: key → Set */
const sets = new Map();

const subs = new Map();

const hash = (k) => {
  if (!hashes.has(k)) hashes.set(k, new Map());
  return hashes.get(k);
};

const set_ = (k) => {
  if (!sets.has(k)) sets.set(k, new Set());
  return sets.get(k);
};

export const redisClient = {
  isOpen: true,

  async connect() {},
  async quit() {},
  async ping() {
    return 'PONG';
  },

  // ── مفاتيح عادية ──
  async get(k) {
    return store.get(k) ?? null;
  },
  async set(k, v) {
    store.set(k, String(v));
    return 'OK';
  },
  async setEx(k, _seconds, v) {
    store.set(k, String(v));
    return 'OK';
  },
  async mGet(keys) {
    return (keys ?? []).map((k) => store.get(k) ?? null);
  },
  async del(...keys) {
    let n = 0;
    for (const k of keys.flat()) {
      if (store.delete(k)) n += 1;
      hashes.delete(k);
      sets.delete(k);
    }
    return n;
  },
  async incr(k) {
    const next = Number(store.get(k) ?? 0) + 1;
    store.set(k, String(next));
    return next;
  },
  async incrBy(k, by) {
    const next = Number(store.get(k) ?? 0) + Number(by);
    store.set(k, String(next));
    return next;
  },
  async expire() {
    return 1;
  },
  async ttl() {
    return -1;
  },
  async keys(pattern = '*') {
    /** دعم بسيط لـ `prefix:*` — بيكفي للاستخدام في الكود */
    const all = [...store.keys(), ...hashes.keys(), ...sets.keys()];
    if (pattern === '*') return all;
    const re = new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
    return all.filter((k) => re.test(k));
  },
  async dbsize() {
    return store.size + hashes.size + sets.size;
  },
  async info() {
    return 'used_memory_human:1M\r\n';
  },

  // ── هاشات ──
  async hSet(k, field, value) {
    //  الشكلين: hSet(k, field, v) و hSet(k, { a: 1, b: 2 })
    if (typeof field === 'object' && field !== null) {
      for (const [f, v] of Object.entries(field)) hash(k).set(f, String(v));
      return Object.keys(field).length;
    }
    hash(k).set(String(field), String(value));
    return 1;
  },
  async hGet(k, field) {
    return hash(k).get(String(field)) ?? null;
  },
  async hGetAll(k) {
    return Object.fromEntries(hash(k));
  },
  async hDel(k, ...fields) {
    let n = 0;
    for (const f of fields.flat()) {
      if (hash(k).delete(String(f))) n += 1;
    }
    return n;
  },

  // ── مجموعات ──
  async sAdd(k, ...members) {
    let n = 0;
    for (const m of members.flat()) {
      const before = set_(k).size;
      set_(k).add(String(m));
      if (set_(k).size > before) n += 1;
    }
    return n;
  },
  async sRem(k, ...members) {
    let n = 0;
    for (const m of members.flat()) {
      if (set_(k).delete(String(m))) n += 1;
    }
    return n;
  },
  async sMembers(k) {
    return [...set_(k)];
  },

  // ── النشر والاشتراك ──
  async publish(ch, msg) {
    (subs.get(ch) ?? []).forEach((f) => f(msg));
    return 1;
  },
  async subscribe(ch, f) {
    if (!subs.has(ch)) subs.set(ch, []);
    subs.get(ch).push(f);
  },

  duplicate() {
    return this;
  },
  on() {
    return this;
  },
  off() {
    return this;
  },
};

export const connectRedis = async () => {};
export const disconnectRedis = async () => {};
export default redisClient;
