/**
 * ═══════════════════════════════════════════════════════════
 *  سجل محادثات Task Check-In — تخزين في Redis
 *
 *  بيحفظ تبادلات «عملت في المهمة إيه؟» لكل (مستخدم × مهمة)
 *  عشان الـ AI يرد بسياق متصّل — لو المستخدم رد «خلصت بس
 *  اتأخرت» في أول مرة، المرة الجاية يفتكر إنه اتأخر.
 *
 *  ️ Redis مش شرط حياة للـ endpoint: لو مش متاح نرجّع تاريخ
 *    فارغ ونتجاوز التخزين (Fail-Open) — نفس فلسفة بقية
 *    التطبيق: تعطّل الرفاهية لا يوقف الخدمة.
 * ═══════════════════════════════════════════════════════════
 */
import redisClient from '../config/redis.js';
import { scoped } from '../config/logger.js';

const log = scoped('checkin-history');

const key = (userId, taskId) => `checkin:history:${userId}:${taskId}`;

/** شهر كامل من الذاكرة — كفاية لاستمرارية الحديث على نفس المهمة */
const TTL_SECONDS = 30 * 24 * 60 * 60;

/** شكل عنصر التاريخ: { sender: 'user'|'app', text: string } — الأقدم أولاً */
export async function getHistory(userId, taskId) {
  try {
    if (!redisClient?.isOpen) return [];
    const raw = await redisClient.get(key(userId, taskId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    log.warn({ userId, err: error.message }, 'تعذّر قراءة تاريخ الـ check-in — نكمل بلا سياق');
    return [];
  }
}

/**
 * يلحق تبادلة جديدة ويقصّ الطرف القديم لآخر ١٠ رسائل
 * حتى لا يكبر الـ prompt بلا داعٍ.
 */
export async function appendExchange(userId, taskId, userReply, reply) {
  try {
    if (!redisClient?.isOpen) return;
    const history = await getHistory(userId, taskId);
    history.push({ sender: 'user', text: userReply });
    history.push({ sender: 'app', text: reply });
    const trimmed = history.slice(-10);
    await redisClient.set(key(userId, taskId), JSON.stringify(trimmed), {
      EX: TTL_SECONDS,
    });
  } catch (error) {
    log.warn({ userId, err: error.message }, 'تعذّر حفظ تاريخ الـ check-in');
  }
}
