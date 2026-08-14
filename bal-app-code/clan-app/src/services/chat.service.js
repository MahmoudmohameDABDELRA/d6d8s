import prisma from '../config/prisma.js';
import friendship from './friendship.service.js';
import redisClient from '../config/redis.js';
import { CHAT, LIMITS } from '../config/constants.js';
import { isBreakTime } from './pulse.service.js';
import * as presence from './presence.service.js';
import { badRequest, forbidden, notFound } from '../utils/AppError.js';
import { scoped } from '../config/logger.js';

const log = scoped('chat-service');

// ════════════════════════════════════════════════
//  مفتاح عدم التكرار اللحظي (Idempotency Key)
// ════════════════════════════════════════════════

const localIdemp = new Map();
const idempKey = (userId, clientMsgId) => `msg:idemp:${userId}:${clientMsgId}`;

export const checkMessageIdempotency = async (userId, clientMsgId) => {
  if (!clientMsgId) return null;
  if (redisClient?.isOpen) {
    try {
      const raw = await redisClient.get(idempKey(userId, clientMsgId));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return localIdemp.get(idempKey(userId, clientMsgId)) ?? null;
    }
  }
  return localIdemp.get(idempKey(userId, clientMsgId)) ?? null;
};

export const recordMessageIdempotency = async (userId, clientMsgId, message) => {
  if (!clientMsgId) return;
  localIdemp.set(idempKey(userId, clientMsgId), message);
  if (redisClient?.isOpen) {
    try {
      await redisClient.set(idempKey(userId, clientMsgId), JSON.stringify(message), {
        EX: 60, // صالحة لـ 60 ثانية — تكفي لجميع محاولات إعادة الإرسال
      });
    } catch {
      /* تجاهل أي خطأ كاش عابر */
    }
  }
};

/**
 * ════════════════════════════════════════════════════════════
 *  خدمة الشات — منطق الصلاحيات والحدود
 * ════════════════════════════════════════════════════════════
 *
 * تقسيم التخزين:
 *   Postgres → كل شيء دائم: المحادثات والمشاركون والرسائل
 *   Redis    → الحضور والكتابة والحدود (متغيّر باستمرار)
 *
 * ️ الرسائل كانت في MongoDB وانتقلت إلى Postgres.
 *
 *   السبب: بيانات المحادثة كانت موزّعة على مخزنين بلا معاملة
 *   بينهما، فحذف محادثة كان يترك رسائلها يتيمة إلى الأبد.
 *
 *   قِسنا قبل النقل على 200 ألف رسالة في Postgres:
 *     آخر 50 رسالة = 0.82ms (Index Scan) · الحجم 46MB
 *   أي أن القاعدة الثانية لم تكن تشتري أداءً — كانت تكلّف
 *   اتساقاً فقط.
 */

// ════════════════════════════════════════════════
//  بوابة التركيز
// ════════════════════════════════════════════════

/**
 * الشات مقفول أثناء جلسة تركيز نشطة.
 *
 * قرار متسق: نقفل الدوبامين والألعاب أثناء التركيز — والشات
 * أكثر تشتيتاً منهما. لا معنى لقفل الفيديو وترك المراسلة.
 */
export const assertNotFocusing = async (userId) => {
  const active = await prisma.focusSession.findFirst({
    where: { userId, status: 'ACTIVE' },
    select: { id: true, plannedMin: true, startedAt: true },
  });

  if (!active) return;

  const elapsed = Math.floor((Date.now() - active.startedAt) / 60_000);
  const remaining = Math.max(0, active.plannedMin - elapsed);

  throw forbidden(
    `أنت في جلسة تركيز — أمامك ${remaining} دقيقة. الشات يُفتح بعدها `,
    'FOCUS_SESSION_ACTIVE',
  );
};

// ════════════════════════════════════════════════
//  الصلاحيات
// ════════════════════════════════════════════════

