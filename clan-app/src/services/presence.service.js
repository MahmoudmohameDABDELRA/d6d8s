import redis from '../config/redis.js';
import { CHAT } from '../config/constants.js';

/**
 * ════════════════════════════════════════════════════════════
 *  الحضور ومؤشر الكتابة — Redis
 * ════════════════════════════════════════════════════════════
 *
 * لماذا Redis لا Postgres؟
 *   حالة "متصل الآن" تتغيّر عشرات المرات في الدقيقة لكل مستخدم.
 *   كتابتها في Postgres = ملايين الكتابات يومياً بلا فائدة دائمة.
 *   Redis مع TTL يحلّها: المفتاح ينتهي وحده حين يصمت المستخدم.
 */

const onlineKey = (userId) => `presence:${userId}`;
const typingKey = (conversationId, userId) => `typing:${conversationId}:${userId}`;
const rateKey = (userId, scope) => `rate:${scope}:${userId}`;
const slowKey = (userId, conversationId) => `slow:${conversationId}:${userId}`;

// ════════════════════════════════════════════════
//  الحضور
// ════════════════════════════════════════════════

/** تسجيل نشاط — المفتاح ينتهي تلقائياً بعد صمت */
export const markOnline = async (userId) => {
  if (!redis?.isOpen) return;
  try {
    await redis.set(onlineKey(userId), Date.now().toString(), {
      EX: CHAT.PRESENCE_TTL_SEC,
    });
  } catch {
    /* تدهور لطيف */
  }
};

export const markOffline = async (userId) => {
  if (!redis?.isOpen) return;
  try {
    await redis.del(onlineKey(userId));
  } catch {
    /* تدهور لطيف */
  }
};

export const isOnline = async (userId) => {
  if (!redis?.isOpen) return false;
  try {
    const v = await redis.get(onlineKey(userId));
    return v !== null;
  } catch {
    return false;
  }
};

/** حالة مجموعة مستخدمين دفعة واحدة — استعلام واحد لا N */
export const getPresenceMap = async (userIds) => {
  if (userIds.length === 0 || !redis?.isOpen) return {};

  try {
    const values = await redis.mGet(userIds.map(onlineKey));

    return Object.fromEntries(
      userIds.map((id, i) => [id, values[i] !== null]),
    );
  } catch {
    return {};
  }
};

// ════════════════════════════════════════════════
//  مؤشر الكتابة — O(1) عبر Redis Hash لكل محادثة
// ════════════════════════════════════════════════

const typingHashKey = (conversationId) => `typing:hash:${conversationId}`;

export const setTyping = async (conversationId, userId, userName) => {
  const key = typingHashKey(conversationId);
  await redis.hSet(key, userId, `${userName}:${Date.now()}`);
  await redis.expire(key, CHAT.TYPING_TTL_SEC + 4);
};

export const clearTyping = async (conversationId, userId) => {
  await redis.hDel(typingHashKey(conversationId), userId);
};

/** من يكتب الآن في هذه المحادثة — O(1) دون مسح كامل فضاء المفاتيح */
export const getTypingUsers = async (conversationId, excludeUserId = null) => {
  const key = typingHashKey(conversationId);
  const data = await redis.hGetAll(key);
  if (!data || Object.keys(data).length === 0) return [];

  const now = Date.now();
  const active = [];
  const maxAge = CHAT.TYPING_TTL_SEC * 1000;

  for (const [uid, val] of Object.entries(data)) {
    if (excludeUserId && uid === excludeUserId) continue;
    const separatorIdx = val.lastIndexOf(':');
    if (separatorIdx === -1) continue;

    const name = val.slice(0, separatorIdx);
    const timestamp = Number(val.slice(separatorIdx + 1));

    if (now - timestamp < maxAge) {
      active.push({ userId: uid, name });
    } else {
      await redis.hDel(key, uid).catch(() => {});
    }
  }

  return active;
};

// ════════════════════════════════════════════════
//  حدود الإرسال
// ════════════════════════════════════════════════

/**
 * Slow mode — الحد الأدنى بين رسالتين.
 * ضروري لشات العشيرة العامة (قد تصل آلاف الأعضاء).
 *
 * @returns {{allowed:boolean, waitSec:number}}
 */
export const checkSlowMode = async (userId, conversationId, slowSec) => {
  if (slowSec <= 0 || !redis?.isOpen) return { allowed: true, waitSec: 0 };

  try {
    const key = slowKey(userId, conversationId);
    const ttl = await redis.ttl(key);

    if (ttl > 0) return { allowed: false, waitSec: ttl };

    await redis.set(key, '1', { EX: slowSec });
    return { allowed: true, waitSec: 0 };
  } catch {
    return { allowed: true, waitSec: 0 };
  }
};

/**
 * حد الرسائل في الساعة.
 * @returns {{allowed:boolean, remaining:number, resetSec:number}}
 */
export const checkHourlyLimit = async (userId, scope, max) => {
  if (!redis?.isOpen) return { allowed: true, remaining: max, resetSec: 3600 };

  try {
    const key = rateKey(userId, scope);
    const count = await redis.incr(key);

    if (count === 1) await redis.expire(key, 3600);

    const ttl = await redis.ttl(key);

    return {
      allowed: count <= max,
      remaining: Math.max(0, max - count),
      resetSec: ttl > 0 ? ttl : 3600,
    };
  } catch {
    return { allowed: true, remaining: max, resetSec: 3600 };
  }
};

/**
 * حد المحادثات الجديدة اليومي — 10 أشخاص جدد.
 * يُصفَّر تلقائياً بانتهاء TTL.
 */
export const checkDailyNewChats = async (userId, max) => {
  if (!redis?.isOpen) return { allowed: true, used: 0, remaining: max };

  try {
    const key = `newchats:${userId}:${new Date().toISOString().slice(0, 10)}`;
    const count = Number((await redis.get(key)) ?? 0);

    return { allowed: count < max, used: count, remaining: Math.max(0, max - count) };
  } catch {
    return { allowed: true, used: 0, remaining: max };
  }
};

export const incrementNewChats = async (userId) => {
  if (!redis?.isOpen) return 1;

  try {
    const key = `newchats:${userId}:${new Date().toISOString().slice(0, 10)}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 86_400);
    return count;
  } catch {
    return 1;
  }
};

export default {
  markOnline,
  markOffline,
  isOnline,
  getPresenceMap,
  setTyping,
  clearTyping,
  getTypingUsers,
  checkSlowMode,
  checkHourlyLimit,
  checkDailyNewChats,
  incrementNewChats,
};
