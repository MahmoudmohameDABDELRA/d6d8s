import prisma from '../../config/prisma.js';
import * as userCache from '../../services/userCache.service.js';
import * as sparksService from '../../services/sparks.service.js';
import * as titleEngine from '../../services/titleEngine.service.js';
import * as notificationService from '../../services/notification.service.js';
import * as analyticsService from '../../services/analytics.service.js';
import * as growthMetricsService from '../../services/growthMetrics.service.js';
import redisClient from '../../config/redis.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { badRequest, conflict, forbidden, notFound } from '../../utils/AppError.js';
import { scoped } from '../../config/logger.js';

const log = scoped('admin-master');

/**
 * ════════════════════════════════════════════════════════════
 *  لوحة التحكم والسيطرة المطلقة — Master Admin Controller
 * ════════════════════════════════════════════════════════════
 *
 *  جميع المسارات محمية بـ authenticateToken + requireAdmin.
 */

//////////////////////////////////////////////////////
// 1. إحصائيات النظام الشاملة والفحص العميق
//////////////////////////////////////////////////////

export const getDashboardStats = asyncHandler(async (req, res) => {
  const [
    totalUsers,
    bannedUsers,
    onboardedUsers,
    activeSessions,
    totalClans,
    totalTasks,
    totalReports,
    pendingReports,
    sparksAgg,
    aiTokensAgg,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isBanned: true } }),
    prisma.user.count({ where: { onboarded: true } }),
    prisma.focusSession.count({ where: { status: 'ACTIVE' } }),
    prisma.clan.count(),
    prisma.task.count(),
    prisma.userReport.count(),
    prisma.userReport.count({ where: { status: 'PENDING' } }),
    prisma.user.aggregate({
      _sum: { sparksBalance: true, totalSparksEarned: true },
    }),
    prisma.aiUsageLog.aggregate({
      _sum: { tokensUsed: true, messageCount: true },
    }),
  ]);

  let redisOk = false;
  try {
    redisOk = Boolean(redisClient?.isOpen);
  } catch {
    redisOk = false;
  }

  res.json({
    success: true,
    stats: {
      users: {
        total: totalUsers,
        banned: bannedUsers,
        onboarded: onboardedUsers,
        active: totalUsers - bannedUsers,
      },
      activity: {
        activeFocusSessions: activeSessions,
        totalClans,
        totalTasks,
      },
      moderation: {
        totalReports,
        pendingReports,
      },
      economy: {
        circulatingSparks: sparksAgg._sum?.sparksBalance ?? 0,
        totalEarnedSparks: sparksAgg._sum?.totalSparksEarned ?? 0,
      },
      ai: {
        totalTokensConsumed: aiTokensAgg._sum?.tokensUsed ?? 0,
        messageCount: aiTokensAgg._sum?.messageCount ?? 0,
      },
      system: {
        uptimeSeconds: process.uptime(),
        nodeMemoryBytes: process.memoryUsage().rss,
        heapUsedBytes: process.memoryUsage().heapUsed,
        redisConnected: redisOk,
      },
    },
  });
});