/** هل الطرفان في عشيرة خاصة مشتركة؟ */
export const shareePrivateClan = async (userA, userB) => {
  const shared = await prisma.clanMember.findFirst({
    where: {
      userId: userA,
      clan: {
        type: 'PRIVATE',
        members: { some: { userId: userB } },
      },
    },
    select: { id: true },
  });

  return Boolean(shared);
};

export const isBlocked = async (userA, userB) => {
  const block = await prisma.blockedUser.findFirst({
    where: {
      OR: [
        { blockerId: userA, blockedId: userB },
        { blockerId: userB, blockedId: userA },
      ],
    },
    select: { id: true },
  });

  return Boolean(block);
};

/**
 * هل يمكن لـ from مراسلة to مباشرة؟
 *
 * القاعدة المعتمدة:
 *   عشيرة خاصة مشتركة  → مباشرة بلا طلب
 *   غير ذلك            → طلب مراسلة (ضمن حد 10 يومياً)
 */
export const canMessageDirectly = async (fromId, toId) => {
  if (await isBlocked(fromId, toId)) {
    return { allowed: false, reason: 'BLOCKED' };
  }

  const target = await prisma.user.findUnique({
    where: { id: toId },
    select: { privacyLevel: true, isBanned: true },
  });

  if (!target || target.isBanned) return { allowed: false, reason: 'USER_UNAVAILABLE' };

  // محادثة قائمة بينهما = مسموح دائماً (رجعنا قبل فترة الصداقة)
  const existing = await findDirectConversation(fromId, toId);
  if (existing) return { allowed: true, conversationId: existing.id };

  // ═══ قاعدة المالك (نظام انستقرام): الصداقة شرط المراسلة المفتوحة ═══
  // غريب (مش صديق) → لا مراسلة مباشرة مهما كانت الخصوصية:
  // أول رسالة له تتحول لطلب صداقة (تُنشأ في startConversation).
  const areFriends = await friendship.areFriends(fromId, toId);
  if (areFriends) return { allowed: true, reason: 'FRIENDS' };

  return { allowed: false, reason: 'NEEDS_FRIENDSHIP' };
};

// ════════════════════════════════════════════════
//  المحادثات
// ════════════════════════════════════════════════

export const findDirectConversation = async (userA, userB) => {
  const conv = await prisma.conversation.findFirst({
    where: {
      type: 'DIRECT',
      AND: [
        { participants: { some: { userId: userA } } },
        { participants: { some: { userId: userB } } },
      ],
    },
  });

  return conv;
};

export const createDirectConversation = async (userA, userB) => {
  const existing = await findDirectConversation(userA, userB);
  if (existing) return existing;

  return prisma.conversation.create({
    data: {
      type: 'DIRECT',
      participants: { create: [{ userId: userA }, { userId: userB }] },
    },
  });
};

/** محادثة العشيرة — تُنشأ عند أول استخدام */
export const getOrCreateClanConversation = async (clanId) => {
  const existing = await prisma.conversation.findUnique({ where: { clanId } });
  if (existing) return existing;

  return prisma.conversation.create({ data: { type: 'CLAN', clanId } });
};

/**
 * التحقق من حق الوصول للمحادثة.
 * محادثات العشيرة لا تحتاج صف مشارك — العضوية تكفي.
 */
export const assertAccess = async (conversationId, userId) => {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { clan: { select: { id: true, type: true } } },
  });

  if (!conv) throw notFound('المحادثة غير موجودة');

  if (conv.type === 'CLAN') {
    const member = await prisma.clanMember.findUnique({
      where: { userId_clanId: { userId, clanId: conv.clanId } },
      select: { id: true },
    });

    if (!member) throw forbidden('أنت لست عضواً في هذه العشيرة');
    return conv;
  }

  const participant = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: { id: true },
  });

  if (!participant) throw forbidden('أنت لست في هذه المحادثة');

  // إذا كانت محادثة مباشرة، نتحقق من عدم وجود حظر متبادل بين الطرفين
  if (conv.type === 'DIRECT') {
    const other = await prisma.conversationParticipant.findFirst({
      where: { conversationId, userId: { not: userId } },
      select: { userId: true },
    });

    if (other && (await isBlocked(userId, other.userId))) {
      throw forbidden('لا يمكن إرسال أو قراءة رسائل في هذه المحادثة (حساب محظور)', 'BLOCKED');
    }
  }

  return conv;
};

