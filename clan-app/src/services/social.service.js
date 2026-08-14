import prisma from '../config/prisma.js';
import * as userCache from './userCache.service.js';
import * as notificationService from './notification.service.js';
import * as analyticsService from './analytics.service.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/AppError.js';
import { scoped } from '../config/logger.js';

const log = scoped('social-service');

/**
 * ════════════════════════════════════════════════════════════
 *  منظومة التواصل الاجتماعي والخصوصية — Social & Privacy Graph
 * ════════════════════════════════════════════════════════════
 *
 *  الوحدات:
 *   ١. إعدادات الخصوصية والحسابات الخاصة (Private Accounts & Granular Switches)
 *   ٢. شبكة المتابعة وطلبات الصداقة (Followers & Pending Requests)
 *   ٣. استعراض الملف الشخصي المخصص مع حجب البيانات المشروطة (Dynamic Privacy Redaction)
 *   ٤. البلاغات الرقابية وحظر المستخدمين (Moderation & Reports)
 *   ٥. الحالة اللحظية المخصصة والروابط (Custom Status & Social Links)
 */

//////////////////////////////////////////////////////
// 1. تحديث إعدادات الخصوصية والحساب الخاص
//////////////////////////////////////////////////////

export const updatePrivacySettings = async (userId, settings = {}) => {
  const {
    isPrivateAccount,
    showLastSeen,
    showStreak,
    showFocusHours,
    dmPrivacy,
    privacyLevel,
  } = settings;

  const data = {};
  if (typeof isPrivateAccount === 'boolean') data.isPrivateAccount = isPrivateAccount;
  if (typeof showLastSeen === 'boolean') data.showLastSeen = showLastSeen;
  if (typeof showStreak === 'boolean') data.showStreak = showStreak;
  if (typeof showFocusHours === 'boolean') data.showFocusHours = showFocusHours;
  if (dmPrivacy && ['EVERYONE', 'FOLLOWERS_ONLY', 'CLAN_ONLY', 'NOBODY'].includes(dmPrivacy)) {
    data.dmPrivacy = dmPrivacy;
  }
  if (privacyLevel && ['EVERYONE', 'REQUESTS_ONLY', 'CLAN_ONLY'].includes(privacyLevel)) {
    data.privacyLevel = privacyLevel;
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data,
    select: {
      id: true,
      username: true,
      isPrivateAccount: true,
      showLastSeen: true,
      showStreak: true,
      showFocusHours: true,
      dmPrivacy: true,
      privacyLevel: true,
    },
  });

  await userCache.invalidate(userId);
  await analyticsService.invalidateAnalytics(userId);

  return {
    success: true,
    message: 'تم تحديث إعدادات الخصوصية بنجاح ',
    privacy: updated,
  };
};

//////////////////////////////////////////////////////
// 2. تحديث الحالة اللحظية والروابط الاجتماعية
//////////////////////////////////////////////////////

export const updateCustomStatus = async (userId, { customStatus, statusEmoji, socialLinks, bio }) => {
  const data = {};
  if (customStatus !== undefined) data.customStatus = customStatus ? String(customStatus).trim().slice(0, 100) : null;
  if (statusEmoji !== undefined) data.statusEmoji = statusEmoji ? String(statusEmoji).trim().slice(0, 10) : null;
  if (bio !== undefined) data.bio = bio ? String(bio).trim().slice(0, 250) : null;
  if (socialLinks !== undefined && typeof socialLinks === 'object') {
    data.socialLinks = socialLinks;
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data,
    select: {
      id: true,
      username: true,
      bio: true,
      customStatus: true,
      statusEmoji: true,
      socialLinks: true,
    },
  });

  await userCache.invalidate(userId);

  return {
    success: true,
    message: 'تم تحديث الحالة والبروفايل بنجاح ',
    profile: updated,
  };
};

//////////////////////////////////////////////////////
// 3. متابعة مستخدم / إرسال طلب متابعة
//////////////////////////////////////////////////////

