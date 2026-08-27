import crypto from 'node:crypto';

import prisma from '../../config/prisma.js';
import { getPulseState, isBreakTime } from '../../services/pulse.service.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { badRequest, conflict, forbidden, notFound } from '../../utils/AppError.js';

/**
 * ════════════════════════════════════════════════════════════
 *  الألعاب — المسار الثاني في باكدج الراحة
 * ════════════════════════════════════════════════════════════
 *
 * الغرف تُنشأ وقت الراحة فقط، وتنتهي صلاحيتها تلقائياً مع نهايتها.
 * منطق اللعب نفسه في game.socket.js عبر Socket.io.
 */

import * as sparksService from '../../services/sparks.service.js';

const GAMES = [
  {
    type: 'SNAKE',
    title: 'الثعبان الجماعي',
    icon: '',
    description: 'تنافس لحظي مع كتيبتك وعشيرتك — كُل والتفّ وتصدر اللوحة',
    minPlayers: 1,
    maxPlayers: 50,
  },
  {
    type: 'DOMINO',
    title: 'دومينو التحدي الرباعي',
    icon: '',
    description: 'لعبة تفاعلية حماسية (من ٢ إلى ٤ لاعبين فقط) مع مؤقت ٢٠ ثانية وحسم القفلة',
    minPlayers: 2,
    maxPlayers: 4,
  },
  {
    type: 'DRAW',
    title: 'لوحة الرسم والتفريغ',
    icon: '',
    description: 'مساحة فردية هادئة للرسم والتفريغ الإبداعي مع حفظ لوحاتك وكسب +3 شرارات استرخاء',
    minPlayers: 1,
    maxPlayers: 1,
  },
];

const genCode = () =>
  crypto.randomBytes(3).toString('hex').toUpperCase();

/** نهاية الراحة الحالية — تُغلق الغرفة عندها */
const breakEndsAt = () => {
  const state = getPulseState();
  return new Date(Date.now() + state.remainingInPhase * 60_000);
};

const requireBreak = () => {
  if (!isBreakTime()) {
    throw forbidden(
      'الألعاب متاحة وقت الراحة فقط — ركّز الآن ',
      'NOT_BREAK_TIME',
    );
  }
};

//////////////////////////////////////////////////////
// قائمة الألعاب
//////////////////////////////////////////////////////

