/**
 * ═══════════════════════════════════════════════════════════
 *  اختبار HTTP لمسار الرد داخل البوب-أب
 *
 *  POST /api/notifications/:id/reply
 *
 *  بيختبر المسار كامل عبر Express حقيقي، مع بدائل وهمية لـ
 *  Prisma و Gemini (مش عايزين قاعدة بيانات ولا نداءات مدفوعة).
 *
 *  الحالات:
 *    1. إشعار مش بتاعي            → 404
 *    2. إشعار مش بيقبل رد          → 403
 *    3. رد فاضي                    → 400
 *    4. رد أطول من الحد            → 400
 *    5. رسالة أزمة                 → 200 + بروتوكول الدعم بلا نداء AI
 *    6. رد سليم                    → 200 + رد الرفيق + الإشعار اتقرا
 *    7. الـ AI واقع                → 200 + source=SYSTEM بلا ادعاء
 *    8. GET /thread                → المحادثة كاملة
 *
 *  التشغيل:  node --import ./test/checkin-reply.setup.mjs test/checkin-reply.test.mjs
 *  أو:       npm run test:checkin
 * ═══════════════════════════════════════════════════════════
 */
process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/test';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-that-is-long-enough-1234';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-that-is-long-enough-56';
process.env.NODE_ENV = 'test';

import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';

import { state } from './checkin-reply.mocks.mjs';

const {
  replyToNotification,
  getNotificationThread,
  openTaskCheckIn,
} = await import('../src/modules/notification/notificationReply.controller.js');

// ── تطبيق اختبار صغير: مستخدم ثابت + معالج أخطاء ──
const USER_ID = 'user-1';

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.user = { userId: USER_ID };
  next();
});
app.post('/api/notifications/checkin/open', openTaskCheckIn);
app.post('/api/notifications/:id/reply', replyToNotification);
app.get('/api/notifications/:id/thread', getNotificationThread);
app.use((err, _req, res, _next) => {
  res
    .status(err.statusCode || 500)
    .json({ success: false, code: err.code, message: err.message });
});

const server = app.listen(0);
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

test.after(() => server.close());

const post = async (id, body) => {
  const res = await fetch(`${base}/api/notifications/${id}/reply`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};

// ════════════════════════════════════════════════
test('إشعار مش بتاع المستخدم → 404', async () => {
  const res = await post('notif-of-someone-else', { text: 'خلصتها' });
  assert.equal(res.status, 404);
  assert.equal(res.body.code, 'NOTIFICATION_NOT_FOUND');
});

test('إشعار مش بيقبل رد → 403', async () => {
  const res = await post('notif-plain', { text: 'تمام' });
  assert.equal(res.status, 403);
  assert.equal(res.body.code, 'NOTIFICATION_NOT_REPLYABLE');
});

test('رد فاضي → 400', async () => {
  assert.equal((await post('notif-checkin', { text: '' })).status, 400);
  assert.equal((await post('notif-checkin', {})).status, 400);
  assert.equal((await post('notif-checkin', { text: '   ' })).status, 400);
  assert.equal((await post('notif-checkin', { text: 123 })).status, 400);
});

test('رد أطول من الحد → 400', async () => {
  const res = await post('notif-checkin', { text: 'ا'.repeat(5000) });
  assert.equal(res.status, 400);
  assert.equal(res.body.code, 'REPLY_TOO_LONG');
});

// ════════════════════════════════════════════════
test('رسالة أزمة → دعم فوري بلا نداء AI', async () => {
  state.geminiCalls = 0;

  const res = await post('notif-checkin', { text: 'عايز اموت مش قادر اكمل' });

  assert.equal(res.status, 200);
  assert.equal(res.body.crisis, true);
  assert.equal(res.body.source, 'CRISIS_PROTOCOL');
  assert.ok(res.body.reply && res.body.reply.length > 0);
  assert.equal(
    state.geminiCalls,
    0,
    'ممنوع نداء الـ AI في لحظة أزمة — الرد لازم يكون ثابت ومراجَع',
  );
});

// ════════════════════════════════════════════════
test('رد سليم → رد الرفيق + الإشعار اتقرا', async () => {
  state.reset();
  state.geminiReply = 'جامد إنك خلصت نصها  إيه اللي وقف قدامك في الباقي؟';

  const res = await post('notif-checkin', { text: 'خلصت نص المهمة بس اتشتت' });

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.source, 'AI');
  assert.match(res.body.reply, /خلصت نصها/);
  assert.equal(state.geminiCalls, 1);

  // الإشعار اتعلّم مقروء
  assert.equal(state.updatedNotifications.length, 1);
  assert.equal(state.updatedNotifications[0].data.isRead, true);

  // السياق وصل للنموذج: المهمة والحلم
  const { system } = state.lastGeminiArgs;
  assert.match(system, /مذاكرة Dart/, 'اسم المهمة لازم يوصل للنموذج');
  assert.match(system, /أكون مبرمج/, 'الحلم الكبير لازم يوصل للنموذج');
  assert.match(system, /الاحتواء وإعادة التوجيه/, 'قواعد TASK_FOLLOWUP لازم تتطبق');
  assert.match(system, /ممنوع/, 'قواعد المنع لازم تكون موجودة');
});