export const followUser = async (followerId, targetUserId) => {
  if (followerId === targetUserId) {
    throw badRequest('لا يمكنك متابعة حسابك الشخصي');
  }

  // التحقق من وجود المستخدم المستهدف
  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, username: true, isPrivateAccount: true, isBanned: true },
  });

  if (!target || target.isBanned) throw notFound('المستخدم غير موجود');

  // التحقق من عدم وجود حظر متبادل
  const isBlocked = await prisma.blockedUser.findFirst({
    where: {
      OR: [
        { blockerId: followerId, blockedId: targetUserId },
        { blockerId: targetUserId, blockedId: followerId },
      ],
    },
  });

  if (isBlocked) throw forbidden('لا يمكنك متابعة هذا المستخدم', 'BLOCKED');

  // التحقق من العلاقة الحالية
  const existing = await prisma.follow.findUnique({
    where: {
      followerId_followingId: { followerId, followingId: targetUserId },
    },
  });

  if (existing) {
    if (existing.status === 'ACCEPTED') {
      throw conflict('أنت تتابع هذا الحساب بالفعل', 'ALREADY_FOLLOWING');
    }
    if (existing.status === 'PENDING') {
      throw conflict('طلب المتابعة معلق بانتظار موافقة صاحب الحساب', 'REQUEST_ALREADY_SENT');
    }
  }

  // إذا كان الحساب خاصاً -> طلب معلق (PENDING)
  if (target.isPrivateAccount) {
    const followReq = await prisma.follow.create({
      data: {
        followerId,
        followingId: targetUserId,
        status: 'PENDING',
      },
    });

    // إرسال إشعار للمستهدف
    await notificationService.sendNotification(targetUserId, {
      type: 'MESSAGE_REQUEST',
      title: 'طلب متابعة جديد ',
      body: `أرسل لك أحد المستخدمين طلب متابعة لحسابك الخاص`,
      data: { followId: followReq.id, followerId },
    }).catch(() => {});

    return {
      success: true,
      status: 'PENDING',
      message: 'حساب خاص  تم إرسال طلب المتابعة بنجاح بانتظار موافقة صاحب الحساب',
    };
  }

  // إذا كان الحساب عاماً -> متابعة مباشرة (ACCEPTED)
  await prisma.$transaction(async (tx) => {
    await tx.follow.create({
      data: {
        followerId,
        followingId: targetUserId,
        status: 'ACCEPTED',
      },
    });

    await tx.user.update({
      where: { id: targetUserId },
      data: { followersCount: { increment: 1 } },
    });

    await tx.user.update({
      where: { id: followerId },
      data: { followingCount: { increment: 1 } },
    });
  });

  await notificationService.sendNotification(targetUserId, {
    type: 'ENCOURAGEMENT',
    title: 'متابع جديد ',
    body: `قام مستخدم جديد بمتابعة حسابك`,
    data: { followerId },
  }).catch(() => {});

  return {
    success: true,
    status: 'ACCEPTED',
    message: `أنت الآن تتابع ${target.username} بنجاح!`,
  };
};

//////////////////////////////////////////////////////
// 4. إلغاء المتابعة / سحب الطلب المعلق
//////////////////////////////////////////////////////

export const unfollowUser = async (followerId, targetUserId) => {
  const existing = await prisma.follow.findUnique({
    where: {
      followerId_followingId: { followerId, followingId: targetUserId },
    },
  });

  if (!existing) {
    throw badRequest('أنت لا تتابع هذا المستخدم');
  }

  await prisma.$transaction(async (tx) => {
    await tx.follow.delete({
      where: { followerId_followingId: { followerId, followingId: targetUserId } },
    });

    if (existing.status === 'ACCEPTED') {
      await tx.user.update({
        where: { id: targetUserId },
        data: { followersCount: { decrement: 1 } },
      });
      await tx.user.update({
        where: { id: followerId },
        data: { followingCount: { decrement: 1 } },
      });
    }
  });

  return {
    success: true,
    message: existing.status === 'PENDING' ? 'تم سحب وإلغاء طلب المتابعة' : 'تم إلغاء المتابعة بنجاح',
  };
};

//////////////////////////////////////////////////////
// 5. قبول أو رفض طلب المتابعة (للحسابات الخاصة)
//////////////////////////////////////////////////////

