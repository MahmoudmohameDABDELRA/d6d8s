/**
 * ═══════════════════════════════════════════════════════════
 *  محادثة البوب-أب — Check-In Thread Service
 *
 *  المستخدم بيرد على سؤال الاطمئنان **جوه نفس الإشعار**، والرفيق
 *  بيرد عليه في نفس الحقل. يبقى كل إشعار = خيط محادثة صغير.
 *
 *  التخزين: Redis (`checkin:thread:<notificationId>`) لمدة 30 يوم.
 *
 *  ️ ليه Redis مش قاعدة البيانات؟
 *     دي محادثة سريعة قصيرة (٤-٦ رسايل) عمرها الافتراضي أيام.
 *     جدول دائم ليها معناه صفوف بتتكوّم بلا فايدة. اللي بيتحفظ
 *     دائماً هو الإشعار نفسه في Postgres.
 *
 *  ️ Fail-Open: لو Redis واقع، الرد لسه بيشتغل — بس بلا ذاكرة
 *     للسياق. تعطّل الرفاهية ما بيوقفش الخدمة.
 * ═══════════════════════════════════════════════════════════
 */
import redisClient from '../config/redis.js';
import { scoped } from '../config/logger.js';

const log = scoped('checkin-thread');

const key = (notificationId) => `checkin:thread:${notificationId}`;

const TTL_SECONDS = 30 * 24 * 60 * 60;

/** أقصى عدد رسايل نفتكرها — البرومبت ما يكبرش بلا داعي */
const MAX_MESSAGES = 12;

/** أقصى عدد ردود مسموح بيها في الخيط الواحد (مضاد إساءة الاستخدام) */
export const MAX_USER_TURNS = 10;

/**
 * قراءة الخيط.
 * @returns {Promise<{sender:'user'|'companion', text:string, at:string}[]>}
 */
export const getThread = async (notificationId) => {
  try {
    if (!redisClient?.isOpen) return [];
    const raw = await redisClient.get(key(notificationId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    log.warn({ notificationId, err: error.message }, 'تعذّر قراءة الخيط — نكمل بلا سياق');
    return [];
  }
};

/** عدد أدوار المستخدم في الخيط */
export const countUserTurns = (thread) =>
  thread.filter((m) => m.sender === 'user').length;

/**
 * إلحاق تبادلة (رسالة المستخدم + رد الرفيق).
 */
export const appendExchange = async (notificationId, userText, companionText) => {
  try {
    if (!redisClient?.isOpen) return;
    const thread = await getThread(notificationId);
    const at = new Date().toISOString();
    thread.push({ sender: 'user', text: userText, at });
    thread.push({ sender: 'companion', text: companionText, at });
    const trimmed = thread.slice(-MAX_MESSAGES);
    await redisClient.set(key(notificationId), JSON.stringify(trimmed), {
      EX: TTL_SECONDS,
    });
  } catch (error) {
    log.warn({ notificationId, err: error.message }, 'تعذّر حفظ الخيط');
  }
};

/** تحويل الخيط لصيغة history بتاعة Gemini */
export const toGeminiHistory = (thread) =>
  thread.map((m) => ({
    role: m.sender === 'user' ? 'user' : 'model',
    parts: [{ text: m.text }],
  }));

export default {
  MAX_USER_TURNS,
  getThread,
  countUserTurns,
  appendExchange,
  toGeminiHistory,
};
