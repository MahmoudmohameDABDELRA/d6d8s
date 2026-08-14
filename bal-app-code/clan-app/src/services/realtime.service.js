/**
 * ═══════════════════════════════════════════════════════════
 *  البث اللحظي للمستخدم — Realtime Service
 *
 *  المشكلة: الإشعار المنبثق بيتولّد في **عملية العامل** (worker)
 *  اللي مالهاش Socket.io خالص، والمستخدم متصل بـ **عملية الـ API**.
 *  فالعامل ما يقدرش يبعتله البوب-أب مباشرةً.
 *
 *  الحل: قناة Redis Pub/Sub بينهم.
 *    worker  ──publish──▶  channel `realtime:user`  ──▶  API server(s)
 *                                                          │
 *                                        nsp.local.to(user:<id>).emit()
 *
 *  ️ ليه `.local` بالتحديد؟
 *     كل عملية API مشتركة في القناة، فكلها هتستلم نفس الرسالة.
 *     لو كل واحدة عملت broadcast عادي (اللي بيتوزّع عبر redis-adapter
 *     على الكل) المستخدم هيستلم الإشعار **مكرر بعدد العمليات**.
 *     `.local` بتخلي كل عملية تبعت لسوكيتاتها هي بس — والنتيجة
 *     نسخة واحدة بالظبط.
 *
 *  ️ Fail-Open: لو Redis واقع، البث بيتخطى بصمت — الإشعار
 *     محفوظ في قاعدة البيانات والتطبيق هيلاقيه لما يعمل fetch.
 * ═══════════════════════════════════════════════════════════
 */
import redisClient from '../config/redis.js';
import { scoped } from '../config/logger.js';

const log = scoped('realtime');

export const CHANNEL = 'realtime:user';

/** اسم الغرفة الخاصة بكل مستخدم داخل namespace الإشعارات */
export const userRoom = (userId) => `user:${userId}`;

/** io المحلي — يُضبط من server.js فقط (العامل بيسيبه null) */
let localIo = null;

export const setIo = (io) => {
  localIo = io;
};

export const getIo = () => localIo;

/**
 * بث حدث لمستخدم واحد.
 *
 * لو احنا جوه عملية فيها Socket.io (الـ API) بنبعت على طول — أسرع
 * وبيشتغل حتى لو Redis واقع. غير كده بنعدّي على القناة.
 *
 * @param {string} userId
 * @param {string} event  اسم الحدث (مثلاً 'notification:new')
 * @param {object} payload
 */
export const emitToUser = async (userId, event, payload) => {
  if (!userId || !event) return false;

  // مسار مباشر: احنا في عملية الـ API نفسها
  if (localIo) {
    try {
      localIo.of('/notifications').to(userRoom(userId)).emit(event, payload);
      return true;
    } catch (error) {
      log.warn({ userId, event, err: error.message }, 'فشل البث المباشر');
    }
  }

  // مسار العامل: عدّي على Redis
  try {
    if (!redisClient?.isOpen) return false;
    await redisClient.publish(
      CHANNEL,
      JSON.stringify({ userId, event, payload }),
    );
    return true;
  } catch (error) {
    log.warn({ userId, event, err: error.message }, 'فشل النشر على قناة البث');
    return false;
  }
};

export default { CHANNEL, userRoom, setIo, getIo, emitToUser };