export const respondToFollowRequest = async (userId, followId, action = 'ACCEPT') => {
  const follow = await prisma.follow.findUnique({
    where: { id: followId },
    include: { follower: { select: { id: true, username: true } } },
  });

  if (!follow || follow.followingId !== userId) {
    throw notFound('طلب المتابعة غير موجود');
  }

  if (follow.status !== 'PENDING') {
    throw conflict('تمت معالجة هذا الطلب مسبقاً');
  }

  if (action === 'ACCEPT') {
    await prisma.$transaction(async (tx) => {
      await tx.follow.update({
        where: { id: followId },
        data: { status: 'ACCEPTED' },
      });

      await tx.user.update({
        where: { id: userId },
        data: { followersCount: { increment: 1 } },
      });

      await tx.user.update({
        where: { id: follow.followerId },
        data: { followingCount: { increment: 1 } },
      });
    });

    await notificationService.sendNotification(follow.followerId, {
      type: 'ENCOURAGEMENT',
      title: 'تم قبول طلب المتابعة ',
      body: `وافق المستخدم على طلب متابعتك لحسابه`,
    }).catch(() => {});

    return {
      success: true,
      message: `تم قبول طلب متابعة ${follow.follower.username} بنجاح`,
    };
  } else {
    await prisma.follow.delete({ where: { id: followId } });
    return {
      success: true,
      message: 'تم رفض وحذف طلب المتابعة',
    };
  }
};

//////////////////////////////////////////////////////
// 6. استعراض طلبات المتابعة المعلقة
//////////////////////////////////////////////////////