export const getSystemDeepHealth = asyncHandler(async (req, res) => {
  let redisMemory = 'N/A';
  let totalRedisKeys = 0;
  if (redisClient?.isOpen) {
    try {
      const info = await redisClient.info('memory');
      redisMemory = info.match(/used_memory_human:(.*)/)?.[1]?.trim() || 'N/A';
      totalRedisKeys = await redisClient.dbsize();
    } catch {}
  }

  const [dbPing] = await Promise.all([
    prisma.$queryRaw`SELECT 1 as ping, NOW() as current_time`,
  ]);

  res.json({
    success: true,
    system: {
      nodeVersion: process.version,
      platform: process.platform,
      uptime: process.uptime(),
      memory: {
        rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`,
        heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`,
        heapTotal: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)} MB`,
      },
      redis: {
        status: redisClient?.isOpen ? 'CONNECTED' : 'DISCONNECTED',
        usedMemory: redisMemory,
        totalKeys: totalRedisKeys,
      },
      postgres: {
        status: 'HEALTHY',
        serverTime: dbPing?.[0]?.current_time || new Date(),
      },
    },
  });
});

export const flushAllCache = asyncHandler(async (req, res) => {
  if (redisClient?.isOpen) {
    const keys = await redisClient.keys('*');
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
  }
  res.json({ success: true, message: 'تم إفراغ كاش النظام بالكامل من Redis بنجاح' });
});

export const sendSystemBroadcast = asyncHandler(async (req, res) => {
  const { title, message, priority = 'NORMAL', targetDomain } = req.body ?? {};

  if (!title || !message) {
    throw badRequest('العنوان والرسالة حقول إلزامية للبث الإداري');
  }

  const io = req.app.get('io');
  const payload = {
    title: String(title).trim(),
    message: String(message).trim(),
    priority,
    sentBy: req.user.username,
    targetDomain: targetDomain || 'ALL',
    timestamp: new Date().toISOString(),
  };

  // بث عبر Socket.io اللحظي لجميع المشتركين
  if (io) {
    io.of('/chat').emit('system_broadcast_announcement', payload);
  }

  log.warn({ adminId: req.user.userId, title, targetDomain }, ' تم إرسال بث إداري شامل للمنظومة');

  res.json({
    success: true,
    message: 'تم إرسال البث الإداري الشامل لجميع المستخدمين المتصلين بنجاح',
    broadcast: payload,
  });
});

//////////////////////////////////////////////////////
// 2. إدارة المستخدمين والتفتيش العميق (Users God-Mode)
//////////////////////////////////////////////////////

export const listUsers = asyncHandler(async (req, res) => {
  const { page = 1, limit = 50, search, domain, isBanned, role } = req.query;

  const pageNum = Math.max(1, Number(page) || 1);
  const take = Math.min(100, Math.max(1, Number(limit) || 50));
  const skip = (pageNum - 1) * take;

  const where = {};

  if (search) {
    where.OR = [
      { username: { contains: String(search).trim() } },
      { email: { contains: String(search).trim().toLowerCase() } },
    ];
  }

  if (domain) where.domain = domain;
  if (isBanned !== undefined) where.isBanned = isBanned === 'true';
  if (role) where.role = role;

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        username: true,
        email: true,
        domain: true,
        specialty: true,
        role: true,
        isBanned: true,
        isPrivateAccount: true,
        onboarded: true,
        sparksBalance: true,
        totalSparksEarned: true,
        totalFocusMin: true,
        currentStreak: true,
        followersCount: true,
        followingCount: true,
        createdAt: true,
        lastSeen: true,
      },
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    }),
    prisma.user.count({ where }),
  ]);

  res.json({
    success: true,
    total,
    page: pageNum,
    limit: take,
    hasMore: skip + users.length < total,
    users,
  });
});

export const inspectUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      equippedTitle: true,
      subscription: true,
      _count: {
        select: {
          focusSessions: true,
          tasks: true,
          journalEntries: true,
          goals: true,
          sparkTx: true,
          achievements: true,
          titles: true,
          followers: true,
          following: true,
          reportsReceived: true,
          devices: true,
        },
      },
    },
  });

  if (!user) throw notFound('المستخدم غير موجود');

  // جلب عينات من آخر الأنشطة
  const [recentSessions, recentTasks, recentSparkTx, titles] = await Promise.all([
    prisma.focusSession.findMany({
      where: { userId },
      orderBy: { startedAt: 'desc' },
      take: 5,
    }),
    prisma.task.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    prisma.sparkTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    prisma.userTitle.findMany({
      where: { userId },
      include: { title: true },
    }),
  ]);

  res.json({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      domain: user.domain,
      specialty: user.specialty,
      isBanned: user.isBanned,
      isPrivateAccount: user.isPrivateAccount,
      onboarded: user.onboarded,
      sparksBalance: user.sparksBalance,
      totalSparksEarned: user.totalSparksEarned,
      totalFocusMin: user.totalFocusMin,
      totalFocusHours: Math.round((user.totalFocusMin / 60) * 10) / 10,
      currentStreak: user.currentStreak,
      longestStreak: user.longestStreak,
      shieldsRemaining: user.shieldsRemaining,
      bonusAiMessages: user.bonusAiMessages,
      unlockedAudioSlots: user.unlockedAudioSlots,
      equippedTitle: user.equippedTitle,
      subscription: user.subscription,
      statsCounts: user._count,
      createdAt: user.createdAt,
      lastSeen: user.lastSeen,
    },
    activities: {
      recentSessions,
      recentTasks,
      recentSparkTx,
      titlesHolding: titles.map((t) => ({
        code: t.title.code,
        title: t.title.title,
        isUnlocked: t.isUnlocked,
        unlockedAt: t.unlockedAt,
      })),
    },
  });
});

export const toggleUserBan = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { isBanned, reason } = req.body ?? {};

  if (typeof isBanned !== 'boolean') {
    throw badRequest('الحقل isBanned يجب أن يكون boolean');
  }

  if (userId === req.user.userId) {
    throw forbidden('لا يمكنك حظر حسابك الإداري');
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, role: true },
  });

  if (!user) throw notFound('المستخدم غير موجود');

  if (user.role === 'ADMIN' && isBanned) {
    throw forbidden('لا يمكن حظر حساب إداري عبر الواجهة');
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { isBanned },
  });

  await userCache.invalidate(userId);

  if (isBanned) {
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  log.info({ adminId: req.user.userId, targetUserId: userId, isBanned, reason }, 'تم تعديل حالة الحظر');

  res.json({
    success: true,
    message: isBanned ? 'تم حظر المستخدم وإبطال جلساته' : 'تم رفع الحظر عن المستخدم',
    user: { id: updated.id, username: updated.username, isBanned: updated.isBanned },
  });
});

export const setUserRole = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { role } = req.body ?? {};

  if (!['USER', 'ADMIN'].includes(role)) {
    throw badRequest('الدور يجب أن يكون USER أو ADMIN');
  }

  if (userId === req.user.userId && role !== 'ADMIN') {
    throw forbidden('لا يمكنك سحب صلاحية الأدمن من نفسك');
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound('المستخدم غير موجود');

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { role },
  });

  await userCache.invalidate(userId);

  res.json({
    success: true,
    message: `تم تعديل الرتبة إلى ${role}`,
    user: { id: updated.id, username: updated.username, role: updated.role },
  });
});

export const adjustUserSparks = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { amount, reason, note } = req.body ?? {};

  const numAmount = Number(amount);
  if (!Number.isInteger(numAmount) || numAmount === 0) {
    throw badRequest('amount يجب أن يكون عدداً صحيحاً لا يساوي صفراً');
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound('المستخدم غير موجود');

  let result;
  if (numAmount > 0) {
    result = await sparksService.award(userId, {
      source: 'ADMIN_ADJUSTMENT',
      baseAmount: numAmount,
      note: reason || note || `تعديل إداري بواسطة المشرف ${req.user.username}`,
    });
  } else {
    result = await sparksService.spend(userId, {
      source: 'ADMIN_ADJUSTMENT',
      amount: Math.abs(numAmount),
      note: reason || note || `خصم إداري بواسطة المشرف ${req.user.username}`,
    });
  }

  res.json({
    success: true,
    message: 'تم تعديل رصيد الشرارات بنجاح',
    adjustment: numAmount,
    newBalance: result.balance,
  });
});

export const adjustUserStreak = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { currentStreak, longestStreak, shieldsRemaining } = req.body ?? {};

  const data = {};
  if (typeof currentStreak === 'number') data.currentStreak = Math.max(0, currentStreak);
  if (typeof longestStreak === 'number') data.longestStreak = Math.max(0, longestStreak);
  if (typeof shieldsRemaining === 'number') data.shieldsRemaining = Math.max(0, shieldsRemaining);

  const updated = await prisma.user.update({
    where: { id: userId },
    data,
    select: {
      id: true,
      username: true,
      currentStreak: true,
      longestStreak: true,
      shieldsRemaining: true,
    },
  });

  await userCache.invalidate(userId);
  await analyticsService.invalidateAnalytics(userId);

  res.json({
    success: true,
    message: 'تم تعديل بيانات السلسلة والدروع بنجاح',
    user: updated,
  });
});

export const grantUserSubscription = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { plan = 'PRO', durationDays = 30 } = req.body ?? {};

  const validPlans = ['FREE', 'BASIC', 'PRO', 'HIGH'];
  if (!validPlans.includes(plan)) {
    throw badRequest(`الباقة يجب أن تكون أحد الخيارات: ${validPlans.join(' · ')}`);
  }

  const now = new Date();
  const endDate = new Date(now.getTime() + (Number(durationDays) || 30) * 24 * 3600 * 1000);

  const sub = await prisma.subscription.upsert({
    where: { userId },
    update: {
      plan,
      status: 'ACTIVE',
      currentPeriodEnd: endDate,
    },
    create: {
      userId,
      plan,
      status: 'ACTIVE',
      currentPeriodStart: now,
      currentPeriodEnd: endDate,
    },
  });

  await userCache.invalidate(userId);

  res.json({
    success: true,
    message: `تم منح باقة ${plan} لمدة ${durationDays} يوماً بنجاح `,
    subscription: sub,
  });
});

export const grantUserAiBonus = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { count = 20 } = req.body ?? {};

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { bonusAiMessages: { increment: Number(count) || 20 } },
    select: { id: true, username: true, bonusAiMessages: true },
  });

  res.json({
    success: true,
    message: `تمت إضافة ${count} رسالة ذكاء اصطناعي إضافية للمستخدم`,
    user: updated,
  });
});

export const deleteUserAccount = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  if (userId === req.user.userId) {
    throw forbidden('لا يمكنك حذف حسابك الإداري بنفسك');
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound('المستخدم غير موجود');

  await prisma.user.delete({ where: { id: userId } });
  await userCache.invalidate(userId);
  await analyticsService.invalidateAnalytics(userId);

  log.warn({ adminId: req.user.userId, targetUserId: userId }, 'تم حذف حساب مستخدم نهائياً');

  res.json({
    success: true,
    message: `تم حذف حساب المستخدم ${user.username} وجميع بياناته بنجاح`,
  });
});

export const flushUserCache = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  await userCache.invalidate(userId);
  await analyticsService.invalidateAnalytics(userId);
  res.json({ success: true, message: `تم إفراغ كاش المستخدم ${userId}` });
});

//////////////////////////////////////////////////////
// 3. السيطرة وإدارة العشائر (Clans God-Mode)
//////////////////////////////////////////////////////

export const listAdminClans = asyncHandler(async (req, res) => {
  const { type, domain, search, page = 1, limit = 50 } = req.query;

  const pageNum = Math.max(1, Number(page) || 1);
  const take = Math.min(100, Math.max(1, Number(limit) || 50));
  const skip = (pageNum - 1) * take;

  const where = {};
  if (type) where.type = type;
  if (domain) where.domain = domain;
  if (search) where.name = { contains: String(search).trim() };

  const [clans, total] = await Promise.all([
    prisma.clan.findMany({
      where,
      include: {
        leader: { select: { id: true, username: true, email: true } },
        _count: { select: { members: true, bans: true } },
      },
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    }),
    prisma.clan.count({ where }),
  ]);

  res.json({
    success: true,
    total,
    page: pageNum,
    limit: take,
    clans: clans.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      domain: c.domain,
      inviteCode: c.inviteCode,
      leader: c.leader,
      membersCount: c._count.members,
      bansCount: c._count.bans,
      createdAt: c.createdAt,
    })),
  });
});

export const createAdminClan = asyncHandler(async (req, res) => {
  const { name, description, domain, category = 'TECH', type = 'PRIVATE', leaderId, icon } = req.body ?? {};

  if (!name) throw badRequest('اسم العشيرة مطلوب');

  const leader = leaderId
    ? await prisma.user.findUnique({ where: { id: leaderId } })
    : await prisma.user.findUnique({ where: { id: req.user.userId } });

  if (!leader) throw notFound('قائد العشيرة المحدد غير موجود');

  const clan = await prisma.clan.create({
    data: {
      name: String(name).trim(),
      description: description ? String(description).trim() : null,
      category: category || domain || 'TECH',
      type,
      leaderId: leader.id,
      icon: icon || '️',
      members: {
        create: {
          userId: leader.id,
          role: 'LEADER',
        },
      },
    },
  });

  res.status(201).json({
    success: true,
    message: 'تم إنشاء العشيرة بنجاح عبر لوحة الإدارة',
    clan,
  });
});

export const updateAdminClan = asyncHandler(async (req, res) => {
  const { clanId } = req.params;
  const { name, description, domain, category, icon, type } = req.body ?? {};

  const clan = await prisma.clan.findUnique({ where: { id: clanId } });
  if (!clan) throw notFound('العشيرة غير موجودة');

  const data = {};
  if (name) data.name = String(name).trim();
  if (description !== undefined) data.description = description ? String(description).trim() : null;
  if (category || domain) data.category = category || domain;
  if (icon) data.icon = icon;
  if (type && ['GLOBAL', 'PRIVATE'].includes(type)) data.type = type;

  const updated = await prisma.clan.update({
    where: { id: clanId },
    data,
  });

  res.json({
    success: true,
    message: 'تم تحديث بيانات العشيرة بنجاح',
    clan: updated,
  });
});

export const transferClanLeader = asyncHandler(async (req, res) => {
  const { clanId } = req.params;
  const { newLeaderId } = req.body ?? {};

  if (!newLeaderId) throw badRequest('معرف القائد الجديد مطلوب');

  const [clan, newLeader] = await Promise.all([
    prisma.clan.findUnique({ where: { id: clanId } }),
    prisma.user.findUnique({ where: { id: newLeaderId } }),
  ]);

  if (!clan) throw notFound('العشيرة غير موجودة');
  if (!newLeader) throw notFound('المستخدم الجديد غير موجود');

  await prisma.$transaction(async (tx) => {
    // التأكد من وجود العضو في العشيرة وترقيته
    await tx.clanMember.upsert({
      where: { userId_clanId: { userId: newLeaderId, clanId } },
      update: { role: 'LEADER' },
      create: { userId: newLeaderId, clanId, role: 'LEADER' },
    });

    // تخفيض رتبة القائد القديم
    if (clan.leaderId && clan.leaderId !== newLeaderId) {
      await tx.clanMember.updateMany({
        where: { userId: clan.leaderId, clanId },
        data: { role: 'MEMBER' },
      });
    }

    await tx.clan.update({
      where: { id: clanId },
      data: { leaderId: newLeaderId },
    });
  });

  res.json({
    success: true,
    message: `تم نقل قيادة العشيرة بنجاح إلى ${newLeader.username}`,
  });
});

export const addClanMemberForce = asyncHandler(async (req, res) => {
  const { clanId } = req.params;
  const { userId, role = 'MEMBER' } = req.body ?? {};

  if (!userId) throw badRequest('معرف المستخدم مطلوب');

  const [clan, user] = await Promise.all([
    prisma.clan.findUnique({ where: { id: clanId } }),
    prisma.user.findUnique({ where: { id: userId } }),
  ]);

  if (!clan) throw notFound('العشيرة غير موجودة');
  if (!user) throw notFound('المستخدم غير موجود');

  const member = await prisma.clanMember.upsert({
    where: { userId_clanId: { userId, clanId } },
    update: { role },
    create: { userId, clanId, role },
  });

  res.json({
    success: true,
    message: `تمت إضافة ${user.username} إلى عشيرة "${clan.name}" بنجاح`,
    member,
  });
});

export const removeClanMemberForce = asyncHandler(async (req, res) => {
  const { clanId, userId } = req.params;

  await prisma.clanMember.deleteMany({
    where: { clanId, userId },
  });

  res.json({
    success: true,
    message: 'تم حذف العضو من العشيرة بنجاح',
  });
});

export const adminDeleteClan = asyncHandler(async (req, res) => {
  const { clanId } = req.params;

  const clan = await prisma.clan.findUnique({ where: { id: clanId } });
  if (!clan) throw notFound('العشيرة غير موجودة');

  if (clan.type === 'GLOBAL') {
    throw forbidden('لا يمكن حذف العشائر العامة الأساسية للنظام');
  }

  await prisma.$transaction([
    prisma.clanMember.deleteMany({ where: { clanId } }),
    prisma.clanBan.deleteMany({ where: { clanId } }),
    prisma.clan.delete({ where: { id: clanId } }),
  ]);

  res.json({
    success: true,
    message: `تم حذف عشيرة "${clan.name}" وجميع بياناتها المرتبطة بنجاح`,
  });
});

//////////////////////////////////////////////////////
// 4. الرقابة الحية على جلسات التركيز ومكافحة الغش
//////////////////////////////////////////////////////

export const listActiveFocusSessions = asyncHandler(async (req, res) => {
  const activeSessions = await prisma.focusSession.findMany({
    where: { status: 'ACTIVE' },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          profileImage: true,
          domain: true,
          currentStreak: true,
        },
      },
    },
    orderBy: { startedAt: 'asc' },
  });

  const now = Date.now();
  const sessions = activeSessions.map((s) => ({
    id: s.id,
    user: s.user,
    type: s.type,
    plannedMin: s.plannedMin,
    startedAt: s.startedAt,
    elapsedMinutes: Math.floor((now - new Date(s.startedAt).getTime()) / 60_000),
  }));

  res.json({
    success: true,
    totalActive: sessions.length,
    sessions,
  });
});

export const terminateFocusSession = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const { reason = 'إلغاء إداري لمخالفة الشروط' } = req.body ?? {};

  const session = await prisma.focusSession.findUnique({ where: { id: sessionId } });
  if (!session) throw notFound('الجلسة غير موجودة');

  await prisma.focusSession.update({
    where: { id: sessionId },
    data: {
      status: 'CANCELLED',
      endedAt: new Date(),
    },
  });

  await analyticsService.invalidateAnalytics(session.userId);

  res.json({
    success: true,
    message: `تم إنهاء جلسة التركيز قسرياً بنجاح (${reason})`,
  });
});

//////////////////////////////////////////////////////
// 5. الألقاب الأسطورية وقاعة الشرف الإدارية
//////////////////////////////////////////////////////

export const grantMythicTitle = asyncHandler(async (req, res) => {
  const { userId, titleCode } = req.body ?? {};

  if (!userId || !titleCode) {
    throw badRequest('معرف المستخدم وكود اللقب حقول إلزامية');
  }

  const [user, title] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.title.findUnique({ where: { code: titleCode } }),
  ]);

  if (!user) throw notFound('المستخدم غير موجود');
  if (!title) throw notFound('اللقب الأسطوري غير موجود');

  await prisma.userTitle.upsert({
    where: { userId_titleId: { userId, titleId: title.id } },
    update: { isUnlocked: true, unlockedAt: new Date() },
    create: { userId, titleId: title.id, isUnlocked: true, unlockedAt: new Date() },
  });

  await prisma.user.update({
    where: { id: userId },
    data: { equippedTitleId: title.id },
  });

  await userCache.invalidate(userId);
  await analyticsService.invalidateAnalytics(userId);

  log.warn({ adminId: req.user.userId, targetUserId: userId, titleCode }, ' تم منح لقب أسطوري يدوياً من الإدارة');

  res.json({
    success: true,
    message: `تم منح وارتداء اللقب الأسطوري [${title.title}] للمستخدم ${user.username} بنجاح`,
  });
});

export const revokeMythicTitle = asyncHandler(async (req, res) => {
  const { userId, titleCode } = req.body ?? {};

  const title = await prisma.title.findUnique({ where: { code: titleCode } });
  if (!title) throw notFound('اللقب غير موجود');

  await prisma.userTitle.deleteMany({
    where: { userId, titleId: title.id },
  });

  await prisma.user.updateMany({
    where: { id: userId, equippedTitleId: title.id },
    data: { equippedTitleId: null },
  });

  await userCache.invalidate(userId);
  await analyticsService.invalidateAnalytics(userId);

  res.json({
    success: true,
    message: 'تم سحب اللقب الأسطوري بنجاح',
  });
});

//////////////////////////////////////////////////////
// 6. السجل المالي والشرارات
//////////////////////////////////////////////////////

export const listSparksLedger = asyncHandler(async (req, res) => {
  const { page = 1, limit = 50, source, userId } = req.query;

  const pageNum = Math.max(1, Number(page) || 1);
  const take = Math.min(100, Math.max(1, Number(limit) || 50));
  const skip = (pageNum - 1) * take;

  const where = {};
  if (source) where.source = source;
  if (userId) where.userId = userId;

  const [transactions, total] = await Promise.all([
    prisma.sparkTransaction.findMany({
      where,
      include: {
        user: { select: { id: true, username: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    }),
    prisma.sparkTransaction.count({ where }),
  ]);

  res.json({
    success: true,
    total,
    page: pageNum,
    limit: take,
    transactions,
  });
});

//////////////////////////////////////////////////////
// 7. البلاغات الرقابية وحظر المسيئين
//////////////////////////////////////////////////////

export const listAdminReports = asyncHandler(async (req, res) => {
  const { status = 'PENDING', page = 1, limit = 50 } = req.query;

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

  res.json({ success: true, total, page: Number(page) || 1, limit: take, reports });
});

export const resolveAdminReport = asyncHandler(async (req, res) => {
  const { reportId } = req.params;
  const { action = 'RESOLVED', actionNote, banUser = false } = req.body ?? {};

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

  res.json({
    success: true,
    message: `تم البت في البلاغ بنجاح (${action})`,
  });
});

//////////////////////////////////////////////////////
// 8. مراقبة استهلاك الذكاء الاصطناعي
//////////////////////////////////////////////////////

export const getAiUsageSummary = asyncHandler(async (req, res) => {
  const recentLogs = await prisma.aiUsageLog.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 50,
    include: {
      user: { select: { id: true, username: true, email: true, domain: true } },
    },
  });

  const totals = await prisma.aiUsageLog.aggregate({
    _sum: { tokensUsed: true, messageCount: true },
    _count: true,
  });

  res.json({
    success: true,
    summary: {
      totalDaysTracked: totals._count,
      totalTokensConsumed: totals._sum.tokensUsed ?? 0,
      totalMessagesSent: totals._sum.messageCount ?? 0,
    },
    recentLogs,
  });
});

//////////////////////////////////////////////////////
// 9. اقتصاديات الوحدة والنسب الذهبية (Growth & SaaS Health)
//////////////////////////////////////////////////////

export const getGrowthDashboard = asyncHandler(async (req, res) => {
  const { periodDays } = req.query;
  const result = await growthMetricsService.getGrowthEconomicsDashboard({ periodDays });
  res.status(200).json(result);
});

export const getGrowthCohorts = asyncHandler(async (req, res) => {
  const result = await growthMetricsService.getRetentionCohorts();
  res.status(200).json(result);
});

export const recordMarketingCampaign = asyncHandler(async (req, res) => {
  const result = await growthMetricsService.recordMarketingCampaign(req.body ?? {});
  res.status(201).json(result);
});

export const listMarketingCampaigns = asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const result = await growthMetricsService.listMarketingCampaigns({ page, limit });
  res.status(200).json(result);
});

export const recordOperationalExpense = asyncHandler(async (req, res) => {
  const result = await growthMetricsService.recordOperationalExpense(req.body ?? {});
  res.status(201).json(result);
});

export const listOperationalExpenses = asyncHandler(async (req, res) => {
  const { category, page, limit } = req.query;
  const result = await growthMetricsService.listOperationalExpenses({ category, page, limit });
  res.status(200).json(result);
});

export default {
  getDashboardStats,
  getSystemDeepHealth,
  flushAllCache,
  sendSystemBroadcast,
  listUsers,
  inspectUser,
  toggleUserBan,
  setUserRole,
  adjustUserSparks,
  adjustUserStreak,
  grantUserSubscription,
  grantUserAiBonus,
  deleteUserAccount,
  flushUserCache,
  listAdminClans,
  createAdminClan,
  updateAdminClan,
  transferClanLeader,
  addClanMemberForce,
  removeClanMemberForce,
  adminDeleteClan,
  listActiveFocusSessions,
  terminateFocusSession,
  grantMythicTitle,
  revokeMythicTitle,
  listSparksLedger,
  listAdminReports,
  resolveAdminReport,
  getAiUsageSummary,
  getGrowthDashboard,
  getGrowthCohorts,
  recordMarketingCampaign,
  listMarketingCampaigns,
  recordOperationalExpense,
  listOperationalExpenses,
};
