import express from 'express';
import {
  getMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  registerDeviceToken,
  unregisterDeviceToken,
} from './notification.controller.js';
import {
  authenticateToken,
  requireOnboarded,
} from '../../middlewares/auth.middleware.js';

const router = express.Router();

router.use(authenticateToken);
router.use(requireOnboarded);

// إدارة توكنات الأجهزة
router.post('/device', registerDeviceToken);
router.delete('/device/:fcmToken', unregisterDeviceToken);

// قائمة الإشعارات والتحكم في القراءة
router.get('/', getMyNotifications);
router.patch('/read-all', markAllNotificationsRead);
router.patch('/:id/read', markNotificationRead);

export default router;
