/**
 * يشغّل السيرفر كامل بالسوكيت — للفحص الحي.
 * npm run harness
 */
process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/t';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.JWT_ACCESS_SECRET ??= 'harness-access-secret-long-enough-0000';
process.env.JWT_REFRESH_SECRET ??= 'harness-refresh-secret-long-enough-11';
process.env.ENABLE_EMAIL_AUTH = 'true';
process.env.NODE_ENV = 'development';
process.env.LOG_LEVEL ??= 'silent';
process.env.PORT ??= '3999';

const { Server } = await import('socket.io');
const app = (await import('../../src/app.js')).default;
const registerNotificationSocket = (await import('../../src/sockets/notification.socket.js')).default;
const registerChatSocket = (await import('../../src/sockets/chat.socket.js')).default;

const server = app.listen(Number(process.env.PORT), '0.0.0.0', () => {
  console.log('HARNESS_UP ' + process.env.PORT);
});

const io = new Server(server, { cors: { origin: true, credentials: true } });
app.set('io', io);
registerNotificationSocket(io);
registerChatSocket(io);
console.log('SOCKETS_READY');