export const listGames = asyncHandler(async (req, res) => {
  const state = getPulseState();
  const onBreak = isBreakTime();

  const activeRooms = onBreak
    ? await prisma.gameRoom.findMany({
        where: { status: { in: ['WAITING', 'PLAYING'] }, expiresAt: { gt: new Date() } },
        include: {
          host: { select: { username: true } },
          _count: { select: { players: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      })
    : [];

  res.json({
    success: true,
    isBreakTime: onBreak,
    remainingMinutes: state.remainingInPhase,
    games: GAMES,
    openRooms: activeRooms.map((r) => ({
      id: r.id,
      code: r.code,
      type: r.type,
      host: r.host.username,
      players: r._count.players,
      maxPlayers: r.maxPlayers,
      status: r.status,
    })),
  });
});

//////////////////////////////////////////////////////
// إنشاء غرفة
//////////////////////////////////////////////////////

export const createRoom = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { type = 'SNAKE', maxPlayers, clanId } = req.body ?? {};

  requireBreak();

  /**
   * ️ الغرفة بتتربط بعشيرة، والانضمام بيتقصر على أعضائها.
   *
   *    من غير الربط ده كان أي حد معاه الكود يدخل — أثبتناه
   *    بالتشغيل: مستخدم غريب تماماً دخل غرفة وHTTP 200.
   *    كود من 6 حروف مش سر، والغرف بتتعمل وقت الراحة لما
   *    الناس بتكون بتشارك الشاشة.
   *
   *    `clanId` اختياري للتوافق: من غيره الغرفة فردية بالكود
   *    (السلوك القديم) — والواجهة بتبعته دايماً.
   */
  if (clanId) {
    const membership = await prisma.clanMember.findUnique({
      where: { userId_clanId: { userId, clanId } },
      select: { id: true },
    });
    if (!membership) {
      throw forbidden('لازم تكون عضو في العشيرة عشان تعمل غرفة ليها', 'NOT_CLAN_MEMBER');
    }
  }

  const game = GAMES.find((g) => g.type === type);
  if (!game) {
    throw badRequest(`لعبة غير معروفة. المتاح: ${GAMES.map((g) => g.type).join(' · ')}`);
  }

  // غرفة نشطة واحدة لكل مستخدم
  const existing = await prisma.gameRoom.findFirst({
    where: {
      hostId: userId,
      status: { in: ['WAITING', 'PLAYING'] },
      expiresAt: { gt: new Date() },
    },
    select: { id: true, code: true },
  });

  if (existing) {
    throw conflict('لديك غرفة نشطة بالفعل', 'ROOM_ALREADY_ACTIVE');
  }

  const cap = Number.isInteger(maxPlayers)
    ? Math.min(Math.max(maxPlayers, game.minPlayers), game.maxPlayers)
    : game.maxPlayers;

  const room = await prisma.$transaction(async (tx) => {
    const created = await tx.gameRoom.create({
      data: {
        type,
        code: genCode(),
        hostId: userId,
        clanId: clanId ?? null,
        maxPlayers: cap,
        expiresAt: breakEndsAt(),
      },
    });

    await tx.gameRoomPlayer.create({
      data: { roomId: created.id, userId },
    });

    return created;
  });

  res.status(201).json({
    success: true,
    room: {
      id: room.id,
      code: room.code,
      type: room.type,
      maxPlayers: room.maxPlayers,
      expiresAt: room.expiresAt,
      /** الثواني المتبقية — الواجهة تعرض عدّاداً */
      expiresInSec: Math.floor((room.expiresAt - Date.now()) / 1000),
    },
  });
});

//////////////////////////////////////////////////////
// الانضمام
//////////////////////////////////////////////////////

export const joinRoom = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { code } = req.body ?? {};

  requireBreak();

  if (!code) throw badRequest('كود الغرفة مطلوب');

  const room = await prisma.gameRoom.findUnique({
    where: { code: String(code).trim().toUpperCase() },
    include: { _count: { select: { players: true } } },
  });

  if (!room) throw notFound('الغرفة غير موجودة');

  if (room.expiresAt < new Date()) {
    throw badRequest('انتهت صلاحية الغرفة', 'ROOM_EXPIRED');
  }

  if (room.status === 'FINISHED') throw badRequest('انتهت اللعبة');

  /**
   * ️ العضوية في العشيرة شرط — ده اللي كان ناقص.
   *
   *    الفحوص القديمة (وقت الراحة · الصلاحية · الامتلاء) مكانتش
   *    بتسأل **مين** بيدخل. الغرف المربوطة بعشيرة بقت مقفولة
   *    على أعضائها.
   */
  if (room.clanId) {
    const membership = await prisma.clanMember.findUnique({
      where: { userId_clanId: { userId, clanId: room.clanId } },
      select: { id: true },
    });
    if (!membership) {
      throw forbidden('اللعبة دي لأعضاء العشيرة بس', 'NOT_CLAN_MEMBER');
    }
  }

  if (room._count.players >= room.maxPlayers) {
    throw badRequest('الغرفة ممتلئة', 'ROOM_FULL');
  }

  await prisma.gameRoomPlayer.upsert({
    where: { roomId_userId: { roomId: room.id, userId } },
    update: {},
    create: { roomId: room.id, userId },
  });

  res.json({
    success: true,
    room: {
      id: room.id,
      code: room.code,
      type: room.type,
      expiresAt: room.expiresAt,
      expiresInSec: Math.floor((room.expiresAt - Date.now()) / 1000),
    },
  });
});

//////////////////////////////////////////////////////
// دعوة لاعب
//////////////////////////////////////////////////////

export const invitePlayer = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { roomId } = req.params;
  const { targetUserId } = req.body ?? {};

  const room = await prisma.gameRoom.findFirst({
    where: { id: roomId, hostId: userId },
    select: { id: true, code: true, type: true, expiresAt: true },
  });

  if (!room) throw notFound('الغرفة غير موجودة أو لست مضيفها');

  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, username: true },
  });

  if (!target) throw notFound('المستخدم غير موجود');

  // الدعوة تصل كإشعار داخل التطبيق
  await prisma.notification.create({
    data: {
      userId: target.id,
      type: 'SYSTEM',
      title: ' دعوة للعب',
      body: `${req.user.username} يدعوك للعب`,
      data: { roomId: room.id, code: room.code, gameType: room.type },
    },
  });

  res.json({ success: true, message: `تمت دعوة ${target.username}` });
});

