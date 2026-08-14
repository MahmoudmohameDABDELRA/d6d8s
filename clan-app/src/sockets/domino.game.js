import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import prisma from '../config/prisma.js';
import * as sparksService from '../services/sparks.service.js';
import { scoped } from '../config/logger.js';

const log = scoped('domino-game');

/**
 * ════════════════════════════════════════════════════════════
 *  محرك لعبة الدومينو اللحظي متعدد اللاعبين — Multiplayer Domino
 * ════════════════════════════════════════════════════════════
 *
 *  القواعد الصارمة:
 *   ١. الحد الأقصى: ٤ لاعبين في الغرفة (من ٢ إلى ٤ لاعبين).
 *   ٢. خزانة الـ ٢٨ قطعة الرسمية من [0,0] إلى [6,6].
 *   ٣. توزيع ٧ قطع لكل لاعب، والباقي في السحبة (Boneyard).
 *   ٤. صاحب أعلى دوش يبدأ أولاً.
 *   ٥. مؤقت تنازلي ٢٠ ثانية لكل دور مع التمرير والسحب التلقائي.
 *   ٦. احتساب الفوز بالتكويش (صفر قطع) أو حسم القفلة (أقل مجموع نقاط).
 */

const TURN_TIMEOUT_SECONDS = 20;

const ALL_TILES = [
  [0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6],
  [1, 1], [1, 2], [1, 3], [1, 4], [1, 5], [1, 6],
  [2, 2], [2, 3], [2, 4], [2, 5], [2, 6],
  [3, 3], [3, 4], [3, 5], [3, 6],
  [4, 4], [4, 5], [4, 6],
  [5, 5], [5, 6],
  [6, 6],
];

/** خلط عشوائي لقطع الدومينو */
const shuffleTiles = () => {
  const tiles = JSON.parse(JSON.stringify(ALL_TILES));
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  return tiles;
};

// غرف الدومينو النشطة في الذاكرة
const dominoRooms = new Map();

