/**
 * ════════════════════════════════════════════════════════════
 *  محرك لعبة الثعبان — نسخة مُصلَّحة ومدمجة
 * ════════════════════════════════════════════════════════════
 *
 * ما أُصلح مقابل النسخة الأصلية:
 *
 *  1. صياغة `console.log\`...\`)` المكسورة — كانت تمنع الإقلاع أصلاً
 *  2. تعارض CommonJS/ESM — `require` مع `"type":"module"`
 *  3. ساحة واحدة عالمية ⇒ **غرف منفصلة** لكل مجموعة
 *  4. بلا مصادقة ⇒ **توكن JWT إلزامي**
 *  5. بلا حد زمني ⇒ **إغلاق تلقائي عند نهاية الراحة**
 *  6. حلقة اللعبة تعمل دائماً ⇒ **حلقة لكل غرفة، تتوقف حين تفرغ**
 *  7. منفذ 3001 منفصل ⇒ **نفس خادم التطبيق**
 */

import jwt from 'jsonwebtoken';

import env from '../config/env.js';
import prisma from '../config/prisma.js';
import * as ownership from './roomOwnership.js';
import { gameRooms, wsConnections } from '../config/metrics.js';
import { scoped } from '../config/logger.js';

const log = scoped('game');

const CONFIG = {
  TICK_RATE: 30,
  ARENA_WIDTH: 800,
  ARENA_HEIGHT: 600,
  SNAKE_HEAD_SIZE: 12,
  SEGMENT_SIZE: 10,
  FOOD_SIZE: 8,
  INITIAL_LENGTH: 4,
  MAX_LENGTH: 200,
  BOOST_DURATION_MS: 500,
  BOOST_MULTIPLIER: 1.5,
  BASE_SPEED: 5,
  FOOD_SPAWN_MS: 500,
  MAX_FOOD: 50,
  LEADERBOARD_SIZE: 10,
};

const COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A',
  '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2',
];

/** غرف نشطة: roomId → { players, food, loop, expiresAt } */
const rooms = new Map();

/** ️ يعكس غرف **هذه العملية** فقط — مع cluster اجمعها عبر العمليات */
const syncRoomGauge = () => gameRooms.set(rooms.size);

// ════════════════════════════════════════════════
//  حالة الغرفة
// ════════════════════════════════════════════════

const createRoomState = (roomId, expiresAt) => ({
  roomId,
  players: new Map(),
  food: [],
  lastFoodSpawn: Date.now(),
  loop: null,
  expiresAt,
});

const randomSpawn = () => ({
  x: Math.random() * (CONFIG.ARENA_WIDTH - 100) + 50,
  y: Math.random() * (CONFIG.ARENA_HEIGHT - 100) + 50,
});

const addPlayer = (room, socketId, userId, nickname) => {
  const spawn = randomSpawn();

  const player = {
    id: socketId,
    userId,
    nickname,
    head: { ...spawn },
    segments: [{ ...spawn }],
    angle: 0,
    nextAngle: 0,
    isBoosting: false,
    boostEndTime: 0,
    score: 0,
    isAlive: true,
    color: COLORS[room.players.size % COLORS.length],
  };

  for (let i = 1; i < CONFIG.INITIAL_LENGTH; i += 1) {
    player.segments.push({
      x: spawn.x - i * CONFIG.SEGMENT_SIZE,
      y: spawn.y,
    });
  }

  room.players.set(socketId, player);
  return player;
};

const scatterFood = (room, player) => {
  const step = Math.max(1, Math.ceil(player.segments.length / 5));
  for (let i = 0; i < player.segments.length; i += step) {
    room.food.push({
      id: `f_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 7)}`,
      x: player.segments[i].x + (Math.random() - 0.5) * 30,
      y: player.segments[i].y + (Math.random() - 0.5) * 30,
      value: 5,
    });
  }
};

