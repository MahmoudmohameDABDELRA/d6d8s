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

/**
 * ️ رفع حدود المعدّل للفحص — وليه مش تعديل في كود الإنتاج:
 *
 *  الحدود (١٠ تسجيلات كل ١٥ دقيقة) **صح تماماً** للإنتاج: من
 *  غيرها أي حد يعمل آلاف الحسابات. المشكلة إن الفحوص بتعمل
 *  عشرات المستخدمين في ثواني، فبتستهلك الحد وترجع 429 —
 *  والفحص بيفشل لسبب مالوش علاقة بالكود اللي بنفحصه.
 *
 *  ده ضيّع وقت أكتر من مرة: probe يرجع كله أحمر، وأول ما
 *  السيرفر يترستارت يرجع كله أخضر. الرقم اللي بيتغيّر مع
 *  إعادة التشغيل مش نتيجة فحص.
 *
 *  `RATE_LIMIT_RELAXED` بيتقرا في app.js وبيرفع الحد للفحص بس.
 */
process.env.RATE_LIMIT_RELAXED = '1';
process.env.LOG_LEVEL ??= 'silent';
process.env.PORT ??= '3999';

const { Server } = await import('socket.io');
const app = (await import('../../src/app.js')).default;
const registerNotificationSocket = (await import('../../src/sockets/notification.socket.js')).default;
const registerChatSocket = (await import('../../src/sockets/chat.socket.js')).default;
/**
 * ️ قناة اللعبة كانت **ناقصة من الفحص**.
 *
 *  `src/server.js` بيسجّل التلاتة (إشعارات + شات + لعبة) لكن
 *  الـharness كان بيسجّل اتنين بس. النتيجة إن أي فحص للعبة
 *  كان بيرجع «Invalid namespace» — ومحرّك الـ٦٦٣ سطر ما اتفحصش
 *  ولا مرة من عميل حقيقي.
 */
const registerSnakeGame = (await import('../../src/sockets/snake.game.js')).default;

const server = app.listen(Number(process.env.PORT), '0.0.0.0', () => {
  console.log('HARNESS_UP ' + process.env.PORT);
});

const io = new Server(server, { cors: { origin: true, credentials: true } });
app.set('io', io);
registerNotificationSocket(io);
registerChatSocket(io);
registerSnakeGame(io);
console.log('SOCKETS_READY');