export const registerDominoGame = (io) => {
  const nsp = io.of('/domino');

  nsp.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.split(' ')[1];

      if (!token) return next(new Error('UNAUTHORIZED'));

      const decoded = jwt.verify(token, env.jwt.accessSecret);
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, username: true, isBanned: true },
      });

      if (!user || user.isBanned) return next(new Error('UNAUTHORIZED'));

      socket.data.userId = user.id;
      socket.data.username = user.username;
      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  });

  nsp.on('connection', (socket) => {
    const { userId, username } = socket.data;

    // ── ١. الانضمام لغرفة الدومينو ──
    socket.on('domino:join_room', async ({ roomId }) => {
      try {
        const room = await prisma.gameRoom.findUnique({
          where: { id: roomId },
          include: { players: { include: { user: { select: { id: true, username: true } } } } },
        });

        if (!room) {
          return socket.emit('domino:error', { message: 'الغرفة غير موجودة' });
        }

        socket.join(roomId);

        // إنشاء أو جلب حالة الغرفة
        let gameState = dominoRooms.get(roomId);
        if (!gameState) {
          gameState = {
            roomId,
            hostId: room.hostId,
            status: room.status,
            maxPlayers: 4,
            players: [],
            board: [],
            leftEnd: null,
            rightEnd: null,
            boneyard: [],
            currentTurnIndex: 0,
            consecutivePasses: 0,
            turnTimer: null,
            timerRemaining: TURN_TIMEOUT_SECONDS,
          };
          dominoRooms.set(roomId, gameState);
        }

        // إضافة اللاعب إذا لم يكن موجوداً
        let existingPlayer = gameState.players.find((p) => p.userId === userId);
        if (!existingPlayer) {
          if (gameState.players.length >= 4) {
            return socket.emit('domino:error', { message: 'اكتمل الحد الأقصى للغرفة (٤ لاعبين فقط)' });
          }
          existingPlayer = {
            userId,
            username,
            socketId: socket.id,
            hand: [],
            score: 0,
            isReady: false,
          };
          gameState.players.push(existingPlayer);
        } else {
          existingPlayer.socketId = socket.id;
        }

        // إرسال حالة اللوبي للجميع
        nsp.to(roomId).emit('domino:room_state', {
          roomId,
          status: gameState.status,
          playersCount: gameState.players.length,
          maxPlayers: 4,
          hostId: gameState.hostId,
          players: gameState.players.map((p) => ({
            userId: p.userId,
            username: p.username,
            tilesCount: p.hand.length,
            isHost: p.userId === gameState.hostId,
          })),
        });
      } catch (err) {
        socket.emit('domino:error', { message: err.message });
      }
    });

    // ── ٢. بدء اللعبة (من ٢ إلى ٤ لاعبين) ──
    socket.on('domino:start_game', async ({ roomId }) => {
      const gameState = dominoRooms.get(roomId);
      if (!gameState) return;

      if (gameState.hostId !== userId) {
        return socket.emit('domino:error', { message: 'صاحب الغرفة فقط يملك صلاحية بدء اللعبة' });
      }

      if (gameState.players.length < 2) {
        return socket.emit('domino:error', { message: 'يلزم تواجد لاعبين اثنين على الأقل لبدء الدومينو' });
      }

      // توزيع القطع
      const deck = shuffleTiles();
      gameState.players.forEach((p) => {
        p.hand = deck.splice(0, 7);
      });
      gameState.boneyard = deck;
      gameState.board = [];
      gameState.status = 'PLAYING';
      gameState.consecutivePasses = 0;

      // تحديد من يبدأ بأعلى دوش
      let starterIndex = 0;
      let highestDouble = -1;

      gameState.players.forEach((p, idx) => {
        p.hand.forEach(([a, b]) => {
          if (a === b && a > highestDouble) {
            highestDouble = a;
            starterIndex = idx;
          }
        });
      });

      gameState.currentTurnIndex = starterIndex;

      // إرسال اليد الخاصة لكل لاعب على انفراد
      gameState.players.forEach((p) => {
        nsp.to(p.socketId).emit('domino:your_hand', { hand: p.hand });
      });

      // إطلاق حدث بدء اللعبة للجميع
      broadcastDominoTurn(nsp, gameState);
    });

    // ── ٣. لعب قطعة دومينو (Play Tile) ──
    socket.on('domino:play_tile', async ({ roomId, tile, side }) => {
      const gameState = dominoRooms.get(roomId);
      if (!gameState || gameState.status !== 'PLAYING') return;

      const currentPlayer = gameState.players[gameState.currentTurnIndex];
      if (currentPlayer.userId !== userId) {
        return socket.emit('domino:error', { message: 'ليس دورك الآن' });
      }

      const [a, b] = tile;
      // التحقق من امتلاك اللاعب للقطعة
      const tileIdx = currentPlayer.hand.findIndex(
        (t) => (t[0] === a && t[1] === b) || (t[0] === b && t[1] === a),
      );

      if (tileIdx === -1) {
        return socket.emit('domino:error', { message: 'أنت لا تملك هذه القطعة' });
      }

      // أول قطعة في اللعبة
      if (gameState.board.length === 0) {
        gameState.board.push({ tile: [a, b], playedBy: userId });
        gameState.leftEnd = a;
        gameState.rightEnd = b;
      } else {
        // التحقق من صحة المطابقة على الطرف الأيمن أو الأيسر
        const targetSide = side === 'LEFT' ? 'LEFT' : 'RIGHT';
        let matched = false;

        if (targetSide === 'LEFT') {
          if (b === gameState.leftEnd) {
            gameState.board.unshift({ tile: [a, b], playedBy: userId });
            gameState.leftEnd = a;
            matched = true;
          } else if (a === gameState.leftEnd) {
            gameState.board.unshift({ tile: [b, a], playedBy: userId });
            gameState.leftEnd = b;
            matched = true;
          }
        } else {
          if (a === gameState.rightEnd) {
            gameState.board.push({ tile: [a, b], playedBy: userId });
            gameState.rightEnd = b;
            matched = true;
          } else if (b === gameState.rightEnd) {
            gameState.board.push({ tile: [a, b], playedBy: userId });
            gameState.rightEnd = a;
            matched = true;
          }
        }

        if (!matched) {
          return socket.emit('domino:error', { message: 'القطعة لا تطابق أطراف اللوحة الحالية' });
        }
      }

      // إزالة القطعة من يد اللاعب
      currentPlayer.hand.splice(tileIdx, 1);
      gameState.consecutivePasses = 0;

      // تحديث يد اللاعب الخاصة
      socket.emit('domino:your_hand', { hand: currentPlayer.hand });

      // فحص الفوز بالتكويش (صفر قطع)
      if (currentPlayer.hand.length === 0) {
        return handleGameOver(nsp, gameState, currentPlayer, 'ZERO_TILES');
      }

      // نقل الدور للاعب التالي
      advanceDominoTurn(nsp, gameState);
    });

    // ── ٤. السحب من السحبة (Draw Tile) ──
    socket.on('domino:draw_tile', ({ roomId }) => {
      const gameState = dominoRooms.get(roomId);
      if (!gameState || gameState.status !== 'PLAYING') return;

      const currentPlayer = gameState.players[gameState.currentTurnIndex];
      if (currentPlayer.userId !== userId) return;

      if (gameState.boneyard.length === 0) {
        return socket.emit('domino:error', { message: 'نفدت قطع السحبة' });
      }

      const drawnTile = gameState.boneyard.pop();
      currentPlayer.hand.push(drawnTile);

      socket.emit('domino:your_hand', { hand: currentPlayer.hand });
      nsp.to(roomId).emit('domino:boneyard_updated', { remainingInBoneyard: gameState.boneyard.length });

      log.info({ userId, roomId }, ' تم سحب قطعة من السحبة');
    });

    // ── ٥. تمرير الدور (Pass Turn) ──
    socket.on('domino:pass_turn', ({ roomId }) => {
      const gameState = dominoRooms.get(roomId);
      if (!gameState || gameState.status !== 'PLAYING') return;

      const currentPlayer = gameState.players[gameState.currentTurnIndex];
      if (currentPlayer.userId !== userId) return;

      gameState.consecutivePasses += 1;

      // فحص القفلة (إذا مرر الجميع تباعاً)
      if (gameState.consecutivePasses >= gameState.players.length) {
        return handleBlockedGameOver(nsp, gameState);
      }

      advanceDominoTurn(nsp, gameState);
    });

    socket.on('disconnect', () => {
      // تنظيف اللاعبين عند الانقطاع
    });
  });

  log.info(' محرك لعبة الدومينو جاهز على /domino (سقف ٤ لاعبين)');
};

