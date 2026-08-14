/**
 * ═══════════════════════════════════════════════════════════
 *  خدمة الصداقة — نظام انستقرام (قرار المالك)
 *
 *  - الصداقة شرط المراسلة المفتوحة.
 *  - رسالة لغير صديق = طلب صداقة (رسالة واحدة فقط).
 *  - قبول الطلب → Friendship ACCEPTED + محادثة مفتوحة.
 *  - حد يومي: 10 طلبات صداقة (Redis TTL).
 * ═══════════════════════════════════════════════════════════
 */
import prisma from '../config/prisma.js';
import { createClient } from 'redis';
import env from '../config/env.js';

const redis = createClient({ url: env.redisUrl, socket: { connectTimeout: 2000 } });
redis.on('error', () => {});
if (!redis.isOpen) redis.connect().catch(() => {});

const DAILY_FRIEND_REQUESTS = 10;
const TTL_SECONDS = 24 * 60 * 60;

/** هل الرقمان أصدقاء (ACCEPTED)؟ */
export const areFriends = async (userA, userB) => {
  if (userA === userB) return false;
  const f = await prisma.friendship.findFirst({
    where: {
      status: 'ACCEPTED',
      OR: [
        { fromUserId: userA, toUserId: userB },
        { fromUserId: userB, toUserId: userA },
      ],
    },
  });
  return Boolean(f);
};

/** هل فيه طلب صداقة معلق بينهما؟ */
export const findPendingRequest = async (userA, userB) =>
  prisma.friendship.findFirst({
    where: {
      status: 'PENDING',
      OR: [
        { fromUserId: userA, toUserId: userB },
        { fromUserId: userB, toUserId: userA },
      ],
    },
  });

/** عداد طلبات الصداقة المرسلة اليوم */
export const countRequestsToday = async (userId) => {
  try {
    const key = `friend:req:${userId}:${new Date().toISOString().slice(0, 10)}`;
    const n = await redis.get(key);
    return Number(n || 0);
  } catch {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return prisma.friendship.count({
      where: { fromUserId: userId, createdAt: { gte: start } },
    });
  }
};

export const incrementRequestsToday = async (userId) => {
  try {
    const key = `friend:req:${userId}:${new Date().toISOString().slice(0, 10)}`;
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, TTL_SECONDS);
    return n;
  } catch {
    return 0; // فشل العدّاد → يسمح (الحد الأساسي من القاعدة لاحقاً لو تطلب)
  }
};

/**
 * إنشاء طلب صداقة (بعد فحص الحد اليومي)
 * @returns {{ok:boolean, code?:string, friendship?:object, remainingToday?:number}}
 */
export const createFriendRequest = async ({ fromUserId, toUserId }) => {
  if (fromUserId === toUserId) return { ok: false, code: 'INVALID_TARGET' };

  // هل هما أصدقاء أو في طلب معلق؟
  if (await areFriends(fromUserId, toUserId)) {
    return { ok: false, code: 'ALREADY_FRIENDS' };
  }
  const pending = await findPendingRequest(fromUserId, toUserId);
  if (pending) return { ok: false, code: 'REQUEST_PENDING' };

  // الحد اليومي
  const today = await countRequestsToday(fromUserId);
  if (today >= DAILY_FRIEND_REQUESTS) {
    return { ok: false, code: 'DAILY_FRIEND_REQUESTS_EXHAUSTED', remainingToday: 0 };
  }

  const friendship = await prisma.friendship.create({
    data: { fromUserId, toUserId, status: 'PENDING' },
  });
  await incrementRequestsToday(fromUserId);

  return {
    ok: true,
    friendship,
    remainingToday: DAILY_FRIEND_REQUESTS - (today + 1),
  };
};

/** قبول طلب صداقة */
export const acceptFriendRequest = async ({ friendshipId, userId }) => {
  const f = await prisma.friendship.findFirst({
    where: { id: friendshipId, toUserId: userId, status: 'PENDING' },
  });
  if (!f) return { ok: false, code: 'NOT_FOUND' };

  const updated = await prisma.friendship.update({
    where: { id: f.id },
    data: { status: 'ACCEPTED', respondedAt: new Date() },
  });
  return { ok: true, friendship: updated };
};

/** رفض طلب صداقة (يُحذف) */
export const declineFriendRequest = async ({ friendshipId, userId }) => {
  const f = await prisma.friendship.findFirst({
    where: { id: friendshipId, toUserId: userId, status: 'PENDING' },
  });
  if (!f) return { ok: false, code: 'NOT_FOUND' };
  await prisma.friendship.delete({ where: { id: f.id } });
  return { ok: true };
};

/** إلغاء صداقة (من أي طرف) */
export const removeFriendship = async ({ userA, userB }) => {
  await prisma.friendship.deleteMany({
    where: {
      status: 'ACCEPTED',
      OR: [
        { fromUserId: userA, toUserId: userB },
        { fromUserId: userB, toUserId: userA },
      ],
    },
  });
  return { ok: true };
};

/** قائمة أصدقاء المستخدم (مع بياناتهم العامة) */
export const listFriends = async (userId) => {
  const fs = await prisma.friendship.findMany({
    where: {
      status: 'ACCEPTED',
      OR: [{ fromUserId: userId }, { toUserId: userId }],
    },
    include: {
      fromUser: {
        select: { id: true, username: true, profileImage: true, domain: true, specialty: true },
      },
      toUser: {
        select: { id: true, username: true, profileImage: true, domain: true, specialty: true },
      },
    },
  });
  return fs.map((f) =>
    f.fromUserId === userId ? { friendshipId: f.id, friend: f.toUser, since: f.updatedAt } : { friendshipId: f.id, friend: f.fromUser, since: f.updatedAt },
  );
};

/** طلبات الصداقة الواردة */
export const listIncomingRequests = async (userId) =>
  prisma.friendship.findMany({
    where: { toUserId: userId, status: 'PENDING' },
    include: {
      fromUser: {
        select: { id: true, username: true, profileImage: true, domain: true, specialty: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

/** هل المستخدم كاتم شخصاً؟ */
export const isMuted = async (muterId, targetId) =>
  Boolean(
    await prisma.mutedUser.findUnique({
      where: { muterId_targetId: { muterId, targetId } },
    }),
  );

export const muteUser = async (muterId, targetId) => {
  if (muterId === targetId) return { ok: false, code: 'INVALID_TARGET' };
  await prisma.mutedUser.upsert({
    where: { muterId_targetId: { muterId, targetId } },
    create: { muterId, targetId },
    update: {},
  });
  return { ok: true };
};

export const unmuteUser = async (muterId, targetId) => {
  await prisma.mutedUser.deleteMany({ where: { muterId, targetId } });
  return { ok: true };
};

export const listMuted = async (muterId) =>
  prisma.mutedUser.findMany({
    where: { muterId },
    include: {
      target: {
        select: { id: true, username: true, profileImage: true, domain: true },
      },
    },
  });

export default {
  areFriends,
  findPendingRequest,
  createFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  removeFriendship,
  listFriends,
  listIncomingRequests,
  isMuted,
  muteUser,
  unmuteUser,
  listMuted,
};