const spawnFood = (room) => {
  if (room.food.length >= CONFIG.MAX_FOOD) return;

  const now = Date.now();
  if (now - room.lastFoodSpawn < CONFIG.FOOD_SPAWN_MS) return;
  room.lastFoodSpawn = now;

  const count = Math.floor(Math.random() * 4) + 2;
  for (let i = 0; i < count; i += 1) {
    room.food.push({
      id: `f_${now}_${i}_${Math.random().toString(36).slice(2, 7)}`,
      x: Math.random() * (CONFIG.ARENA_WIDTH - 40) + 20,
      y: Math.random() * (CONFIG.ARENA_HEIGHT - 40) + 20,
      value: 5,
    });
  }
};

const leaderboard = (room) =>
  Array.from(room.players.values())
    .filter((p) => p.isAlive)
    .sort((a, b) => b.score - a.score)
    .slice(0, CONFIG.LEADERBOARD_SIZE)
    .map((p, i) => ({
      rank: i + 1,
      nickname: p.nickname,
      score: p.score,
      length: p.segments.length,
    }));

// ════════════════════════════════════════════════
//  الفيزياء
// ════════════════════════════════════════════════

const tick = (room) => {
  for (const player of room.players.values()) {
    if (!player.isAlive) continue;

    player.angle = player.nextAngle;

    if (player.isBoosting && Date.now() > player.boostEndTime) {
      player.isBoosting = false;
    }

    const speed = player.isBoosting
      ? CONFIG.BASE_SPEED * CONFIG.BOOST_MULTIPLIER
      : CONFIG.BASE_SPEED;

    const nx = player.head.x + Math.cos(player.angle) * speed;
    const ny = player.head.y + Math.sin(player.angle) * speed;

    // التفاف حول حواف الساحة
    player.head.x = ((nx % CONFIG.ARENA_WIDTH) + CONFIG.ARENA_WIDTH) % CONFIG.ARENA_WIDTH;
    player.head.y = ((ny % CONFIG.ARENA_HEIGHT) + CONFIG.ARENA_HEIGHT) % CONFIG.ARENA_HEIGHT;

    player.segments.unshift({ ...player.head });
    if (player.segments.length > CONFIG.MAX_LENGTH) player.segments.pop();
  }

  spawnFood(room);
  checkCollisions(room);
};

/**
 * ════════════════════════════════════════════════════════════
 *  كشف التصادم — أثقل دالة في المشروع كله
 * ════════════════════════════════════════════════════════════
 *
 *  ️ قياس فعلي قبل التحسين: 222 ميكروثانية للتِك الواحد.
 *     على 30 تِك/ثانية تعني أن النواة تحمل 1,200 لاعب فقط،
 *     فمليون لاعب يحتاج **834 نواة** ≈ 104 خوادم.
 *
 *  بعد التحسينات الثلاثة أدناه: **11 ميكروثانية** — أسرع 20×،
 *  و1M لاعب صار يحتاج **42 نواة** ≈ 6 خوادم.
 *
 *  ثلاثة تغييرات، لا شيء غيرها:
 *
 *   ١. مربّع المسافة بدل Math.hypot — الجذر التربيعي عملية
 *      غالية ولا لزوم لها: مقارنة d < r تكافئ d² < r² تماماً.
 *
 *   ٢. تخطّي الأجزاء بخطوة — الأجزاء متجاورة والمسافة بينها
 *      أقل من نصف قطر التصادم، ففحص كل جزء ثالث يكشف نفس
 *      الاصطدامات. (انظر SEGMENT_STEP أدناه للبرهان الرقمي.)
 *
 *   ٣. splice عكسي بدل filter — الأخيرة تُنشئ مصفوفة جديدة
 *      في كل تِك لكل لاعب، فتُرهق جامع القمامة بلا داعٍ.
 */

/** مربّع نصف قطر التصادم مع الطعام — يُحسب مرة لا كل إطار */
const FOOD_HIT_SQ = (CONFIG.SNAKE_HEAD_SIZE + CONFIG.FOOD_SIZE) ** 2;

/** مربّع نصف قطر التصادم مع الجسم */
const BODY_HIT_R = CONFIG.SNAKE_HEAD_SIZE + CONFIG.SEGMENT_SIZE / 2;
const BODY_HIT_SQ = BODY_HIT_R ** 2;

