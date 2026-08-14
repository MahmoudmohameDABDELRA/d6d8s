// ️ أول سطر: يحمّل .env ويتحقق منه قبل أي وحدة تقرأ process.env
import env from './config/env.js';

import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import prisma from './config/prisma.js';
import redisClient from './config/redis.js';
import * as userCache from './services/userCache.service.js';
import logger from './config/logger.js';
import { metricsMiddleware, registry } from './config/metrics.js';
import { requestLogger } from './middlewares/logging.middleware.js';

import { errorHandler, notFoundHandler } from './middlewares/error.middleware.js';
import authRoutes from './modules/auth/auth.routes.js';
import clanRoutes from './modules/clan/clan.routes.js';
import focusRoutes from './modules/focus/focus.routes.js';
import taskRoutes from './modules/task/task.routes.js';
import achievementRoutes from './modules/achievement/achievement.routes.js';
import alarmRoutes from './modules/alarm/alarm.routes.js';
import chatRoutes from './modules/chat/chat.routes.js';
import gameRoutes from './modules/game/game.routes.js';
import videoRoutes from './modules/video/video.routes.js';
import journalRoutes from './modules/journal/journal.routes.js';
import noteRoutes from './modules/note/note.routes.js';
import aiRoutes from './modules/ai/ai.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';
import notificationRoutes from './modules/notification/notification.routes.js';
import audioRoutes from './modules/audio/audio.routes.js';
import referralRoutes from './modules/referral/referral.routes.js';
import insightRoutes from './modules/insight/insight.routes.js';
import humanRoutes from './modules/human/human.routes.js';
import analyticsRoutes from './modules/analytics/analytics.routes.js';
import socialRoutes from './modules/social/social.routes.js';

const app = express();

// مطلوب خلف Nginx/Heroku ليقرأ rate-limit عنوان IP الحقيقي
if (env.trustProxy) app.set('trust proxy', 1);

app.disable('x-powered-by');

/**
 * ️ التسجيل والقياس **أول** السلسلة عمداً.
 */
app.use(requestLogger);
app.use(metricsMiddleware);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false,
    frameguard: false,
  }),
);

app.use(
  cors({
    origin(origin, callback) {
      if (
        !origin ||
        env.corsOrigins.includes(origin) ||
        origin.endsWith('.e2b.app') ||
        origin.includes('localhost') ||
        origin.includes('127.0.0.1')
      ) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
  }),
);

//  حد لحجم الجسم
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

//  cookieParser قبل الراوترات التي تقرأ req.cookies
app.use(cookieParser());

// ⚠️ الفرونت إند الرسمي هو تطبيق Flutter (clan_flutter_app/) — لا يوجد ويب يُخدم من الباك إند.
// أُزيل express.static للـ public/ القديم: لا فرونت ويب موازٍ يعمل بعد الآن.

// فحص الصحة قبل الـ rate limiter حتى لا تستهلكه أدوات المراقبة
app.get('/api/status', (req, res) => {
  res.json({ status: 'ok', message: 'Clan App Backend Running' });
});

/**
 * ════════════════════════════════════════════════════════════
 *  فحص الصحة — يفحص المخازن فعلاً
 * ════════════════════════════════════════════════════════════
 *
 *  ️ النسخة السابقة كانت **تكذب**: ترجع 200 {status:'ok'}
 *     حتى لو Postgres و Redis و Mongo كلها واقعة، لأنها لم
 *     تفحص إلا `process.uptime()`.
 *
 *     النتيجة: موازن الحمل يوجّه المرور بسعادة إلى نسخة معطوبة
 *     تماماً، ولا شيء يسحبها من الدوران.
 *
 *  ️ مهلة قصيرة لكل فحص: الفحص الذي يعلّق أسوأ من الفحص الفاشل
 *     لأن الموازن ينتظره بدل أن يستبعد النسخة.
 *
 *  ️ 503 لا 200 عند الفشل — هذا هو الجزء الذي يجعل الفحص مفيداً.
 *     Mongo وحده لا يُسقط الحالة إلى unhealthy: الشات يتعطّل
 *     لكن بقية التطبيق تعمل، فالسحب من الدوران مبالغة.
 */
const withTimeout = (promise, ms) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), ms)),
  ]);

