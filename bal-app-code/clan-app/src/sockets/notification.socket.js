/**
 * ═══════════════════════════════════════════════════════════
 *  قناة الإشعارات اللحظية — Socket.io على /notifications
 *
 *  دورها في أهم فيتشر بالتطبيق:
 *    لما ييجي معاد المهمة، العامل بيولّد سؤال الاطمئنان ويبعته هنا،
 *    فالتطبيق (لو مفتوح) بيفتح البوب-أب **فوراً** من غير ما يستنى
 *    الـ push أو الـ polling.
 *
 *  الأحداث الصادرة للعميل:
 *    · `notification:new`     → إشعار جديد (فيه canReply: true للاطمئنان)
 *    · `checkin:reply`        → رد الرفيق على كلام المستخدم (نفس البوب-أب)
 *
 *  الأحداث الواردة من العميل:
 *    · `notification:seen`    → المستخدم شاف الإشعار (يعلّمه مقروء)
 *
 *  ️ الرد نفسه بيتم عبر REST (POST /api/notifications/:id/reply) —
 *    عشان يستفيد من كل التحققات والـ rate limit مرة واحدة، زي
 *    ما الشات بيعمل بالظبط. السوكيت للبث بس.
 * ═══════════════════════════════════════════════════════════
 */
import jwt from 'jsonwebtoken';

import env from '../config/env.js';
import prisma from '../config/prisma.js';
import { redisClient } from '../config/redis.js';
import { scoped } from '../config/logger.js';
import { wsConnections } from '../config/metrics.js';
import { CHANNEL, setIo, userRoom } from '../services/realtime.service.js';

const log = scoped('notification-socket');

export const registerNotificationSocket = (io) => {
  const nsp = io.of('/notifications');

  // نخلي خدمة البث تعرف الـ io المحلي (المسار السريع)
  setIo(io);

  // ── المصادقة: JWT زي الشات بالظبط ──
  nsp.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.split(' ')[1];

      if (!token) return next(new Error('UNAUTHORIZED'));

      const decoded = jwt.verify(token, env.jwt.accessSecret);

      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, isBanned: true },
      });

      if (!user || user.isBanned) return next(new Error('UNAUTHORIZED'));

      socket.data.userId = user.id;
      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  });

  nsp.on('connection', async (socket) => {
    wsConnections.labels('notifications').inc();
    const { userId } = socket.data;

    // غرفة خاصة بالمستخدم — كل أجهزته فيها
    socket.join(userRoom(userId));

    socket.on('disconnect', () => wsConnections.labels('notifications').dec());

    /**
     * دفعة أولى: الإشعارات غير المقروءة اللي تستاهل بوب-أب.
     * ️ ليه؟ لو المستخدم كان قافل التطبيق وقت الإشعار، لما يفتحه
     *    لازم يلاقي السؤال مستنيه — مش يضيع.
     */
    try {
      const pending = await prisma.notification.findMany({
        where: {
          userId,
          isRead: false,
          type: { in: ['TASK_CHECKIN', 'TASK_REMINDER'] },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          type: true,
          title: true,
          body: true,
          data: true,
          createdAt: true,
        },
      });

      if (pending.length > 0) {
        socket.emit('notification:pending', { notifications: pending });
      }
    } catch (error) {
      log.warn({ userId, err: error.message }, 'تعذّر إرسال الإشعارات المعلّقة');
    }

    // ── المستخدم شاف الإشعار ──
    socket.on('notification:seen', async ({ notificationId } = {}) => {
      if (!notificationId) return;
      try {
        await prisma.notification.updateMany({
          where: { id: notificationId, userId },
          data: { isRead: true, readAt: new Date() },
        });
      } catch (error) {
        log.warn({ userId, err: error.message }, 'تعذّر تعليم الإشعار مقروءاً');
      }
    });
  });

  // ════════════════════════════════════════════════
  //  جسر العامل → الـ API
  // ════════════════════════════════════════════════
  /**
   * العامل (worker) عملية منفصلة بلا Socket.io. لما بيولّد سؤال
   * الاطمئنان بينشره على قناة Redis، وإحنا هنا بنسمعها ونوصّلها.
   *
   * ️ `.local` مقصودة: كل عمليات الـ API مشتركة في نفس القناة،
   *    فلو استخدمنا البث الموزّع هيوصل المستخدم مكرر بعدد العمليات.
   */
  (async () => {
    try {
      if (!redisClient?.isOpen) {
        log.warn('Redis مش متاح — جسر البث من العامل معطّل');
        return;
      }
      const subscriber = redisClient.duplicate();
      await subscriber.connect();
      await subscriber.subscribe(CHANNEL, (message) => {
        try {
          const { userId, event, payload } = JSON.parse(message);
          if (!userId || !event) return;
          nsp.local.to(userRoom(userId)).emit(event, payload);
        } catch (error) {
          log.warn({ err: error.message }, 'رسالة بث غير صالحة');
        }
      });
      log.info(' جسر البث من العامل مفعّل');
    } catch (error) {
      log.warn({ err: error.message }, 'تعذّر تفعيل جسر البث — الإشعارات هتوصل بالـ fetch فقط');
    }
  })();

  return nsp;
};

export default registerNotificationSocket;
