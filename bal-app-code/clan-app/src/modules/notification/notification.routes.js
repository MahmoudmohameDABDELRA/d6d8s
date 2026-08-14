import express from 'express';
import rateLimit from 'express-rate-limit';
import {
  getMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  registerDeviceToken,
  unregisterDeviceToken,
} from './notification.controller.js';
import {
  getNotificationThread,
  openTaskCheckIn,
  replyToNotification,
} from './notificationReply.controller.js';
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

/**
 * ═══════════════════════════════════════════════════════════
 *  ⭐ الرد داخل البوب-أب — أهم مسار في التطبيق
 *
 *  حاجز المعدّل هنا أضيق من المعتاد: كل رد = نداء Gemini حقيقي،
 *  والبوب-أب مش شات مفتوح. 20 رد في الدقيقة كفاية لأي استخدام
 *  بشري طبيعي وبيمنع استنزاف الحصّة.
 * ═══════════════════════════════════════════════════════════
 */
const replyLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

/**
 * ️ لازم تسبق `/:id/reply` — غير كده Express هيفسّر «checkin»
 *    كأنه قيمة الـ :id.
 */
router.post('/checkin/open', replyLimiter, openTaskCheckIn);

router.post('/:id/reply', replyLimiter, replyToNotification);
router.get('/:id/thread', getNotificationThread);

// قائمة الإشعارات والتحكم في القراءة
router.get('/', getMyNotifications);
router.patch('/read-all', markAllNotificationsRead);
router.patch('/:id/read', markNotificationRead);

export default router;
