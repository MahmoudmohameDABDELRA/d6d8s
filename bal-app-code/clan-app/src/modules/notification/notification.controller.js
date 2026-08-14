import * as notificationService from '../../services/notification.service.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { badRequest, notFound } from '../../utils/AppError.js';

/**
 * ════════════════════════════════════════════════════════════
 *  كنترولر الإشعارات — Notification Controller
 * ════════════════════════════════════════════════════════════
 */

export const registerDeviceToken = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { fcmToken, platform = 'ANDROID' } = req.body ?? {};

  if (!fcmToken || !String(fcmToken).trim()) {
    throw badRequest('fcmToken مطلوب');
  }

  const device = await notificationService.registerDevice(
    userId,
    String(fcmToken).trim(),
    platform,
  );

  res.status(201).json({
    success: true,
    message: 'تم تسجيل توكن الجهاز بنجاح',
    device: {
      id: device.id,
      platform: device.platform,
      lastUsed: device.lastUsed,
    },
  });
});

export const unregisterDeviceToken = asyncHandler(async (req, res) => {
  const { fcmToken } = req.params;

  if (!fcmToken) {
    throw badRequest('fcmToken مطلوب');
  }

  await notificationService.unregisterDevice(fcmToken);

  res.json({
    success: true,
    message: 'تم إلغاء تسجيل الجهاز بنجاح',
  });
});

export const getMyNotifications = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { page = 1, limit = 30, unreadOnly } = req.query;

  const result = await notificationService.listNotifications(userId, {
    page: Number(page) || 1,
    limit: Number(limit) || 30,
    unreadOnly: unreadOnly === 'true',
  });

  res.json({
    success: true,
    page: Number(page) || 1,
    limit: Number(limit) || 30,
    total: result.total,
    unreadCount: result.unreadCount,
    hasMore: result.hasMore,
    notifications: result.notifications,
  });
});

export const markNotificationRead = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { id } = req.params;

  const updated = await notificationService.markAsRead(userId, id);
  if (updated.count === 0) {
    throw notFound('الإشعار غير موجود');
  }

  res.json({
    success: true,
    message: 'تم تعليم الإشعار كمقروء',
  });
});

export const markAllNotificationsRead = asyncHandler(async (req, res) => {
  const userId = req.user.userId;

  const updated = await notificationService.markAllAsRead(userId);

  res.json({
    success: true,
    message: `تم تعليم ${updated.count} إشعاراً كمقروء`,
  });
});

export default {
  registerDeviceToken,
  unregisterDeviceToken,
  getMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
};
