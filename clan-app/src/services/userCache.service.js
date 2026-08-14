/**
 * ════════════════════════════════════════════════════════════
 *  كاش المصادقة — إزالة أثقل استعلام في النظام
 * ════════════════════════════════════════════════════════════
 *
 *  ️ المشكلة المقيسة:
 *
 *   `authenticateToken` كان يقرأ المستخدم من Postgres في **كل**
 *   طلب مُصادَق — على 103 مسارات.
 *
 *      زمن الاستعلام:      0.77 ms
 *      عند 1,000 req/s:    766 ms من زمن القاعدة كل ثانية
 *                        = 77% من طاقة اتصال واحد للمصادقة وحدها
 *
 *   النتيجة: المصادقة تصير أسخن استعلام في النظام، وتلتهم
 *   المجمّع قبل أن يبدأ أي منطق أعمال. وأي تعثّر في Postgres
 *   يُسقط **تسجيل الدخول** — أي كل شيء.
 *
 *  ️ لماذا لا نضع الحقول في الـ JWT بدل الكاش؟
 *
 *   لأن `isBanned` يجب أن يسري **فوراً**. لو حملناه في التوكن
 *   لظل المحظور يعمل حتى انتهاء صلاحيته. الحظر المتأخر أسوأ
 *   من الاستعلام المتكرر.
 *
 *   الكاش يحلّ الاثنين: 60 ثانية كحدّ أقصى للتأخير، مع إبطال
 *   صريح عند الحظر — فيسري الحظر في نفس اللحظة.
 *
 *  ️ الإبطال إلزامي لا اختياري. كل مسار يعدّل
 *     (role · isBanned · onboarded · domain · username)
 *     **يجب** أن ينادي invalidate(). نسيانها يعني مستخدماً
 *     يرى بيانات قديمة دقيقة كاملة.
 */

import prisma from '../config/prisma.js';
import redisClient from '../config/redis.js';
import { cacheOps } from '../config/metrics.js';

/**
 * مدة الصلاحية.
 *
 * ️ 60 ثانية موازنة مقصودة: أطول منها يعني نافذة أوسع لتغيير
 *    لم يُبطَّل بشكل صحيح، وأقصر منها يُضعف الفائدة. مع الإبطال
 *    الصريح، الـ TTL شبكة أمان لا آلية أساسية.
 */
const TTL_SEC = 60;

const key = (userId) => `user:auth:${userId}`;

/** الحقول التي تحتاجها المصادقة — لا أكثر */
const SELECT = {
  id: true,
  username: true,
  role: true,
  isBanned: true,
  onboarded: true,
  domain: true,
};

const redisReady = () => {
  try {
    return Boolean(redisClient?.isOpen);
  } catch {
    return false;
  }
};

/**
 * مخزن محلي احتياطي.
 *
 * ️ يعمل حين يسقط Redis. مع عدة عمليات قد يحمل كل واحدة نسخة
 *    مختلفة لثانية أو ستين — مقبول لأن البديل هو العودة لضرب
 *    القاعدة في كل طلب، وهي الحالة التي نهرب منها أصلاً.
 */
const local = new Map();

const localGet = (k) => {
  const hit = local.get(k);
  if (!hit) return null;
  if (hit.exp < Date.now()) {
    local.delete(k);
    return null;
  }
  return hit.value;
};

const localSet = (k, value) => {
  local.set(k, { value, exp: Date.now() + TTL_SEC * 1000 });
  // تنظيف كسول — لا نترك الخريطة تنمو بلا حدّ
  if (local.size > 5000) {
    const now = Date.now();
    for (const [lk, lv] of local) if (lv.exp < now) local.delete(lk);
  }
};

/** عدّادات للمراقبة — تُقرأ من /health */
export const stats = { hits: 0, misses: 0, errors: 0 };

/**
 * يجلب المستخدم — من الكاش أولاً ثم القاعدة (cache-aside).
 *
 * @returns {Promise<object|null>} null إن لم يوجد المستخدم
 */
export const getAuthUser = async (userId) => {
  const k = key(userId);

  // ── ١) الكاش ──
  if (redisReady()) {
    try {
      const raw = await redisClient.get(k);
      if (raw) {
        stats.hits += 1;
        cacheOps.labels('auth', 'hit').inc();
        return JSON.parse(raw);
      }
    } catch {
      stats.errors += 1;
    }
  } else {
    const hit = localGet(k);
    if (hit) {
      stats.hits += 1;
      return hit;
    }
  }

  // ── ٢) القاعدة ──
  stats.misses += 1;
  cacheOps.labels('auth', 'miss').inc();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: SELECT,
  });

  /**
   * ️ لا نُخزّن الغياب. تخزين null يعني أن حساباً حُذف ثم
   *    أُعيد إنشاؤه بنفس المعرّف يظل مرفوضاً دقيقة — وهي حالة
   *    نادرة لكن تشخيصها مرهق.
   */
  if (!user) return null;

  // ── ٣) التخزين ──
  if (redisReady()) {
    try {
      await redisClient.set(k, JSON.stringify(user), { EX: TTL_SEC });
    } catch {
      stats.errors += 1;
    }
  } else {
    localSet(k, user);
  }

  return user;
};

/**
 * يُبطل الكاش لمستخدم.
 *
 * ️ يُنادى عند أي تعديل على الحقول المخزّنة. نمسح المخزنين
 *    معاً لأن Redis قد يكون سقط وعاد، فتبقى نسخة محلية قديمة.
 */
export const invalidate = async (userId) => {
  const k = key(userId);
  local.delete(k);

  if (redisReady()) {
    try {
      await redisClient.del(k);
    } catch {
      stats.errors += 1;
    }
  }
};

/** إبطال جماعي — لعمليات الإدارة */
export const invalidateMany = async (userIds = []) => {
  await Promise.all(userIds.map(invalidate));
};

export default { getAuthUser, invalidate, invalidateMany, stats, TTL_SEC };
