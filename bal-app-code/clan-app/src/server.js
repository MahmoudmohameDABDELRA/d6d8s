// ️ يجب أن يبقى هذا أول استيراد في الملف
import env from './config/env.js';
import { scoped } from './config/logger.js';

const log = scoped('server');

import { Server } from 'socket.io';

import app from './app.js';
import registerChatSocket from './sockets/chat.socket.js';
import registerNotificationSocket from './sockets/notification.socket.js';
import registerSnakeGame from './sockets/snake.game.js';
import registerDominoGame from './sockets/domino.game.js';
import { connectPostgres, disconnectPostgres } from './config/db.js';
import { disconnectPrisma } from './config/prisma.js';
import { createAdapter } from '@socket.io/redis-adapter';

import { connectRedis, disconnectRedis, redisClient } from './config/redis.js';
import { closeQueues, scheduleRepeatables } from './queues/index.js';

let server;

const shutdown = async (signal) => {
  log.info(`\n${signal} — جارٍ الإغلاق بأمان...`);

  // مهلة قصوى: لا نعلّق العملية إلى الأبد
  const force = setTimeout(() => {
    log.error('⏱️  انتهت مهلة الإغلاق — إنهاء إجباري');
    process.exit(1);
  }, 10_000);
  force.unref();

  try {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
      log.info(' HTTP server closed');
    }

    await Promise.allSettled([
      disconnectPrisma(),
      disconnectPostgres(),
      disconnectRedis(),
      closeQueues(),
    ]);

    clearTimeout(force);
    process.exit(0);
  } catch (error) {
    log.error(' خطأ أثناء الإغلاق:', error);
    process.exit(1);
  }
};

const startServer = async () => {
  try {
    try {
      await connectPostgres();
    } catch (error) {
      log.warn(`️ PostgreSQL connection note: ${error.message}`);
    }

    try {
      await connectRedis();
    } catch (error) {
      log.warn(`️ Redis connection note: ${error.message}`);
    }

    server = app.listen(env.port, '0.0.0.0', () => {
      log.info(` Server running on 0.0.0.0:${env.port} [${env.nodeEnv}]`);
    });

    // Socket.io على نفس المنفذ — لا خادم منفصل
    const io = new Server(server, {
      cors: { origin: env.corsOrigins, credentials: true },
      transports: ['websocket', 'polling'],
    });

    /**
     * ════════════════════════════════════════════════════════
     *  Redis Adapter — شرط التوسّع الأفقي
     * ════════════════════════════════════════════════════════
     *
     *  ️ بدونه لا يعمل أكثر من عملية واحدة إطلاقاً:
     *     `io.to(room).emit()` يصل فقط للمتصلين بالعملية نفسها،
     *     فلاعب في العملية A لا يرى صاحبه في العملية B — يجلسان
     *     في "غرفة واحدة" ولا يريان بعضهما.
     *
     *  ️ الـ adapter يوزّع الرسائل **لا الحلقة**. ملكية الغرفة
     *     تُحسم في `sockets/roomOwnership.js` بقفل Redis منفصل،
     *     وإلا شغّلت كل عملية حلقة الغرفة نفسها.
     *
     *  ️ يحتاج اتصالين مستقلين (نشر واشتراك) لأن عميل Redis
     *     في وضع الاشتراك لا يقبل أوامر عادية. لذا ننسخ العميل
     *     القائم بدل إنشاء اتصالات جديدة بإعدادات مختلفة.
     */
    try {
      const pubClient = redisClient.duplicate();
      const subClient = redisClient.duplicate();
      await Promise.all([pubClient.connect(), subClient.connect()]);
      io.adapter(createAdapter(pubClient, subClient));
      log.info(' Socket.io Redis adapter مفعّل — التوسّع الأفقي متاح');
    } catch (error) {
      /**
       * ️ الفشل هنا لا يوقف الخادم: عملية واحدة تعمل بلا adapter
       *    تماماً. تعطيل التطبيق كله بسبب ميزة توسّع لا معنى له.
       */
      log.warn(
        `️  تعذّر تفعيل Redis adapter (${error.message}) — عملية واحدة فقط`,
      );
    }

    // متاح للكنترولرات للبث بعد الإرسال عبر REST
    app.set('io', io);

    registerChatSocket(io);
    /**
     * ⭐ قناة الإشعارات اللحظية — بيها البوب-أب بتاع «عملت إيه في
     *    المهمة؟» بيطلع فوراً والتطبيق مفتوح، وبيها رد الرفيق بيوصل
     *    لباقي أجهزة المستخدم في نفس اللحظة.
     */
    registerNotificationSocket(io);
    registerSnakeGame(io);
    registerDominoGame(io);

    /**
     * ️ الـ API يجدول ولا ينفّذ.
     *
     *  قِسنا: `checkEligibility` يستغرق 7.2ms للمستخدم الواحد،
     *  والمسح على 10 آلاف مستخدم يحجب حلقة الأحداث **72 ثانية**.
     *  تشغيله هنا يعني توقّف كل الطلبات طوال المدة.
     *
     *  الجدولة رخيصة (كتابة في Redis)، والتنفيذ يحدث في
     *  `node src/queues/worker.js` — عملية منفصلة بحلقة أحداث
     *  خاصة بها.
     *
     *  ️ يفشل مفتوحاً: تعذّر الجدولة لا يمنع خدمة المستخدمين.
     */
    try {
      await scheduleRepeatables();
    } catch (error) {
      log.warn({ err: error.message }, '️ تعذّرت جدولة المهام المتكررة');
    }

    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        log.error(` المنفذ ${env.port} مستخدم بالفعل`);
      } else {
        log.error(' HTTP server error:', error);
      }
      process.exit(1);
    });
  } catch (error) {
    //  الخروج عند فشل الإقلاع — سابقاً كان يُسجَّل الخطأ فقط
    //    فتبقى العملية حيّة بلا قواعد بيانات ولا سيرفر.
    log.error(' Server startup error:', error);
    process.exit(1);
  }
};

['SIGINT', 'SIGTERM'].forEach((signal) => {
  process.on(signal, () => shutdown(signal));
});

process.on('unhandledRejection', (reason) => {
  log.error(' Unhandled Rejection:', reason);
  shutdown('unhandledRejection');
});

process.on('uncaughtException', (error) => {
  log.error(' Uncaught Exception:', error);
  process.exit(1);
});

startServer();