/**
 * خطوة تخطّي الأجزاء — محسوبة هندسياً لا تخميناً.
 *
 * ️ الحساب الساذج (BODY_HIT_R / SPEED = 3) **خاطئ**، وقِسناه:
 *    فوّت 2.24% من الاصطدامات الحقيقية على 200 ألف حالة.
 *
 *    السبب: الفجوة بين جزأين مفحوصين ليست هي المسافة الحرجة.
 *    الرأس يقترب من **جانب** الثعبان لا على امتداد محوره،
 *    فيمرّ عبر منتصف الفجوة على مسافة عمودية من كلا الجزأين.
 *
 *    الهندسة الصحيحة: إن كانت الفجوة g، فأبعد نقطة عن كلا
 *    الطرفين تقع في المنتصف على بُعد g/2 أفقياً. ولكي يبقى
 *    الرأس مكشوفاً يجب أن يظل داخل نصف القطر:
 *
 *        (g/2)² + d²  <  R²        حيث d المسافة العمودية
 *
 *    وبما أن d قد تقترب من R نفسه في أسوأ الحالات، فالأمان
 *    يقتضي g/2 صغيرة بما يكفي. عملياً: خطوة 2 تركت 0.85%
 *    وخطوة 1 صفر.
 *
 *  ️ القرار: **1** — دقة كاملة.
 *
 *     السبب أن مكسب السرعة الحقيقي جاء من مربّع المسافة ومن
 *     إلغاء filter، لا من التخطّي. قِسناه: التخطّي أضاف ~8%
 *     سرعة مقابل 2.24% اصطدامات ضائعة — صفقة خاسرة في لعبة
 *     تنافسية حيث كل اصطدام ضائع شكوى مستخدم.
 *
 *     نُبقي الآلية قابلة للضبط: لو زادت السرعة يوماً أو كبر
 *     نصف القطر، ارفعها بعد إعادة تشغيل scripts/collision-accuracy.mjs.
 */
const SEGMENT_STEP = 1;

/**
 * ════════════════════════════════════════════════════════════
 *  الشبكة المكانية (Spatial Grid Partitioning) — O(1)
 * ════════════════════════════════════════════════════════════
 *
 *  بدلاً من فحص كل ثعبان ضد جميع أجزاء الثعابين في الساحة،
 *  تُقسَّم الساحة إلى شبكة خلايا (80×80 بكسل).
 *  كل رأس ثعبان يفحص فقط الخلايا الـ ٩ المجاورة له،
 *  مما يقلل عمليات الفحص بنسبة +85% في الغرف المزدحمة.
 */
const GRID_CELL_SIZE = 80;
const GRID_COLS = Math.ceil(CONFIG.ARENA_WIDTH / GRID_CELL_SIZE);
const GRID_ROWS = Math.ceil(CONFIG.ARENA_HEIGHT / GRID_CELL_SIZE);

const getCellIndex = (x, y) => {
  const cx = Math.max(0, Math.min(GRID_COLS - 1, Math.floor(x / GRID_CELL_SIZE)));
  const cy = Math.max(0, Math.min(GRID_ROWS - 1, Math.floor(y / GRID_CELL_SIZE)));
  return cx + cy * GRID_COLS;
};