/** تقدم الدور مع تشغيل مؤقت الـ ٢٠ ثانية التنازلي */
const advanceDominoTurn = (nsp, gameState) => {
  gameState.currentTurnIndex = (gameState.currentTurnIndex + 1) % gameState.players.length;
  broadcastDominoTurn(nsp, gameState);
};

const broadcastDominoTurn = (nsp, gameState) => {
  if (gameState.turnTimer) clearInterval(gameState.turnTimer);

  const currentPlayer = gameState.players[gameState.currentTurnIndex];
  gameState.timerRemaining = TURN_TIMEOUT_SECONDS;

  nsp.to(gameState.roomId).emit('domino:turn_changed', {
    currentTurnUserId: currentPlayer.userId,
    currentTurnUsername: currentPlayer.username,
    board: gameState.board,
    leftEnd: gameState.leftEnd,
    rightEnd: gameState.rightEnd,
    boneyardCount: gameState.boneyard.length,
    turnTimeoutSec: TURN_TIMEOUT_SECONDS,
    playersHandCounts: gameState.players.map((p) => ({
      userId: p.userId,
      username: p.username,
      tilesCount: p.hand.length,
    })),
  });

  // مؤقت الـ ٢٠ ثانية التنازلي مع التمرير التلقائي
  gameState.turnTimer = setInterval(() => {
    gameState.timerRemaining -= 1;

    if (gameState.timerRemaining <= 0) {
      clearInterval(gameState.turnTimer);
      log.info({ roomId: gameState.roomId, player: currentPlayer.username }, '⏱️ انتهاء وقت الدور — تمرير تلقائي');
      advanceDominoTurn(nsp, gameState);
    }
  }, 1000);
};

/** حسم الفوز بالتكويش */
const handleGameOver = async (nsp, gameState, winner, reason) => {
  if (gameState.turnTimer) clearInterval(gameState.turnTimer);
  gameState.status = 'FINISHED';

  // صرف ٢٠ شرارة للفائز
  await sparksService.award(winner.userId, {
    source: 'SHOP_PURCHASE',
    baseAmount: 20,
    note: 'مكافأة الفوز في لعبة الدومينو ',
  });

  nsp.to(gameState.roomId).emit('domino:game_over', {
    winnerId: winner.userId,
    winnerUsername: winner.username,
    reason,
    sparksAwarded: 20,
    board: gameState.board,
    hands: gameState.players.map((p) => ({
      userId: p.userId,
      username: p.username,
      remainingHand: p.hand,
      pipSum: p.hand.reduce((acc, [a, b]) => acc + a + b, 0),
    })),
  });

  log.info({ roomId: gameState.roomId, winner: winner.username }, ' انتهت لعبة الدومينو وتُوّج البطل');
};

/** حسم الفوز عند القفلة (أقل مجموع نقاط في اليد) */
const handleBlockedGameOver = async (nsp, gameState) => {
  if (gameState.turnTimer) clearInterval(gameState.turnTimer);
  gameState.status = 'FINISHED';

  // حساب مجموع نقاط كل لاعب
  const scores = gameState.players.map((p) => ({
    userId: p.userId,
    username: p.username,
    hand: p.hand,
    pipSum: p.hand.reduce((acc, [a, b]) => acc + a + b, 0),
  }));

  scores.sort((a, b) => a.pipSum - b.pipSum);
  const winner = scores[0];

  await sparksService.award(winner.userId, {
    source: 'SHOP_PURCHASE',
    baseAmount: 20,
    note: 'مكافأة الفوز في قفلة الدومينو ',
  });

  nsp.to(gameState.roomId).emit('domino:game_over', {
    winnerId: winner.userId,
    winnerUsername: winner.username,
    reason: 'BLOCKED_GAME_LOWEST_PIPS',
    sparksAwarded: 20,
    board: gameState.board,
    hands: scores,
  });
};

export default registerDominoGame;
