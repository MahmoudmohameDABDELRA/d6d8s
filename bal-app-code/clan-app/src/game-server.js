/**
 * ════════════════════════════════════════════════════════════
 *  خادم الألعاب والسوكت المنفصل — Dedicated Game & Socket Server
 * ════════════════════════════════════════════════════════════
 *
 *  ️ الغرض المعماري الحاسم:
 *
 *   تشغيل حلقة لعبة الثعبان (30 FPS) وحسابات الـ Physics
 *   في **عملية Node.js منفصلة تماماً** عن خادم الـ REST API.
 *
 *   المشكلة التي يحلّها:
 *     100 غرفة لعبة نشطة = 3,000 تِك في الثانية + حسابات تصادم
 *     مكثفة. تشغيلها على خادم الـ API كان يرفع زمن تأخر حلقة الأحداث
 *     (Event Loop Lag) إلى أكثر من 800ms ويجمد طلبات المصادقة والمهام.
 *
 *   الفصل يمنح:
 *     1. حلقة أحداث نظيفة للـ REST API بدون أي تأخير.
 *     2. توسع مستقل: يمكن تشغيل 5 خوادم ألعاب خلف Redis Adapter
 *        دون لمس خوادم الـ REST.
 *     3. في حال انهيار عملية لعبة بسبب OOM، لا يتأثر التطبيق الأساسي.
 */

import http from 'node:http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';

import env from './config/env.js';
import { scoped } from './config/logger.js';
import registerSnakeGame from './sockets/snake.game.js';
import registerDominoGame from './sockets/domino.game.js';
import registerChatSocket from './sockets/chat.socket.js';
import { connectRedis, disconnectRedis, redisClient } from './config/redis.js';
import { disconnectPrisma } from './config/prisma.js';

const log = scoped('game-server');

const GAME_PORT = Number(process.env.GAME_PORT) || 3001;

const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(
      JSON.stringify({
        status: 'ok',
        service: 'clan-game-server',
        uptime: process.uptime(),
        memoryBytes: process.memoryUsage().rss,
      }),
    );
  }
  res.writeHead(404);
  res.end();
});

const io = new Server(server, {
  cors: { origin: env.corsOrigins, credentials: true },
  transports: ['websocket', 'polling'],
  pingTimeout: 20000,
  pingInterval: 10000,
});

const shutdown = async (signal) => {
  log.info(`\n${signal} — جارٍ إغلاق خادم الألعاب المخصص بأمان...`);
  const force = setTimeout(() => {
    log.error('⏱️ انتهت المهلة — إنهاء إجباري لخادم الألعاب');
    process.exit(1);
  }, 5000);
  force.unref();

  try {
    io.close();
    await new Promise((resolve) => server.close(resolve));
    await Promise.allSettled([disconnectPrisma(), disconnectRedis()]);
    clearTimeout(force);
    log.info(' تم إغلاق خادم الألعاب بنظافة');
    process.exit(0);
  } catch (error) {
    log.error(' خطأ أثناء إغلاق خادم الألعاب:', error);
    process.exit(1);
  }
};

export const startGameServer = async () => {
  try {
    await connectRedis();

    try {
      const pubClient = redisClient.duplicate();
      const subClient = redisClient.duplicate();
      await Promise.all([pubClient.connect(), subClient.connect()]);
      io.adapter(createAdapter(pubClient, subClient));
      log.info(' Game Server: تم تفعيل Redis Adapter للتوسع الأفقي');
    } catch (err) {
      log.warn(`️ Game Server: يعمل محلياً بلا Redis Adapter (${err.message})`);
    }

    registerSnakeGame(io);
    registerDominoGame(io);
    registerChatSocket(io);

    server.listen(GAME_PORT, '0.0.0.0', () => {
      log.info(` خادم الألعاب والسوكت المنفصل يعمل على 0.0.0.0:${GAME_PORT}`);
    });
  } catch (error) {
    log.error(' فشل إقلاع خادم الألعاب:', error);
    process.exit(1);
  }
};

['SIGINT', 'SIGTERM'].forEach((sig) => process.on(sig, () => shutdown(sig)));

const isDirectRun =
  process.argv[1] && import.meta.url === `file://${process.argv[1]}`;

if (isDirectRun) {
  startGameServer();
}

export default { server, io, startGameServer };