export const listFollowRequests = async (userId) => {
  const requests = await prisma.follow.findMany({
    where: { followingId: userId, status: 'PENDING' },
    include: {
      follower: {
        select: {
          id: true,
          username: true,
          profileImage: true,
          domain: true,
          specialty: true,
          customStatus: true,
          statusEmoji: true,
          createdAt: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return {
    success: true,
    total: requests.length,
    requests: requests.map((r) => ({
      requestId: r.id,
      createdAt: r.createdAt,
      follower: r.follower,
    })),
  };
};

//////////////////////////////////////////////////////
// 7. استعراض الملف الشخصي مع حجب البيانات للحسابات الخاصة
//////////////////////////////////////////////////////

export const getUserProfile = async (viewerId, targetUserId) => {
  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    include: {
      equippedTitle: {
        select: {
          id: true,
          code: true,
          title: true,
          tier: true,
          auraEffect: true,
          glowColor: true,
          badgeIcon: true,
        },
      },
    },
  });

  if (!target || target.isBanned) throw notFound('المستخدم غير موجود');

  // التحقق من الحظر
  const isBlocked = await prisma.blockedUser.findFirst({
    where: {
      OR: [
        { blockerId: viewerId, blockedId: targetUserId },
        { blockerId: targetUserId, blockedId: viewerId },
      ],
    },
  });

  if (isBlocked) {
    throw forbidden('لا يمكنك عرض هذا الحساب', 'USER_BLOCKED');
  }

  const isMe = viewerId === targetUserId;

  let relationship = 'NOT_FOLLOWING';
  let isFollowing = false;

  if (isMe) {
    relationship = 'IS_ME';
  } else {
    const followRecord = await prisma.follow.findUnique({
      where: {
        followerId_followingId: { followerId: viewerId, followingId: targetUserId },
      },
    });

    if (followRecord) {
      relationship = followRecord.status === 'ACCEPTED' ? 'FOLLOWING' : 'REQUESTED';
      isFollowing = followRecord.status === 'ACCEPTED';
    }
  }

  // هل الحساب مقفل وخاص ولا يملكه الرائي ولا يتابعه؟
  const isRestricted = target.isPrivateAccount && !isMe && !isFollowing;

  // ═══ بيانات الصداقة (نظام انستقرام — قرار المالك) ═══
  let friendshipStatus = isMe ? 'IS_ME' : 'NOT_FRIENDS';
  let friendsCount = 0;
  if (!isMe) {
    const f = await prisma.friendship.findFirst({
      where: {
        OR: [
          { fromUserId: viewerId, toUserId: targetUserId },
          { fromUserId: targetUserId, toUserId: viewerId },
        ],
      },
    });
    if (f) friendshipStatus = f.status === 'ACCEPTED' ? 'FRIENDS' : 'PENDING';
  }
  friendsCount = await prisma.friendship.count({
    where: {
      status: 'ACCEPTED',
      OR: [{ fromUserId: targetUserId }, { toUserId: targetUserId }],
    },
  });

  const publicInfo = {
    id: target.id,
    username: target.username,
    profileImage: target.profileImage,
    bio: target.bio,
    domain: target.domain,
    specialty: target.specialty,
    interests: target.interests ?? [],
    isPrivateAccount: target.isPrivateAccount,
    customStatus: target.customStatus,
    statusEmoji: target.statusEmoji,
    socialLinks: target.socialLinks,
    followersCount: target.followersCount,
    followingCount: target.followingCount,
    equippedTitle: target.equippedTitle,
    memberSince: target.createdAt,
    relationship,
    friendshipStatus,
    friendsCount,
  };

  // إذا كان الحساب مقيداً (Private & Not Follower) -> نرجع فقط البيانات العامة ونحجب التفاصيل الحساسة
  if (isRestricted) {
    return {
      success: true,
      isRestricted: true,
      message: 'هذا الحساب خاص  تابع الحساب لرؤية إحصائياته الكاملة ونشاطه',
      profile: {
        ...publicInfo,
        totalFocusHours: null,
        currentStreak: null,
        longestStreak: null,
        sparksBalance: null,
        lastSeen: null,
      },
    };
  }

  // الحساب متاح بالكامل (عام أو متابع أو حسابه الشخصي)
  return {
    success: true,
    isRestricted: false,
    profile: {
      ...publicInfo,
      totalFocusHours: target.showFocusHours || isMe ? Math.round((target.totalFocusMin / 60) * 10) / 10 : null,
      currentStreak: target.showStreak || isMe ? target.currentStreak : null,
      longestStreak: target.showStreak || isMe ? target.longestStreak : null,
      lastSeen: target.showLastSeen || isMe ? target.lastSeen : null,
      sparksBalance: isMe ? target.sparksBalance : undefined,
      totalFocusHours: Math.round((target.totalFocusMin || 0) / 60),
      popularityScore: target.popularityScore ?? 0,
      achievements: await prisma.userAchievement.findMany({
        where: { userId: targetUserId, isUnlocked: true },
        include: { achievement: { select: { code: true, title: true, tier: true, category: true } } },
        take: 12,
      }),
    },
  };
};

//////////////////////////////////////////////////////
// 8. قائمة المتابعين والمتابَعين
//////////////////////////////////////////////////////

export const listFollowers = async (viewerId, targetUserId, { page = 1, limit = 30 } = {}) => {
  const profileRes = await getUserProfile(viewerId, targetUserId);
  if (profileRes.isRestricted) {
    throw forbidden('لا يمكنك رؤية قائمة المتابعين لحساب خاص', 'ACCOUNT_PRIVATE');
  }

  const take = Math.min(50, Math.max(1, Number(limit) || 30));
  const skip = (Math.max(1, Number(page) || 1) - 1) * take;

  const [follows, total] = await Promise.all([
    prisma.follow.findMany({
      where: { followingId: targetUserId, status: 'ACCEPTED' },
      include: {
        follower: {
          select: {
            id: true,
            username: true,
            profileImage: true,
            domain: true,
            specialty: true,
            customStatus: true,
            statusEmoji: true,
          },
        },
      },
      take,
      skip,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.follow.count({ where: { followingId: targetUserId, status: 'ACCEPTED' } }),
  ]);

  return {
    success: true,
    total,
    page: Number(page) || 1,
    limit: take,
    followers: follows.map((f) => f.follower),
  };
};

export const listFollowing = async (viewerId, targetUserId, { page = 1, limit = 30 } = {}) => {
  const profileRes = await getUserProfile(viewerId, targetUserId);
  if (profileRes.isRestricted) {
    throw forbidden('لا يمكنك رؤية قائمة المتابَعين لحساب خاص', 'ACCOUNT_PRIVATE');
  }

  const take = Math.min(50, Math.max(1, Number(limit) || 30));
  const skip = (Math.max(1, Number(page) || 1) - 1) * take;

  const [follows, total] = await Promise.all([
    prisma.follow.findMany({
      where: { followerId: targetUserId, status: 'ACCEPTED' },
      include: {
        following: {
          select: {
            id: true,
            username: true,
            profileImage: true,
            domain: true,
            specialty: true,
            customStatus: true,
            statusEmoji: true,
          },
        },
      },
      take,
      skip,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.follow.count({ where: { followerId: targetUserId, status: 'ACCEPTED' } }),
  ]);

  return {
    success: true,
    total,
    page: Number(page) || 1,
    limit: take,
    following: follows.map((f) => f.following),
  };
};

//////////////////////////////////////////////////////
// 9. الإبلاغ عن مستخدم أو محتوى مسيء (Reports & Moderation)
//////////////////////////////////////////////////////

export const createReport = async (reporterId, { targetUserId, reason, details }) => {
  if (reporterId === targetUserId) {
    throw badRequest('لا يمكنك الإبلاغ عن حسابك');
  }

  const validReasons = ['SPAM', 'HARASSMENT', 'INAPPROPRIATE', 'CHEATING', 'OTHER'];
  if (!reason || !validReasons.includes(reason)) {
    throw badRequest(`سبب البلاغ يجب أن يكون أحد الخيارات: ${validReasons.join(' · ')}`);
  }

  const target = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!target) throw notFound('المستخدم المبلغ عنه غير موجود');

  const report = await prisma.userReport.create({
    data: {
      reporterId,
      reportedId: targetUserId,
      reason,
      details: details ? String(details).trim().slice(0, 500) : null,
      status: 'PENDING',
    },
  });

  log.warn({ reporterId, targetUserId, reason }, '️ تم تسجيل بلاغ جديد للمراجعة الإدارية');

  return {
    success: true,
    message: 'تم استلام بلاغك وسيقوم فريق الإشراف بمراجعته واتخاذ الإجراء الصارم ️',
    reportId: report.id,
  };
};

//////////////////////////////////////////////////////
// 10. لوحة تحكم الإدارة للبلاغات
//////////////////////////////////////////////////////

export const listAdminReports = async ({ status = 'PENDING', page = 1, limit = 50 }) => {
  const take = Math.min(100, Math.max(1, Number(limit) || 50));
  const skip = (Math.max(1, Number(page) || 1) - 1) * take;

  const where = status ? { status } : {};

  const [reports, total] = await Promise.all([
    prisma.userReport.findMany({
      where,
      include: {
        reporter: { select: { id: true, username: true, email: true } },
        reported: { select: { id: true, username: true, email: true, isBanned: true } },
      },
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    }),
    prisma.userReport.count({ where }),
  ]);

  return { success: true, total, page: Number(page) || 1, limit: take, reports };
};

export const resolveAdminReport = async (reportId, { action = 'RESOLVED', actionNote, banUser = false }) => {
  const report = await prisma.userReport.findUnique({
    where: { id: reportId },
  });

  if (!report) throw notFound('البلاغ غير موجود');

  await prisma.userReport.update({
    where: { id: reportId },
    data: {
      status: action === 'RESOLVED' ? 'RESOLVED' : 'DISMISSED',
      actionNote: actionNote ? String(actionNote).trim() : null,
    },
  });

  if (banUser) {
    await prisma.user.update({
      where: { id: report.reportedId },
      data: { isBanned: true },
    });
    await userCache.invalidate(report.reportedId);
  }

  return {
    success: true,
    message: `تم البت في البلاغ بنجاح (${action})`,
  };
};

export default {
  updatePrivacySettings,
  updateCustomStatus,
  followUser,
  unfollowUser,
  respondToFollowRequest,
  listFollowRequests,
  getUserProfile,
  listFollowers,
  listFollowing,
  createReport,
  listAdminReports,
  resolveAdminReport,
};
