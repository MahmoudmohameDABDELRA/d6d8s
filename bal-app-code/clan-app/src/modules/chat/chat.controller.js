import prisma from '../../config/prisma.js';
import { CHAT, DOMAINS, LIMITS, SPECIALTIES } from '../../config/constants.js';
import * as chatService from '../../services/chat.service.js';
import friendshipService from '../../services/friendship.service.js';
import * as presence from '../../services/presence.service.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { badRequest, conflict, forbidden, notFound } from '../../utils/AppError.js';
import * as v from '../../utils/validate.js';

/**
 * ════════════════════════════════════════════════════════════
 *  الشات — ثلاثة تبويبات: المحادثات · العشائر · الطلبات
 * ════════════════════════════════════════════════════════════
 */

//////////////////////////////////////////////////////
// التبويب 1: المحادثات
//////////////////////////////////////////////////////

export const listConversations = asyncHandler(async (req, res) => {
  const userId = req.user.userId;

  const parts = await prisma.conversationParticipant.findMany({
    where: { userId, conversation: { type: 'DIRECT' } },
    include: {
      conversation: {
        include: {
          participants: {
            where: { userId: { not: userId } },
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  profileImage: true,
                  domain: true,
                  specialty: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: { conversation: { lastMessageAt: 'desc' } },
  });

  const otherIds = parts.map((p) => p.conversation.participants[0]?.user.id).filter(Boolean);
  const presenceMap = await presence.getPresenceMap(otherIds);

  // ═══ عدد غير المقروء — استعلام واحد لكل المحادثات (لا N+1) ═══
  // نقرأ كل رسائل محادثات المستخدم دفعة واحدة، ونحسب غير المقروء
  // في الذاكرة مقابل lastReadAt لكل محادثة (Index Only Scan في القاعدة).
  const convIds = parts.map((p) => p.conversationId);
  const lastReadMap = new Map(
    parts.map((p) => [p.conversationId, p.lastReadAt ?? p.joinedAt]),
  );

  const recentMessages = await prisma.message.findMany({
    where: {
      conversationId: { in: convIds },
      isDeleted: false,
      senderId: { not: userId },
    },
    select: { conversationId: true, createdAt: true },
  });

  const unreadByConv = new Map();
  for (const m of recentMessages) {
    const readAt = lastReadMap.get(m.conversationId);
    if (!readAt || new Date(m.createdAt).getTime() > new Date(readAt).getTime()) {
      unreadByConv.set(m.conversationId, (unreadByConv.get(m.conversationId) ?? 0) + 1);
    }
  }

  res.json({
    success: true,
    conversations: parts.map((p) => {
      const other = p.conversation.participants[0]?.user;
      return {
        id: p.conversationId,
        user: other ? { ...other, isOnline: presenceMap[other.id] ?? false } : null,
        lastMessage: p.conversation.lastMessageText,
        lastMessageAt: p.conversation.lastMessageAt,
        unread: unreadByConv.get(p.conversationId) ?? 0,
        isMuted: p.isMuted,
      };
    }),
  });
});

//////////////////////////////////////////////////////
// التبويب 2: العشائر
//////////////////////////////////////////////////////

export const listClanChats = asyncHandler(async (req, res) => {
  const userId = req.user.userId;

  const memberships = await prisma.clanMember.findMany({
    where: { userId },
    include: {
      clan: {
        include: {
          conversation: true,
          _count: { select: { members: true } },
        },
      },
    },
  });

  res.json({
    success: true,
    clans: memberships.map((m) => ({
      clanId: m.clan.id,
      name: m.clan.name,
      icon: m.clan.icon,
      type: m.clan.type,
      members: m.clan._count.members,
      conversationId: m.clan.conversation?.id ?? null,
      lastMessage: m.clan.conversation?.lastMessageText ?? null,
      lastMessageAt: m.clan.conversation?.lastMessageAt ?? null,
      /** العامة بطيئة عمداً — قد تصل آلاف الأعضاء */
      slowModeSec:
        m.clan.type === 'GLOBAL'
          ? CHAT.GLOBAL_SLOW_MODE_SEC
          : CHAT.PRIVATE_SLOW_MODE_SEC,
    })),
  });
});

/** فتح شات عشيرة — يُنشأ عند أول استخدام */
export const openClanChat = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { clanId } = req.params;

  const member = await prisma.clanMember.findUnique({
    where: { userId_clanId: { userId, clanId } },
    select: { id: true },
  });

  if (!member) throw forbidden('أنت لست عضواً في هذه العشيرة');

  const conv = await chatService.getOrCreateClanConversation(clanId);
  const clan = await prisma.clan.findUnique({
    where: { id: clanId },
    select: { name: true, type: true },
  });

  res.json({
    success: true,
    conversationId: conv.id,
    clan,
    slowModeSec:
      clan.type === 'GLOBAL'
        ? CHAT.GLOBAL_SLOW_MODE_SEC
        : CHAT.PRIVATE_SLOW_MODE_SEC,
  });
});

//////////////////////////////////////////////////////
// التبويب 3: الطلبات
//////////////////////////////////////////////////////

export const listRequests = asyncHandler(async (req, res) => {
  const userId = req.user.userId;

  const [incoming, quota, friendReqs] = await Promise.all([
    prisma.messageRequest.findMany({
      where: { toUserId: userId, status: 'PENDING' },
      include: {
        fromUser: {
          select: {
            id: true,
            username: true,
            profileImage: true,
            domain: true,
            specialty: true,
            totalFocusMin: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    presence.checkDailyNewChats(userId, LIMITS.DAILY_NEW_CHATS),
    prisma.friendship.findMany({
      where: { toUserId: userId, status: 'PENDING' },
      include: {
        fromUser: {
          select: {
            id: true,
            username: true,
            profileImage: true,
            domain: true,
            specialty: true,
            totalFocusMin: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  // ═══ نظام الصداقة (قرار المالك): طلبات الصداقة = النوع الأساسي ═══
  const friendRequests = friendReqs.map((r) => ({
    id: r.id,
    kind: 'FRIENDSHIP',
    introText: r.introText ?? null,
    fromUser: r.fromUser,
    createdAt: r.createdAt,
  }));

  res.json({
    success: true,
    requests: [
      ...friendRequests,
      ...incoming.map((r) => ({
        id: r.id,
        kind: 'MESSAGE',
        from: r.fromUser,
        introText: r.introText,
        createdAt: r.createdAt,
      })),
    ],
    myQuota: {
      used: quota.used,
      remaining: quota.remaining,
      total: LIMITS.DAILY_NEW_CHATS,
    },
  });
});

export const respondToRequest = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { id } = req.params;
  const { action } = req.body ?? {};

  if (!['ACCEPT', 'DECLINE', 'BLOCK'].includes(action)) {
    throw badRequest('action يجب أن يكون ACCEPT أو DECLINE أو BLOCK');
  }

  const request = await prisma.messageRequest.findFirst({
    where: { id, toUserId: userId, status: 'PENDING' },
  });

  if (!request) throw notFound('الطلب غير موجود');

  if (action === 'ACCEPT') {
    const conv = await chatService.createDirectConversation(
      request.fromUserId,
      userId,
    );

    await prisma.$transaction([
      prisma.messageRequest.update({
        where: { id },
        data: { status: 'ACCEPTED', respondedAt: new Date() },
      }),
      prisma.notification.create({
        data: {
          userId: request.fromUserId,
          type: 'MESSAGE_REQUEST',
          title: 'تم قبول طلبك',
          body: `${req.user.username} قبل طلب المراسلة`,
          data: { conversationId: conv.id },
        },
      }),
    ]);

    // نقل رسالة التعريف إلى المحادثة
    const sender = await prisma.user.findUnique({
      where: { id: request.fromUserId },
      select: { username: true },
    });

    await chatService.sendMessage({
      conversationId: conv.id,
      senderId: request.fromUserId,
      senderName: sender.username,
      text: request.introText,
    });

    return res.json({ success: true, message: 'تم القبول', conversationId: conv.id });
  }

  if (action === 'BLOCK') {
    await prisma.$transaction([
      prisma.messageRequest.update({
        where: { id },
        data: { status: 'DECLINED', respondedAt: new Date() },
      }),
      prisma.blockedUser.upsert({
        where: {
          blockerId_blockedId: { blockerId: userId, blockedId: request.fromUserId },
        },
        update: {},
        create: { blockerId: userId, blockedId: request.fromUserId },
      }),
    ]);

    return res.json({ success: true, message: 'تم الحظر' });
  }

  await prisma.messageRequest.update({
    where: { id },
    data: { status: 'DECLINED', respondedAt: new Date() },
  });

  res.json({ success: true, message: 'تم الرفض' });
});

//////////////////////////////////////////////////////
// بدء محادثة
//////////////////////////////////////////////////////

export const startConversation = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { targetUserId, text, clientMessageId } = req.body ?? {};

  await chatService.assertNotFocusing(userId);

  if (!targetUserId || targetUserId === userId) {
    throw badRequest('مستخدم غير صالح');
  }

  /** ️ رفض لا تحويل — String({}) = "[object Object]" */
  const trimmed = v.requireString(text, 'نص الرسالة', { max: CHAT.MAX_LENGTH });

  const check = await chatService.canMessageDirectly(userId, targetUserId);

  if (!check.allowed && check.reason === 'BLOCKED') {
    throw forbidden('لا يمكن مراسلة هذا المستخدم', 'BLOCKED');
  }

  // ═══ نظام انستقرام (قرار المالك): أول رسالة لغير صديق = طلب صداقة ═══
  if (!check.allowed && check.reason === 'NEEDS_FRIENDSHIP') {
    const result = await friendshipService.createFriendRequest({
      fromUserId: userId,
      toUserId: targetUserId,
    });

    if (!result.ok) {
      if (result.code === 'DAILY_FRIEND_REQUESTS_EXHAUSTED') {
        return res.status(429).json({
          success: false,
          code: 'DAILY_FRIEND_REQUESTS_EXHAUSTED',
          message: 'وصلت للحد الأقصى لطلبات الصداقة اليوم (10/10)',
        });
      }
      if (result.code === 'ALREADY_FRIENDS') {
        throw conflict('أنتما صديقان بالفعل', 'ALREADY_FRIENDS');
      }
      if (result.code === 'REQUEST_PENDING') {
        throw conflict('طلب الصداقة موجود بالفعل بانتظار الرد', 'REQUEST_PENDING');
      }
      throw badRequest('تعذر إرسال طلب الصداقة');
    }

    // حفظ نص الرسالة الأولى مع الطلب
    await prisma.friendship.update({
      where: { id: result.friendship.id },
      data: { introText: trimmed },
    });

    await prisma.notification.create({
      data: {
        userId: targetUserId,
        type: 'MESSAGE_REQUEST',
        title: 'طلب صداقة جديد',
        body: `${req.user.username} أرسل لك طلب صداقة: "${trimmed.slice(0, 80)}"`,
      },
    });

    return res.status(201).json({
      success: true,
      isFriendRequest: true,
      friendshipId: result.friendship.id,
      message: 'أُرسل طلب الصداقة — انتظر الموافقة لبدء المحادثة',
      remainingToday: result.remainingToday,
    });
  }

  // مفتاح عدم التكرار اللحظي العام
  if (clientMessageId) {
    const cached = await chatService.checkMessageIdempotency(userId, clientMessageId);
    if (cached) {
      return res.status(200).json({
        success: true,
        conversationId: check.conversationId || cached.conversationId,
        message: cached,
        isDuplicate: true,
      });
    }
  }

  // محادثة قائمة — نرسل مباشرة مع فحص عدم التكرار
  if (check.conversationId) {
    const message = await chatService.sendMessage({
      conversationId: check.conversationId,
      senderId: userId,
      senderName: req.user.username,
      text: trimmed,
    });

    if (clientMessageId) {
      await chatService.recordMessageIdempotency(userId, clientMessageId, message);
    }

    return res.json({
      success: true,
      conversationId: check.conversationId,
      message,
    });
  }

  // مسموح مباشرة (عشيرة خاصة مشتركة أو بروفايل مفتوح)
  if (check.allowed) {
    const conv = await chatService.createDirectConversation(userId, targetUserId);
    const message = await chatService.sendMessage({
      conversationId: conv.id,
      senderId: userId,
      senderName: req.user.username,
      text: trimmed,
    });

    if (clientMessageId) {
      await chatService.recordMessageIdempotency(userId, clientMessageId, message);
    }

    return res.status(201).json({
      success: true,
      conversationId: conv.id,
      message,
      via: check.reason,
    });
  }

  // يحتاج طلب مراسلة — ضمن الحد اليومي
  const quota = await presence.checkDailyNewChats(userId, LIMITS.DAILY_NEW_CHATS);

  if (!quota.allowed) {
    throw forbidden(
      `وصلت للحد الأقصى للتواصل مع أعضاء جدد اليوم (${LIMITS.DAILY_NEW_CHATS}/${LIMITS.DAILY_NEW_CHATS})  حافظ على تركيزك، ويمكنك التعرف على أعضاء جدد غداً`,
      'DAILY_NEW_CHATS_EXHAUSTED',
    );
  }

  const existingReq = await prisma.messageRequest.findUnique({
    where: { fromUserId_toUserId: { fromUserId: userId, toUserId: targetUserId } },
  });

  if (existingReq) {
    if (existingReq.status === 'PENDING') {
      throw conflict('لديك طلب معلّق بالفعل', 'REQUEST_PENDING');
    }
    if (existingReq.status === 'DECLINED') {
      throw forbidden('تم رفض طلبك السابق', 'REQUEST_DECLINED');
    }
  }

  const request = await prisma.messageRequest.create({
    data: { fromUserId: userId, toUserId: targetUserId, introText: trimmed },
  });

  await Promise.all([
    presence.incrementNewChats(userId),
    prisma.notification.create({
      data: {
        userId: targetUserId,
        type: 'MESSAGE_REQUEST',
        title: '️ طلب مراسلة جديد',
        body: `${req.user.username} يريد التواصل معك`,
        data: { requestId: request.id },
      },
    }),
  ]);

  res.status(201).json({
    success: true,
    isRequest: true,
    message: 'أُرسل طلب المراسلة — سيصلك رد قريباً',
    remaining: quota.remaining - 1,
  });
});

//////////////////////////////////////////////////////
// الرسائل
//////////////////////////////////////////////////////

export const getMessages = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { conversationId } = req.params;
  const { before, limit } = req.query;

  await chatService.assertAccess(conversationId, userId);

  const messages = await chatService.getMessages(conversationId, {
    before,
    limit: Number(limit) || undefined,
  });

  // تعليم المقروء بتحديث وقت آخر قراءة للمستخدم في المحادثة (استعلام O(1) سريع بلا مسح لمصفوفات الرسائل)
  await prisma.conversationParticipant.updateMany({
    where: { conversationId, userId },
    data: { lastReadAt: new Date() },
  });

  await prisma.conversationParticipant.updateMany({
    where: { conversationId, userId },
    data: { lastReadAt: new Date() },
  });

  res.json({
    success: true,
    messages,
    hasMore: messages.length >= (Number(limit) || CHAT.PAGE_SIZE),
  });
});

export const sendMessage = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { conversationId } = req.params;
  const { text, replyToId, clientMessageId } = req.body ?? {};

  await chatService.assertNotFocusing(userId);

  const conv = await chatService.assertAccess(conversationId, userId);
  await chatService.enforceLimits(userId, conv);

  // مفتاح عدم التكرار اللحظي — حماية ضد شبكات الهاتف الضعيفة
  if (clientMessageId) {
    const cached = await chatService.checkMessageIdempotency(userId, clientMessageId);
    if (cached) {
      return res.status(200).json({ success: true, message: cached, isDuplicate: true });
    }
  }

  const message = await chatService.sendMessage({
    conversationId,
    senderId: userId,
    senderName: req.user.username,
    text,
    replyToId,
  });

  if (clientMessageId) {
    await chatService.recordMessageIdempotency(userId, clientMessageId, message);
  }

  // البث اللحظي — إن كان Socket.io مهيّأً
  try {
    req.app?.get?.('io')?.of?.('/chat')?.to?.(conversationId)?.emit?.('new_message', message);
  } catch {
    /* تجاهل في بيئة الاختبار إذا لم يكن السوكت مربوطاً */
  }

  res.status(201).json({ success: true, message });
});

export const editMessage = asyncHandler(async (req, res) => {
  const { messageId } = req.params;
  const { text } = req.body ?? {};

  /** ️ رفض لا تحويل — String({}) = "[object Object]" */
  const trimmed = v.requireString(text, 'نص الرسالة', { max: CHAT.MAX_LENGTH });

  const existing = await prisma.message.findUnique({ where: { id: messageId } });
  if (!existing) throw notFound('الرسالة غير موجودة');
  if (existing.senderId !== req.user.userId) {
    throw forbidden('لا يمكنك تعديل رسالة غيرك');
  }

  const message = await prisma.message.update({
    where: { id: messageId },
    data: {
      text: trimmed.slice(0, CHAT.MAX_LENGTH),
      isEdited: true,
      editedAt: new Date(),
    },
  });

  res.json({ success: true, message });
});

export const deleteMessage = asyncHandler(async (req, res) => {
  const { messageId } = req.params;

  const existing = await prisma.message.findUnique({
    where: { id: messageId },
    select: { senderId: true },
  });
  if (!existing) throw notFound('الرسالة غير موجودة');
  if (existing.senderId !== req.user.userId) {
    throw forbidden('لا يمكنك حذف رسالة غيرك');
  }

  // حذف ناعم — يحافظ على تسلسل الردود
  await prisma.message.update({
    where: { id: messageId },
    data: { isDeleted: true, deletedAt: new Date(), text: 'رسالة محذوفة' },
  });

  res.json({ success: true, message: 'تم الحذف' });
});

export const reactToMessage = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { messageId } = req.params;
  const { emoji } = req.body ?? {};

  if (!emoji) throw badRequest('الإيموجي مطلوب');

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { id: true, conversationId: true, reactions: true },
  });
  if (!message) throw notFound('الرسالة غير موجودة');

  await chatService.assertAccess(message.conversationId, userId);

  /**
   * ️ التفاعلات JSONB — نقرأها ونكتبها ككائن كامل.
   *
   *  قاعدة المنتج: تفاعل واحد لكل مستخدم. تكرار نفس الإيموجي
   *  يزيله (toggle)، وإيموجي مختلف يستبدل السابق.
   */
  const current = Array.isArray(message.reactions) ? message.reactions : [];
  const hasSame = current.some((r) => r.userId === userId && r.emoji === emoji);

  const reactions = hasSame
    ? current.filter((r) => !(r.userId === userId && r.emoji === emoji))
    : [...current.filter((r) => r.userId !== userId), { userId, emoji }];

  await prisma.message.update({ where: { id: messageId }, data: { reactions } });

  res.json({ success: true, reactions });
});

//////////////////////////////////////////////////////
// البحث والاكتشاف
//////////////////////////////////////////////////////

export const searchUsers = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { q, domain, specialty, interest, limit } = req.query;

  if (domain && !DOMAINS.includes(domain)) {
    throw badRequest(`مجال غير صالح. المتاح: ${DOMAINS.join(' · ')}`);
  }
  if (interest && !DOMAINS.includes(interest)) {
    throw badRequest(`اهتمام غير صالح. المتاح: ${DOMAINS.join(' · ')}`);
  }

  const take = Math.min(Number(limit) || 20, 50);

  const blocked = await prisma.blockedUser.findMany({
    where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    select: { blockerId: true, blockedId: true },
  });

  const excludeIds = new Set([userId]);
  blocked.forEach((b) => {
    excludeIds.add(b.blockerId);
    excludeIds.add(b.blockedId);
  });

  const where = {
    id: { notIn: [...excludeIds] },
    isBanned: false,
    onboarded: true,
    ...(domain ? { domain } : {}),
    ...(specialty ? { specialty } : {}),
    ...(interest ? { interests: { has: interest } } : {}),
    ...(q
      ? { username: { contains: String(q).trim(), mode: 'insensitive' } }
      : {}),
  };

  // البحث في جدول المستخدمين — أخطر استعلام في التطبيق.
  // بلا حد يمسح مليون صف عند كل حرف يكتبه المستخدم.
  const searchLimit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));

  const users = await prisma.user.findMany({
    where,
    take: searchLimit,
    select: {
      id: true,
      username: true,
      profileImage: true,
      domain: true,
      specialty: true,
      bio: true,
      totalFocusMin: true,
      showcaseIds: true,
      privacyLevel: true,
    },
    orderBy: { totalFocusMin: 'desc' },
    take,
  });

  const presenceMap = await presence.getPresenceMap(users.map((u) => u.id));

  res.json({
    success: true,
    total: users.length,
    filters: { domains: DOMAINS, specialties: SPECIALTIES },
    users: users.map((u) => ({
      id: u.id,
      username: u.username,
      profileImage: u.profileImage,
      domain: u.domain,
      specialty: u.specialty,
      bio: u.bio,
      focusHours: Math.round((u.totalFocusMin / 60) * 10) / 10,
      badges: u.showcaseIds,
      isOnline: presenceMap[u.id] ?? false,
      canMessage: u.privacyLevel !== 'CLAN_ONLY',
    })),
  });
});

