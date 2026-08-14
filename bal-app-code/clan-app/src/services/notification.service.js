import prisma from '../config/prisma.js';
import redisClient from '../config/redis.js';
import { getQueue, QUEUE_NAMES } from '../queues/index.js';
import * as pushDispatcher from './pushDispatcher.service.js';
import { scoped } from '../config/logger.js';

const log = scoped('notification');

/**
 * ════════════════════════════════════════════════════════════
 *  محرك الإشعارات الفورية — Push Notification Service
 * ════════════════════════════════════════════════════════════
 *
 *  الوظائف:
 *   1. إدارة توكنات الأجهزة (FCM Tokens) لأندرويد وآيفون.
 *   2. إرسال الإشعارات عبر طابور BullMQ في الخلفية دون تعطيل الـ API.
 *   3. البث الجماعي لأعضاء العشيرة (Clan Broadcast).
 *   4. تتبع حالة القراءة وسجل الإشعارات في قاعدة البيانات.
 */

/**
 * تسجيل توكن جهاز جديد أو تحديث وقت استخدامه
 */
export const registerDevice = async (userId, fcmToken, platform = 'ANDROID') => {
  if (!fcmToken || typeof fcmToken !== 'string') return null;

  const validPlatform = ['IOS', 'ANDROID'].includes(platform) ? platform : 'ANDROID';

  return prisma.device.upsert({
    where: { fcmToken },
    update: {
      userId,
      platform: validPlatform,
      lastUsed: new Date(),
    },
    create: {
      userId,
      fcmToken,
      platform: validPlatform,
      lastUsed: new Date(),
    },
  });
};

/**
 * حذف توكن جهاز (عند تسجيل الخروج)
 */
export const unregisterDevice = async (fcmToken) => {
  if (!fcmToken) return null;
  return prisma.device.deleteMany({
    where: { fcmToken },
  });
};

/**
 * إرسال إشعار فوري لمستخدم عبر طابور BullMQ
 */
export const sendNotification = async (userId, { type, title, body, data = {} }) => {
  if (!userId || !title || !body) return null;

  // 1. حفظ الإشعار في قاعدة البيانات
  const notification = await prisma.notification.create({
    data: {
      userId,
      type: type || 'SYSTEM',
      title,
      body,
      data: data || {},
      pushSent: false,
    },
  });

  // 2. إرسال المهمة لطابور الإشعارات في الخلفية
  if (redisClient?.isOpen) {
    try {
      const queue = getQueue(QUEUE_NAMES.NOTIFICATION);
      await queue.add('dispatch-push', {
        notificationId: notification.id,
        userId,
        title,
        body,
        type,
        data,
      });
    } catch (err) {
      log.warn(`️ تعذّر إرسال الإشعار إلى الطابور (${err.message}) — تم الحفظ في القاعدة`);
    }
  }

  return notification;
};

/**
 * بث إشعار لجميع أعضاء العشيرة (ما عدا المرسل)
 */
export const broadcastClanNotification = async (clanId, { type, title, body, data = {} }, excludeUserId = null) => {
  const members = await prisma.clanMember.findMany({
    where: {
      clanId,
      ...(excludeUserId ? { userId: { not: excludeUserId } } : {}),
    },
    select: { userId: true },
  });

  if (members.length === 0) return [];

  const results = await Promise.allSettled(
    members.map((m) => sendNotification(m.userId, { type, title, body, data })),
  );

  return results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
};

/**
 * إرسال الدفعة الفعلية لـ FCM / APNs (تُنفَّذ داخل عامل BullMQ)
 */
export const dispatchToFCM = async (payload) => {
  const { notificationId, userId, title, body, type, data } = payload;

  const result = await pushDispatcher.dispatchToUserDevices(userId, {
    title,
    body,
    type,
    data,
    soundTheme: data?.soundTheme || 'ZEN_BELL',
  });

  if (notificationId && result.sent > 0) {
    await prisma.notification.updateMany({
      where: { id: notificationId },
      data: { pushSent: true, pushSentAt: new Date() },
    });
  }

  return result;
};

/**
 * جلب إشعارات المستخدم مع الترقيم
 */
export const listNotifications = async (userId, { page = 1, limit = 30, unreadOnly = false } = {}) => {
  const take = Math.min(100, Math.max(1, Number(limit) || 30));
  const skip = (Math.max(1, Number(page) || 1) - 1) * take;

  const where = {
    userId,
    ...(unreadOnly ? { isRead: false } : {}),
  };

  const [notifications, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, isRead: false } }),
  ]);

  return {
    notifications,
    total,
    unreadCount,
    hasMore: skip + notifications.length < total,
  };
};

/**
 * تعليم إشعار كمقروء
 */
export const markAsRead = async (userId, notificationId) => {
  return prisma.notification.updateMany({
    where: { id: notificationId, userId },
    data: { isRead: true, readAt: new Date() },
  });
};

/**
 * تعليم جميع إشعارات المستخدم كمقروءة
 */
export const markAllAsRead = async (userId) => {
  return prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
};

export default {
  registerDevice,
  unregisterDevice,
  sendNotification,
  broadcastClanNotification,
  dispatchToFCM,
  listNotifications,
  markAsRead,
  markAllAsRead,
};