// ════════════════════════════════════════════════
//  الحدود حسب نوع المحادثة
// ════════════════════════════════════════════════

/**
 * العشيرة العامة قد تصل آلاف الأعضاء — الحدود الصارمة ضرورية
 * وإلا تحوّل الشات إلى شلال رسائل يُغرق الخادم والمستخدم معاً.
 */
export const getLimits = (conv) => {
  if (conv.type === 'DIRECT') {
    return { slowSec: 0, hourly: CHAT.DM_MAX_PER_HOUR, scope: 'dm' };
  }

  const isGlobal = conv.clan?.type === 'GLOBAL';

  return isGlobal
    ? {
        slowSec: CHAT.GLOBAL_SLOW_MODE_SEC,
        hourly: CHAT.GLOBAL_MAX_PER_HOUR,
        scope: 'clan_global',
      }
    : {
        slowSec: CHAT.PRIVATE_SLOW_MODE_SEC,
        hourly: CHAT.PRIVATE_MAX_PER_HOUR,
        scope: 'clan_private',
      };
};

export const enforceLimits = async (userId, conv) => {
  const { slowSec, hourly, scope } = getLimits(conv);

  const slow = await presence.checkSlowMode(userId, conv.id, slowSec);
  if (!slow.allowed) {
    throw badRequest(
      `الوضع البطيء — انتظر ${slow.waitSec} ثانية`,
      'SLOW_MODE',
    );
  }

  const rate = await presence.checkHourlyLimit(userId, scope, hourly);
  if (!rate.allowed) {
    throw badRequest(
      `تجاوزت حد الرسائل هذه الساعة (${hourly})`,
      'RATE_LIMIT',
    );
  }
};

// ════════════════════════════════════════════════
//  الرسائل
// ════════════════════════════════════════════════

export const sendMessage = async ({
  conversationId,
  senderId,
  senderName,
  text,
  replyToId,
}) => {
  const trimmed = String(text ?? '').trim();

  if (!trimmed) throw badRequest('نص الرسالة مطلوب');
  if (trimmed.length > CHAT.MAX_LENGTH) {
    throw badRequest(`الرسالة أطول من ${CHAT.MAX_LENGTH} حرفاً`);
  }

  /** لقطة من الرسالة المُردود عليها — لا مرجع حيّ */
  let reply = {};
  if (replyToId) {
    const original = await prisma.message.findUnique({
      where: { id: replyToId },
      select: { id: true, text: true, senderName: true, conversationId: true },
    });
    if (original && original.conversationId === conversationId) {
      reply = {
        replyToId: original.id,
        replyToText: original.text.slice(0, 120),
        replyToSender: original.senderName,
      };
    }
  }

  /**
   * ️ معاملة واحدة تكتب الرسالة وتحدّث ترتيب المحادثة.
   *
   *  قبل التوحيد كانت الكتابتان في مخزنين مختلفين: تنجح الرسالة
   *  في Mongo ويفشل تحديث `lastMessageAt` في Postgres، فتظهر
   *  المحادثة في مكانها القديم ولا شيء يصحّحها.
   *
   *  الآن إمّا تنجحان معاً أو تفشلان معاً.
   */
  const [message] = await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId,
        senderId,
        senderName,
        text: trimmed,
        readBy: [senderId],
        ...reply,
      },
    }),
    prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date(), lastMessageText: trimmed.slice(0, 120) },
    }),
  ]);

  return message;
};