//////////////////////////////////////////////////////
// الخصوصية
//////////////////////////////////////////////////////

export const updatePrivacy = asyncHandler(async (req, res) => {
  const { privacyLevel } = req.body ?? {};

  if (!['EVERYONE', 'REQUESTS_ONLY', 'CLAN_ONLY'].includes(privacyLevel)) {
    throw badRequest('مستوى خصوصية غير صالح');
  }

  await prisma.user.update({
    where: { id: req.user.userId },
    data: { privacyLevel },
  });

  res.json({ success: true, privacyLevel });
});

export const blockUser = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { targetUserId, reason } = req.body ?? {};

  if (!targetUserId || targetUserId === userId) {
    throw badRequest('مستخدم غير صالح');
  }

  await prisma.blockedUser.upsert({
    where: { blockerId_blockedId: { blockerId: userId, blockedId: targetUserId } },
    update: { reason: reason ?? null },
    create: { blockerId: userId, blockedId: targetUserId, reason: reason ?? null },
  });

  res.json({ success: true, message: 'تم الحظر' });
});

export const unblockUser = asyncHandler(async (req, res) => {
  const { targetUserId } = req.params;

  const { count } = await prisma.blockedUser.deleteMany({
    where: { blockerId: req.user.userId, blockedId: targetUserId },
  });

  if (count === 0) throw notFound('هذا المستخدم غير محظور');

  res.json({ success: true, message: 'تم رفع الحظر' });
});

export const listBlocked = asyncHandler(async (req, res) => {
  const blocked = await prisma.blockedUser.findMany({
    where: { blockerId: req.user.userId },
    include: {
      blocked: { select: { id: true, username: true, profileImage: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({
    success: true,
    blocked: blocked.map((b) => ({ ...b.blocked, blockedAt: b.createdAt })),
  });
});

//////////////////////////////////////////////////////
// الإبلاغ عن رسالة محددة / إبلاغ وحظر فوري
//////////////////////////////////////////////////////

export const reportMessage = asyncHandler(async (req, res) => {
  const reporterId = req.user.userId;
  const { messageId } = req.params;
  const { reason, details } = req.body ?? {};

  const result = await chatService.reportMessage({
    reporterId,
    messageId,
    reason,
    details,
    andBlock: false,
  });

  res.status(201).json(result);
});

export const reportAndBlockMessage = asyncHandler(async (req, res) => {
  const reporterId = req.user.userId;
  const { messageId } = req.params;
  const { reason, details } = req.body ?? {};

  const result = await chatService.reportMessage({
    reporterId,
    messageId,
    reason,
    details,
    andBlock: true,
  });

  res.status(201).json(result);
});