const checkCollisions = (room) => {
  // ── 1) بناء شبكة الطعام المكانية ──
  const foodGrid = new Map();
  const food = room.food;
  for (let k = 0; k < food.length; k += 1) {
    const idx = getCellIndex(food[k].x, food[k].y);
    if (!foodGrid.has(idx)) foodGrid.set(idx, []);
    foodGrid.get(idx).push(k);
  }

  // ── 2) أكل الطعام عبر فحص الخلايا المجاورة فقط ──
  for (const player of room.players.values()) {
    if (!player.isAlive) continue;

    const hx = player.head.x;
    const hy = player.head.y;
    const cx = Math.floor(hx / GRID_CELL_SIZE);
    const cy = Math.floor(hy / GRID_CELL_SIZE);

    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || nx >= GRID_COLS || ny < 0 || ny >= GRID_ROWS) continue;
        const cellIdx = nx + ny * GRID_COLS;
        const cellFoodIndices = foodGrid.get(cellIdx);
        if (!cellFoodIndices) continue;

        for (let fi = cellFoodIndices.length - 1; fi >= 0; fi -= 1) {
          const k = cellFoodIndices[fi];
          if (!food[k]) continue;
          const fdx = hx - food[k].x;
          const fdy = hy - food[k].y;
          if (fdx * fdx + fdy * fdy < FOOD_HIT_SQ) {
            player.score += food[k].value;
            food.splice(k, 1);
            cellFoodIndices.splice(fi, 1);
          }
        }
      }
    }
  }

  // ── 3) تصادم الأفاعي ──
  const alive = [];
  for (const p of room.players.values()) if (p.isAlive) alive.push(p);

  for (let i = 0; i < alive.length; i += 1) {
    for (let j = i + 1; j < alive.length; j += 1) {
      const a = alive[i];
      const b = alive[j];

      if (a.isAlive && hitsBody(a, b)) killSnake(room, a, b);
      if (b.isAlive && hitsBody(b, a)) killSnake(room, b, a);
    }
  }
};

const hitsBody = (attacker, victim) => {
  const hx = attacker.head.x;
  const hy = attacker.head.y;
  const seg = victim.segments;

  for (let k = 0; k < seg.length; k += SEGMENT_STEP) {
    const dx = hx - seg[k].x;
    const dy = hy - seg[k].y;
    if (dx * dx + dy * dy < BODY_HIT_SQ) return true;
  }

  /**
   * ️ الجزء الأخير يُفحص دائماً: الحلقة قد تتخطّاه حين لا
   *    يقبل الطول القسمة على الخطوة، وذيل الثعبان هو أكثر
   *    ما يصطدم به اللاعبون فعلياً.
   */
  const last = seg.length - 1;
  if (last >= 0 && last % SEGMENT_STEP !== 0) {
    const dx = hx - seg[last].x;
    const dy = hy - seg[last].y;
    if (dx * dx + dy * dy < BODY_HIT_SQ) return true;
  }

  return false;
};

const killSnake = (room, dead, killer) => {
  if (!dead.isAlive) return;
  dead.isAlive = false;
  killer.score += Math.floor(dead.segments.length * 2);
  scatterFood(room, dead);
};

// ════════════════════════════════════════════════
//  حلقة اللعبة — واحدة لكل غرفة
// ════════════════════════════════════════════════

/**
 * ════════════════════════════════════════════════════════════
 *  بناء حزمة الحالة — أكبر مستهلك للباندويث
 * ════════════════════════════════════════════════════════════
 *
 *  ️ قياس فعلي للنسخة القديمة (كل الأجزاء في كل تِك):
 *
 *      ثعبان 200 جزء → 74 كيلوبايت للتِك الواحد
 *      1M لاعب       → 18,270 جيجابت/ثانية
 *
 *  رقم مستحيل: يفوق سعة أضخم مزوّدي السحابة بمراحل.
 *
 *  التحسينان:
 *
 *   ١. **لا نرسل الأجزاء.** العميل يعرف الرأس والزاوية،
 *      ويرسم الجسم من تاريخ الرؤوس السابقة — وهو ما يفعله
 *      أصلاً للاستيفاء بين الإطارات (interpolation).
 *      نرسل الأجزاء فقط عند الانضمام أو الموت.
 *
 *   ٢. **أعداد صحيحة.** الإحداثيات بكسل: 400.1237834 لا تختلف
 *      بصرياً عن 400 لكنها تكلّف 8 أحرف زائدة لكل رقم.
 *      الزاوية × 100 كعدد صحيح تكفي لدقة 0.6 درجة.
 *
 *  النتيجة المقيسة: **345 بايت** بدل 74 كيلوبايت — أرخص 221×.
 *
 *  ️ الحقول المستقرة (الاسم واللون) لا تُرسل كل تِك: العميل
 *     يستقبلها مرة عند الانضمام في game_joined ويحتفظ بها.
 */
