/**
 * ═══════════════════════════════════════════════════════════
 *  كنترولر الصداقة والكتم — «بال»
 *  نظام انستقرام: الصداقة شرط المراسلة · حد 10 طلبات/يوم
 * ═══════════════════════════════════════════════════════════
 */
import prisma from '../../config/prisma.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { badRequest, notFound } from '../../utils/AppError.js';
import friendshipService from '../../services/friendship.service.js';

/** قائمة أصدقائي */
export const myFriends = asyncHandler(async (req, res) => {
  const friends = await friendshipService.listFriends(req.user.userId);
  return res.json({ success: true, count: friends.length, friends });
});

/** طلبات الصداقة الواردة */
export const incomingRequests = asyncHandler(async (req, res) => {
  const requests = await friendshipService.listIncomingRequests(req.user.userId);
  return res.json({ success: true, count: requests.length, requests });
});

/** إرسال طلب صداقة */
export const sendFriendRequest = asyncHandler(async (req, res) => {
  const { targetUserId } = req.params;

  if (!targetUserId || targetUserId === req.user.userId) {
    throw badRequest('مستخدم غير صالح');
  }

  const target = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!target || target.isBanned) throw notFound('المستخدم غير موجود');

  const result = await friendshipService.createFriendRequest({
    fromUserId: req.user.userId,
    toUserId: targetUserId,
  });

  if (!result.ok) {
    const codes = {
      ALREADY_FRIENDS: 'أنتما صديقان بالفعل',
      REQUEST_PENDING: 'طلب الصداقة موجود بالفعل بانتظار الرد',
      DAILY_FRIEND_REQUESTS_EXHAUSTED: 'وصلت للحد الأقصى لطلبات الصداقة اليوم (10/10)',
      INVALID_TARGET: 'مستخدم غير صالح',
    };
    return res.status(result.code === 'DAILY_FRIEND_REQUESTS_EXHAUSTED' ? 429 : 400).json({
      success: false,
      code: result.code,
      message: codes[result.code] || 'تعذر إرسال الطلب',
    });
  }

  return res.status(201).json({
    success: true,
    message: 'تم إرسال طلب الصداقة',
    remainingToday: result.remainingToday,
  });
});

/** قبول / رفض طلب صداقة */
export const respondToFriendRequest = asyncHandler(async (req, res) => {
  const { requestId } = req.params;
  const { action } = req.body ?? {};

  if (!['ACCEPT', 'DECLINE'].includes(action)) {
    throw badRequest('الإجراء يجب أن يكون ACCEPT أو DECLINE');
  }

  if (action === 'ACCEPT') {
    const r = await friendshipService.acceptFriendRequest({
      friendshipId: requestId,
      userId: req.user.userId,
    });
    if (!r.ok) throw notFound('الطلب غير موجود');

    // إنشاء المحادثة + أول رسالة (نص الطلب) في معاملة واحدة
    const { createDirectConversation, sendMessage } = await import('../../services/chat.service.js');
    const sender = await prisma.user.findUnique({
      where: { id: r.friendship.fromUserId },
      select: { username: true },
    });
    const conv = await createDirectConversation(req.user.userId, r.friendship.fromUserId);
    if (r.friendship.introText) {
      await sendMessage({
        conversationId: conv.id,
        senderId: r.friendship.fromUserId,
        senderName: sender?.username || 'رفيق',
        text: r.friendship.introText,
      });
    }

    return res.json({
      success: true,
      message: 'صار صديقاً — المحادثة مفتوحة الآن',
      conversationId: conv.id,
    });
  }

  const r = await friendshipService.declineFriendRequest({
    friendshipId: requestId,
    userId: req.user.userId,
  });
  if (!r.ok) throw notFound('الطلب غير موجود');
  return res.json({ success: true, message: 'تم رفض الطلب' });
});

/** إلغاء صداقة */
export const unfriend = asyncHandler(async (req, res) => {
  const { friendId } = req.params;
  await friendshipService.removeFriendship({ userA: req.user.userId, userB: friendId });
  return res.json({ success: true, message: 'تم إلغاء الصداقة' });
});

// ═══════════════ الكتم (Mute) ═══════════════

export const muteUser = asyncHandler(async (req, res) => {
  const { targetUserId } = req.params;
  const r = await friendshipService.muteUser(req.user.userId, targetUserId);
  if (!r.ok) throw badRequest('مستخدم غير صالح');
  return res.json({ success: true, message: 'تم كتم إشعارات المستخدم' });
});

export const unmuteUser = asyncHandler(async (req, res) => {
  const { targetUserId } = req.params;
  await friendshipService.unmuteUser(req.user.userId, targetUserId);
  return res.json({ success: true, message: 'تم فك الكتم' });
});

export const myMuted = asyncHandler(async (req, res) => {
  const muted = await friendshipService.listMuted(req.user.userId);
  return res.json({ success: true, muted });
});
