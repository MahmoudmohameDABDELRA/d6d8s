import jwt from 'jsonwebtoken';

import env from '../config/env.js';
import prisma from '../config/prisma.js';
import * as chatService from '../services/chat.service.js';
import * as presence from '../services/presence.service.js';
import * as titleEngine from '../services/titleEngine.service.js';
import { scoped } from '../config/logger.js';
import { wsConnections } from '../config/metrics.js';

const log = scoped('chat');

/**
 * ════════════════════════════════════════════════════════════
 *  الشات اللحظي — Socket.io على /chat
 * ════════════════════════════════════════════════════════════
 *
 * المسؤوليات: البث · مؤشر الكتابة · الحضور · إيصالات القراءة
 * الإرسال نفسه يمر عبر REST ليستفيد من كل التحققات مرة واحدة.
 */

export const registerChatSocket = (io) => {
  const nsp = io.of('/chat');

  nsp.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.split(' ')[1];

      if (!token) return next(new Error('UNAUTHORIZED'));

      const decoded = jwt.verify(token, env.jwt.accessSecret);

      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, username: true, isBanned: true, onboarded: true },
      });

      if (!user || user.isBanned || !user.onboarded) {
        return next(new Error('UNAUTHORIZED'));
      }

      socket.data.userId = user.id;
      socket.data.username = user.username;
      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  });

  nsp.on('connection', async (socket) => {
    wsConnections.labels('chat').inc();
    socket.on('disconnect', () => wsConnections.labels('chat').dec());
    const { userId, username } = socket.data;

    await presence.markOnline(userId);

    // إعلام من يشاركهم محادثات
    const myConvs = await prisma.conversationParticipant.findMany({
      where: { userId },
      select: { conversationId: true },
    });

    myConvs.forEach((c) => socket.join(c.conversationId));
    nsp.emit('presence_update', { userId, isOnline: true });

    /** نبضة دورية تُبقي الحضور حياً — TTL في Redis ينتهي بالصمت */
    const heartbeat = setInterval(() => presence.markOnline(userId), 30_000);

    // ── الانضمام لمحادثة ──
    socket.on('join_conversation', async ({ conversationId }) => {
      try {
        await chatService.assertAccess(conversationId, userId);
        socket.join(conversationId);

        const typing = await presence.getTypingUsers(conversationId, userId);
        socket.emit('joined', { conversationId, typing });

        //  هيبة الدخول النادر: فحص إذا كان المستخدم يحمل أحد الألقاب الأسطورية الثلاثة النادرة
        const entrance = await titleEngine.generateEliteEntrancePayload(userId);
        if (entrance) {
          nsp.to(conversationId).emit('elite_entrance_announcement', {
            conversationId,
            ...entrance,
          });
        }
      } catch (error) {
        socket.emit('error_message', {
          code: error.code ?? 'ACCESS_DENIED',
          message: error.message,
        });
      }
    });

    socket.on('leave_conversation', ({ conversationId }) => {
      socket.leave(conversationId);
      presence.clearTyping(conversationId, userId);
    });

    // ── مؤشر الكتابة ──
    socket.on('typing_start', async ({ conversationId }) => {
      // لا مؤشر أثناء جلسة تركيز — الشات مقفول أصلاً
      try {
        await chatService.assertNotFocusing(userId);
      } catch {
        return;
      }

      await presence.setTyping(conversationId, userId, username);
      socket.to(conversationId).emit('typing', { userId, username, isTyping: true });
    });

    socket.on('typing_stop', async ({ conversationId }) => {
      await presence.clearTyping(conversationId, userId);
      socket.to(conversationId).emit('typing', { userId, username, isTyping: false });
    });

    // ── إيصال القراءة ──
    socket.on('mark_read', async ({ conversationId, messageId }) => {
      socket.to(conversationId).emit('message_read', {
        conversationId,
        messageId,
        userId,
        readAt: new Date(),
      });
    });

    socket.on('disconnect', async () => {
      clearInterval(heartbeat);
      await presence.markOffline(userId);

      for (const c of myConvs) {
        await presence.clearTyping(c.conversationId, userId);
      }

      nsp.emit('presence_update', { userId, isOnline: false, lastSeen: new Date() });

      await prisma.user
        .update({ where: { id: userId }, data: { lastSeen: new Date() } })
        .catch(() => {});
    });
  });

  log.info(' محرك الشات جاهز على /chat');
};

export default registerChatSocket;