//////////////////////////////////////////////////////
// حالة الغرفة
//////////////////////////////////////////////////////

export const getRoom = asyncHandler(async (req, res) => {
  const { roomId } = req.params;

  const room = await prisma.gameRoom.findUnique({
    where: { id: roomId },
    include: {
      host: { select: { id: true, username: true } },
      players: {
        include: {
          user: { select: { id: true, username: true, profileImage: true } },
        },
        orderBy: { score: 'desc' },
      },
    },
  });

  if (!room) throw notFound('الغرفة غير موجودة');

  const isMember = room.players.some((p) => p.userId === req.user.userId);
  if (!isMember) throw forbidden('أنت لست في هذه الغرفة');

  res.json({
    success: true,
    room: {
      id: room.id,
      code: room.code,
      type: room.type,
      status: room.status,
      host: room.host,
      isHost: room.hostId === req.user.userId,
      maxPlayers: room.maxPlayers,
      expiresAt: room.expiresAt,
      expiresInSec: Math.max(0, Math.floor((room.expiresAt - Date.now()) / 1000)),
      players: room.players.map((p) => ({ ...p.user, score: p.score })),
    },
  });
});

/** مغادرة الغرفة — المضيف يغادر ⇒ تُغلق الغرفة */
export const leaveRoom = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { roomId } = req.params;

  const room = await prisma.gameRoom.findUnique({
    where: { id: roomId },
    select: { id: true, hostId: true },
  });

  if (!room) throw notFound('الغرفة غير موجودة');

  if (room.hostId === userId) {
    await prisma.gameRoom.update({
      where: { id: roomId },
      data: { status: 'FINISHED', endedAt: new Date() },
    });
    return res.json({ success: true, message: 'أُغلقت الغرفة' });
  }

  await prisma.gameRoomPlayer.deleteMany({ where: { roomId, userId } });

  res.json({ success: true, message: 'غادرت الغرفة' });
});

//////////////////////////////////////////////////////
// لوحة الرسم والتفريغ الفردي وقت الاستراحة
//////////////////////////////////////////////////////

export const saveDrawingSketch = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { title, canvasData, previewUrl, durationMin = 5 } = req.body ?? {};

  if (!canvasData) {
    throw badRequest('بيانات الرسم canvasData مطلوبة');
  }

  const sketch = await prisma.drawingSketch.create({
    data: {
      userId,
      title: title ? String(title).trim().slice(0, 100) : 'لوحة تفريغ واسترخاء',
      canvasData,
      previewUrl: previewUrl || null,
      durationMin: Number(durationMin) || 5,
    },
  });

  // منح 3 شرارات استرخاء
  const awardRes = await sparksService.award(userId, {
    source: 'VENTING_CATHARSIS',
    baseAmount: 3,
    note: 'مكافأة الاسترخاء والتفريغ بالرسم ',
  });

  res.status(201).json({
    success: true,
    message: 'تم حفظ لوحتك بنجاح وكسبت +3 شرارات استرخاء ',
    sketch,
    sparksBalance: awardRes.balance,
  });
});

export const listDrawingGallery = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { page = 1, limit = 20 } = req.query;

  const take = Math.min(50, Math.max(1, Number(limit) || 20));
  const skip = (Math.max(1, Number(page) || 1) - 1) * take;

  const [sketches, total] = await Promise.all([
    prisma.drawingSketch.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    }),
    prisma.drawingSketch.count({ where: { userId } }),
  ]);

  res.json({
    success: true,
    total,
    page: Number(page) || 1,
    limit: take,
    sketches,
  });
});

export const getDrawingSketch = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { id } = req.params;

  const sketch = await prisma.drawingSketch.findFirst({
    where: { id, userId },
  });

  if (!sketch) throw notFound('اللوحة غير موجودة');

  res.json({ success: true, sketch });
});

export const deleteDrawingSketch = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { id } = req.params;

  const { count } = await prisma.drawingSketch.deleteMany({
    where: { id, userId },
  });

  if (count === 0) throw notFound('اللوحة غير موجودة');

  res.json({ success: true, message: 'تم حذف اللوحة بنجاح' });
});

export default {
  listGames,
  createRoom,
  joinRoom,
  invitePlayer,
  getRoom,
  leaveRoom,
  saveDrawingSketch,
  listDrawingGallery,
  getDrawingSketch,
  deleteDrawingSketch,
};