// ════════════════════════════════════════════════
test('الـ AI واقع → SYSTEM بلا ادعاء إنه الرفيق', async () => {
  state.reset();
  state.geminiError = Object.assign(new Error('GEMINI_NOT_CONFIGURED'), {
    code: 'GEMINI_NOT_CONFIGURED',
  });

  const res = await post('notif-checkin', { text: 'عملت حاجة كويسة' });

  assert.equal(res.status, 200, 'كلام المستخدم ما يضيعش حتى لو الـ AI واقع');
  assert.equal(res.body.source, 'SYSTEM');
  assert.match(res.body.reply, /مش متاح/, 'لازم نقول الحقيقة صراحةً');
});

// ════════════════════════════════════════════════
test('GET /thread بيرجّع المحادثة والحالة', async () => {
  const res = await fetch(`${base}/api/notifications/notif-checkin/thread`);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.canReply, true);
  assert.equal(body.notification.id, 'notif-checkin');
  assert.ok(Array.isArray(body.messages));
  assert.ok(typeof body.turnsLeft === 'number');
});

test('GET /thread لإشعار مش بتاعي → 404', async () => {
  const res = await fetch(
    `${base}/api/notifications/notif-of-someone-else/thread`,
  );
  assert.equal(res.status, 404);
});

// ════════════════════════════════════════════════
//  POST /api/notifications/checkin/open
//  البوب-أب طلع محلياً الساعة 6 — محتاج خيط يرد عليه
// ════════════════════════════════════════════════

const openCheckin = async (body) => {
  const res = await fetch(`${base}/api/notifications/checkin/open`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};

test('فتح خيط لمهمة بلا إشعار → إشعار جديد', async () => {
  state.reset();

  const res = await openCheckin({
    taskId: 'task-breakfast',
    question: 'إيه أخبار «الفطار»؟ عملت فيها إيه؟',
  });

  assert.equal(res.status, 201);
  assert.equal(res.body.created, true);
  assert.ok(res.body.notificationId, 'لازم يرجع معرّف يرد عليه');

  // ️ النص المخزّن لازم يطابق اللي المستخدم شافه في البوب-أب
  assert.equal(res.body.question, 'إيه أخبار «الفطار»؟ عملت فيها إيه؟');

  const created = state.createdNotifications[0];
  assert.equal(created.data.canReply, true, 'من غيرها الرد هيترفض بـ 403');
  assert.equal(created.data.taskId, 'task-breakfast');
  assert.equal(created.data.source, 'CLIENT');
  assert.equal(created.isRead, true, 'المستخدم شايفه دلوقتي في البوب-أب');
});

test('فتح خيط لمهمة ليها إشعار → نفس الإشعار مش جديد', async () => {
  state.reset();

  const res = await openCheckin({ taskId: 'task-1' });

  assert.equal(res.status, 200);
  assert.equal(res.body.created, false, 'ممنوع خيطين لنفس المهمة');
  assert.equal(res.body.notificationId, 'notif-checkin');
  assert.equal(
    state.createdNotifications.length,
    0,
    'ماينفعش نخلق إشعار والموجود كفاية',
  );
});

test('فتح خيط لمهمة مش بتاعتي → 404', async () => {
  state.reset();
  const res = await openCheckin({ taskId: 'task-of-someone-else' });
  assert.equal(res.status, 404);
  assert.equal(res.body.code, 'TASK_NOT_FOUND');
});

test('فتح خيط بلا taskId → 400', async () => {
  state.reset();
  assert.equal((await openCheckin({})).status, 400);
  assert.equal((await openCheckin({ taskId: '' })).status, 400);
  assert.equal((await openCheckin({ taskId: 42 })).status, 400);
});

test('الفلو الكامل: البوب-أب يفتح خيط ويرد فيه', async () => {
  state.reset();
  state.geminiReply = 'الله! فطرت كويس بقى؟ 👏';

  // 1) الساعة 6 — التطبيق فتح البوب-أب وبعت السؤال
  const opened = await openCheckin({
    taskId: 'task-breakfast',
    question: 'إيه أخبار «الفطار»؟',
  });
  assert.equal(opened.status, 201);

  // 2) المستخدم كتب اللي حصل
  const replied = await post(opened.body.notificationId, {
    text: 'فطرت وخرجت بدري',
  });

  assert.equal(replied.status, 200, 'الرد لازم يعدي على الخيط الجديد');
  assert.equal(replied.body.source, 'AI');
  assert.match(replied.body.reply, /فطرت/);
});