export const getMessages = async (conversationId, { before, limit } = {}) => {
  const take = Math.min(limit ?? CHAT.PAGE_SIZE, 100);

  /**
   * ️ ترقيم بالمؤشّر (cursor) لا بالإزاحة.
   *
   *  `OFFSET 10000` يجبر Postgres على قراءة عشرة آلاف صف
   *  وتجاهلها. الشرط على `createdAt` يستخدم الفهرس مباشرةً
   *  فيبقى الزمن ثابتاً مهما عمقت الصفحة.
   */
  const messages = await prisma.message.findMany({
    where: {
      conversationId,
      isDeleted: false,
      ...(before ? { createdAt: { lt: new Date(before) } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take,
  });

  // الأقدم أولاً للعرض
  return messages.reverse();
};

/**
 * الإبلاغ عن رسالة محددة مع التقاط لقطة فورية للنص وحظر المرسل اختيارياً
 */
export const reportMessage = async ({
  reporterId,
  messageId,
  reason = 'HARASSMENT',
  details,
  andBlock = false,
}) => {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: { conversation: true },
  });

  if (!message) {
    throw notFound('الرسالة غير موجودة');
  }

  // التحقق من حق المبلّغ في الوصول للمحادثة
  await assertAccess(message.conversationId, reporterId);

  if (message.senderId === reporterId) {
    throw badRequest('لا يمكنك الإبلاغ عن رسالتك الخاصة');
  }

  const validReasons = ['SPAM', 'HARASSMENT', 'INAPPROPRIATE', 'CHEATING', 'OTHER'];
  if (!validReasons.includes(reason)) {
    throw badRequest(`سبب البلاغ يجب أن يكون أحد الخيارات: ${validReasons.join(' · ')}`);
  }

  const targetType = message.conversation?.type === 'CLAN' ? 'CLAN_MESSAGE' : 'CHAT_MESSAGE';
  const contentSnapshot = `[المرسل: ${message.senderName}] ${message.text}`;

  const result = await prisma.$transaction(async (tx) => {
    // 1. إنشاء البلاغ الموثق مع لقطة الإدانة المحفوظة
    const report = await tx.userReport.create({
      data: {
        reporterId,
        reportedId: message.senderId,
        targetType,
        messageId: message.id,
        conversationId: message.conversationId,
        contentSnapshot,
        reason,
        details: details ? String(details).trim().slice(0, 500) : null,
        status: 'PENDING',
      },
    });

    // 2. إذا اختار المستخدم خيار "إبلاغ وحظر فوري"
    let blockRecord = null;
    if (andBlock) {
      blockRecord = await tx.blockedUser.upsert({
        where: {
          blockerId_blockedId: { blockerId: reporterId, blockedId: message.senderId },
        },
        update: {},
        create: {
          blockerId: reporterId,
          blockedId: message.senderId,
        },
      });
    }

    return { report, blockRecord };
  });

  log.warn(
    { reporterId, reportedId: message.senderId, messageId, andBlock },
    ' تم تسجيل بلاغ على رسالة مع حفظ لقطة المحتوى للأدمن',
  );

  return {
    success: true,
    message: andBlock
      ? 'تم توثيق الدليل وإرسال البلاغ للإدارة وحظر المستخدم فورياً ️'
      : 'تم توثيق لقطة الرسالة كدليل قاطع وإرسال البلاغ للإدارة بنجاح ️',
    reportId: result.report.id,
    isBlocked: Boolean(result.blockRecord),
    contentSnapshot,
  };
};

export default {
  assertNotFocusing,
  canMessageDirectly,
  shareePrivateClan,
  isBlocked,
  findDirectConversation,
  createDirectConversation,
  getOrCreateClanConversation,
  assertAccess,
  getLimits,
  enforceLimits,
  sendMessage,
  getMessages,
  reportMessage,
};