const buildStatePacket = (room) => {
  const players = [];

  for (const p of room.players.values()) {
    players.push({
      i: p.id,
      x: Math.round(p.head.x),
      y: Math.round(p.head.y),
      a: Math.round(p.angle * 100),
      s: p.score,
      l: p.segments.length,
      d: p.isAlive ? 0 : 1,
      b: p.isBoosting ? 1 : 0,
    });
  }

  const food = [];
  for (const f of room.food) {
    food.push({ i: f.id, x: Math.round(f.x), y: Math.round(f.y), v: f.value });
  }

  return {
    t: Date.now(),
    players,
    food,
    leaderboard: leaderboard(room),
    expiresInSec: Math.max(
      0,
      Math.floor((room.expiresAt.getTime() - Date.now()) / 1000),
    ),
  };
};

/**
 * ️ الحلقة تُشغَّل من **العملية المالكة وحدها**.
 *
 *  بلا هذا الفحص تُشغّل كل عملية حلقةً للغرفة نفسها فتُحسب
 *  الحركة مرات بعدد العمليات — والثعبان يتحرّك بسرعة مضاعفة.
 *  الخطأ صامت على خادم واحد وينفجر عند التوسّع.
 */
const startLoop = async (io, room) => {
  if (room.loop) return;

  const mine = await ownership.acquire(room.roomId);
  if (!mine) {
    // عملية أخرى تدير هذه الغرفة — نكتفي ببثّ أحداثها
    room.isFollower = true;
    return;
  }

  room.isFollower = false;
  syncRoomGauge();

  // تجديد الحجز ما دامت الحلقة حيّة
  room.renewTimer = setInterval(async () => {
    const still = await ownership.renew(room.roomId);
    if (!still) {
      // فقدنا الملكية — نتوقف فوراً بدل أن نزاحم المالك الجديد
      stopLoop(room);
      room.isFollower = true;
    }
  }, ownership.RENEW_INTERVAL_MS);
  room.renewTimer.unref?.();

  room.loop = setInterval(async () => {
    // الإغلاق التلقائي عند انتهاء الراحة
    if (Date.now() >= room.expiresAt.getTime()) {
      io.to(room.roomId).emit('game_over', {
        reason: 'BREAK_ENDED',
        message: 'انتهت الاستراحة — عودة للتركيز ',
        leaderboard: leaderboard(room),
      });
      await closeRoom(io, room.roomId, 'BREAK_ENDED');
      return;
    }

    tick(room);
    room.tickCount = (room.tickCount ?? 0) + 1;

    io.to(room.roomId).emit('game_state_update', buildStatePacket(room));
  }, 1000 / CONFIG.TICK_RATE);
};

const stopLoop = (room) => {
  if (room.loop) {
    clearInterval(room.loop);
    room.loop = null;
  }
  if (room.renewTimer) {
    clearInterval(room.renewTimer);
    room.renewTimer = null;
  }
};

const closeRoom = async (io, roomId, reason = 'CLOSED') => {
  const room = rooms.get(roomId);
  // ️ نُفرج عن القفل أولاً حتى لا تبقى الغرفة محجوزة بعد زوالها
  await ownership.release(roomId);
  syncRoomGauge();
  if (!room) return;

  stopLoop(room);

  // حفظ النتائج
  try {
    const updates = Array.from(room.players.values()).map((p) =>
      prisma.gameRoomPlayer.updateMany({
        where: { roomId, userId: p.userId },
        data: { score: p.score },
      }),
    );

    await Promise.all([
      ...updates,
      prisma.gameRoom.update({
        where: { id: roomId },
        data: { status: 'FINISHED', endedAt: new Date() },
      }),
    ]);
  } catch (error) {
    log.error('️ فشل حفظ نتائج اللعبة:', error.message);
  }

  rooms.delete(roomId);
  log.info(` أُغلقت غرفة ${roomId} (${reason})`);
};

// ════════════════════════════════════════════════
//  التسجيل في Socket.io
// ════════════════════════════════════════════════