app.get('/health', async (req, res) => {
  const checks = {};
  const t0 = Date.now();

  const [pg, redis] = await Promise.allSettled([
    withTimeout(prisma.$queryRaw`SELECT 1`, 1000),
    withTimeout(
      redisClient?.isOpen ? redisClient.ping() : Promise.reject(new Error('CLOSED')),
      1000,
    ),
  ]);

  checks.postgres = pg.status === 'fulfilled' ? 'up' : 'down';
  checks.redis = redis.status === 'fulfilled' ? 'up' : 'down';

  // Postgres شرط الحياة — بدونه لا مصادقة ولا شيء
  const healthy = checks.postgres === 'up';

  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'unhealthy',
    checks,
    /** ️ تدهور جزئي: يعمل لكن ناقص — مفيد للتنبيه لا للسحب */
    degraded: checks.redis === 'down',
    cache: userCache.stats,
    uptime: process.uptime(),
    latencyMs: Date.now() - t0,
    env: env.nodeEnv,
  });
});

/**
 * مخرج Prometheus.
 *
 * ️ لا يُعرَّض للإنترنت العام إطلاقاً.
 *    يكشف بنية المسارات وأحجام الحركة والـ Latency، وهي معلومة
 *    استطلاع قيّمة لأي مهاجم.
 *
 *    الحماية:
 *    1. إذا تم ضبط METRICS_TOKEN في .env، يُلزم بتقديمه في ترويسة x-metrics-token أو Bearer.
 *    2. في الإنتاج (Production)، إن لم يُضبط توكن يُرفض فوراً بـ 404.
 *    3. في التطوير، يُسمح فقط بطلبات localhost المحلية.
 */
app.get('/metrics', async (req, res) => {
  const token =
    req.headers['x-metrics-token'] ||
    req.headers.authorization?.replace(/^Bearer\s+/i, '');
  const ip = req.ip || req.socket.remoteAddress || '';
  const isLocalhost =
    ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip) ||
    req.hostname === 'localhost';

  if (env.metricsToken) {
    if (token !== env.metricsToken) {
      return res.status(403).json({ success: false, message: 'غير مصرح بالوصول إلى المقاييس' });
    }
  } else if (env.isProduction) {
    return res.status(404).end();
  }

  res.set('Content-Type', registry.contentType);
  res.end(await registry.metrics());
});

/** فحص خفيف للـ liveness — هل العملية حيّة أصلاً؟ */
app.get('/health/live', (req, res) => {
  res.json({ status: 'alive', uptime: process.uptime() });
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, //  كان 15 *60* 1000 (تلف Markdown)
  max: process.env.NODE_ENV === 'test' ? 100_000 : 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'عدد الطلبات كبير جداً، حاول لاحقاً' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 100_000 : 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true, // لا نعاقب المستخدم على تسجيل دخول ناجح
  message: {
    success: false,
    message: 'محاولات كثيرة جداً، حاول بعد 15 دقيقة',
  },
});

app.use('/api', apiLimiter);

// حد أشد على نقاط الدخول الحساسة فقط (وليس /refresh حتى لا تُقطع الجلسات)
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/clans', clanRoutes);
app.use('/api/focus', focusRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/achievements', achievementRoutes);
app.use('/api/videos', videoRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/alarms', alarmRoutes);
app.use('/api/goals', journalRoutes);
app.use('/api/notes', noteRoutes);
app.use('/api/drafts', noteRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/audio', audioRoutes);
app.use('/api/referrals', referralRoutes);
app.use('/api/insights', insightRoutes);
app.use('/api/human', humanRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/social', socialRoutes);

// ── الفرونت إند الرسمي: تطبيق Flutter (نسخة ويب) ──
// يخدم build/web الناتج من clan_flutter_app على نفس نطاق الـ API
// (يعمل أيضاً محلياً: node src/server.js ثم افتح http://localhost:3000)
import fs from 'node:fs';
const flutterWebDir = path.join(__dirname, '../clan_flutter_app/build/web');
if (fs.existsSync(path.join(flutterWebDir, 'index.html'))) {
  app.use(express.static(flutterWebDir));
  // SPA fallback: أي مسار غير /api يروح لـ index.html (توجيه Flutter الداخلي)
  app.get(/^\/(?!api\/|socket\.io\/|metrics).*/, (req, res) => {
    res.sendFile(path.join(flutterWebDir, 'index.html'));
  });
}

// يجب أن يكونا آخر ما يُسجَّل
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