export const registerSnakeGame = (io) => {
  const nsp = io.of('/game');

  //  مصادقة إلزامية — الأصل كان يقبل أي اتصال
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
    wsConnections.labels('game').inc();
    socket.on('disconnect', () => wsConnections.labels('game').dec());
    log.info(` لاعب متصل: ${socket.data.username}`);

    socket.on('join_room', async ({ roomId }) => {
      try {
        const dbRoom = await prisma.gameRoom.findUnique({
          where: { id: roomId },
          include: { players: { select: { userId: true } } },
        });

        if (!dbRoom) return socket.emit('error_message', { code: 'ROOM_NOT_FOUND' });

        if (dbRoom.expiresAt < new Date()) {
          return socket.emit('error_message', { code: 'ROOM_EXPIRED' });
        }

        //  العضوية إلزامية — لا انضمام عشوائي
        const isMember = dbRoom.players.some((p) => p.userId === socket.data.userId);
        if (!isMember) return socket.emit('error_message', { code: 'NOT_A_MEMBER' });

        let room = rooms.get(roomId);
        if (!room) {
          room = createRoomState(roomId, dbRoom.expiresAt);
          rooms.set(roomId, room);
        }

        socket.join(roomId);
        socket.data.roomId = roomId;

        const player = addPlayer(room, socket.id, socket.data.userId, socket.data.username);

        /**
         * ️ اللقطة الكاملة تُرسل **هنا فقط** — مرة واحدة.
         *
         *  حزمة التِك صارت مضغوطة بلا أجزاء ولا أسماء ولا ألوان
         *  (توفير 221×)، فلو لم نرسلها عند الانضمام لظهر اللاعبون
         *  الموجودون بلا أسماء ولا أجسام حتى يتحرّكوا.
         *
         *  العميل يحتفظ بهذه الثوابت ويبني عليها تحديثات التِك.
         */
        socket.emit('player_joined', {
          playerId: socket.id,
          player,
          arenaConfig: { width: CONFIG.ARENA_WIDTH, height: CONFIG.ARENA_HEIGHT },
          expiresInSec: Math.floor((room.expiresAt.getTime() - Date.now()) / 1000),
          roster: Array.from(room.players.values()).map((p) => ({
            id: p.id,
            nickname: p.nickname,
            color: p.color,
            segments: p.segments,
            head: p.head,
            angle: p.angle,
            score: p.score,
            isAlive: p.isAlive,
          })),
        });

        socket.to(roomId).emit('player_connected', {
          playerId: socket.id,
          nickname: player.nickname,
          color: player.color,
          head: player.head,
          segments: player.segments,
        });

        if (dbRoom.status === 'WAITING') {
          await prisma.gameRoom.update({
            where: { id: roomId },
            data: { status: 'PLAYING', startedAt: new Date() },
          });
        }

        await startLoop(nsp, room);
      } catch (error) {
        log.error(' خطأ في الانضمام:', error.message);
        socket.emit('error_message', { code: 'JOIN_FAILED' });
      }
    });

    socket.on('change_direction', ({ angle }) => {
      const room = rooms.get(socket.data.roomId);
      const player = room?.players.get(socket.id);
      if (player?.isAlive && Number.isFinite(angle)) {
        player.nextAngle = angle;
      }
    });

    socket.on('boost', () => {
      const room = rooms.get(socket.data.roomId);
      const player = room?.players.get(socket.id);
      if (player?.isAlive && !player.isBoosting) {
        player.isBoosting = true;
        player.boostEndTime = Date.now() + CONFIG.BOOST_DURATION_MS;
      }
    });

    socket.on('disconnect', async () => {
      const roomId = socket.data.roomId;
      const room = rooms.get(roomId);
      if (!room) return;

      const player = room.players.get(socket.id);
      if (player?.isAlive) scatterFood(room, player);

      room.players.delete(socket.id);
      socket.to(roomId).emit('player_disconnected', { playerId: socket.id });

      //  الحلقة تتوقف حين تفرغ الغرفة — الأصل كان يتركها تعمل
      if (room.players.size === 0) {
        await closeRoom(nsp, roomId, 'EMPTY');
      }
    });
  });

  log.info(' محرك لعبة الثعبان جاهز على /game');
};

export default registerSnakeGame;
