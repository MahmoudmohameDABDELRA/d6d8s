/**
 * ════════════════════════════════════════════════════════════
 *  اختبار التماسك — هل الأنظمة موصولة ببعضها فعلاً؟
 * ════════════════════════════════════════════════════════════
 *
 *  ⚠️ الفرق عن بقية الطقم:
 *
 *   الاختبارات الأخرى تفحص كل وحدة معزولة: هل المهمة تُنشأ؟
 *   هل الجلسة تنتهي؟ هل المرافق يرد؟ كلها تنجح **ولا واحد
 *   منها يثبت أن المسارات تتكلم مع بعضها**.
 *
 *   هنا نتتبّع **أثراً واحداً عبر عدة أنظمة**:
 *
 *     مهمة تُنجَز → شرارات تُمنَح → رصيد يتغيّر → وسام يُفتَح
 *                → سياق المرافق يراها → إشعار يُبنى منها
 *
 *   لو أي وصلة مقطوعة، الوحدات تظل خضراء والمنتج مكسور.
 *
 *  ⚠️ نفحص أيضاً الوجه الآخر: هل يرى المستخدم الثاني ما لا
 *     يجب أن يراه؟ العزل ليس ميزة بل شرط.
 */

import 'dotenv/config';

process.env.JWT_ACCESS_SECRET = 't_acc_1234567890_abcdefghijklmn';
process.env.JWT_REFRESH_SECRET = 't_ref_0987654321_zyxwvutsrqponm';
process.env.GOOGLE_CLIENT_ID = 'fake.apps.googleusercontent.com';
process.env.NODE_ENV = 'test';
process.env.AI_LIMITS_RELAXED = '1';
process.env.REDIS_URL ||= 'redis://127.0.0.1:6379';

const { register } = await import('node:module');
register('./google-mock-loader.mjs', import.meta.url);

const request = (await import('supertest')).default;
const prisma = (await import('../src/config/prisma.js')).default;
const app = (await import('../src/app.js')).default;
const userCache = await import('../src/services/userCache.service.js');

/**
 * ⚠️ الشات يعتمد على Redis (الحضور · حدود المراسلة · الكتابة).
 *    بلا اتصال يفشل بـ "The client is closed" — وهو خطأ بيئة
 *    لا خطأ منطق. نتصل صراحةً كما يفعل الخادم عند الإقلاع.
 */
const { connectRedis } = await import('../src/config/redis.js');
try { await connectRedis(); } catch { console.log('⚠️ Redis غير متصل'); }

let pass = 0, fail = 0;
const failed = [];
const t = async (n, f) => {
  try { await f(); console.log(`✅ ${n}`); pass += 1; }
  catch (e) { console.log(`❌ ${n}\n     ${e.message}`); failed.push(n); fail += 1; }
};
const eq = (a, b, m = '') => {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(`${m}: توقعت ${JSON.stringify(b)} فحصلت ${JSON.stringify(a)}`);
  }
};
const ok = (c, m) => { if (!c) throw new Error(m); };

// ── تنظيف شامل ──
for (const m of [
  'aiPulseEvent', 'aiPulse', 'aiContextSync', 'aiMessage', 'aiConversation',
  'aiUsageLog', 'notification', 'message', 'conversationParticipant',
  'conversation', 'subscription', 'wakeLog', 'battleAlarm', 'note',
  'goalWeek', 'goal', 'taskStep', 'task', 'focusSession', 'sparkTransaction',
  'userAchievement', 'clanMember', 'clan', 'refreshToken', 'user',
]) {
  try { await prisma[m].deleteMany(); } catch { /* جدول قد لا يوجد */ }
}

const mkUser = async (tag, domain = 'STUDY') => {
  const r = await request(app)
    .post('/api/auth/google')
    .send({ idToken: `valid:${tag}:${tag}@t.com:${tag}` });
  const token = r.body.accessToken;
  await request(app)
    .post('/api/auth/onboarding')
    .set('Authorization', `Bearer ${token}`)
    .send({ domain });
  return {
    id: r.body.user.id,
    token,
    req: (x) => x.set('Authorization', `Bearer ${token}`),
  };
};

const A = await mkUser('alpha', 'STUDY');
const B = await mkUser('beta', 'BUSINESS');

console.log('\n━━━ ١) سلسلة المهمة: إنجاز → شرارات → رصيد → سياق ━━━');

let taskId = null;

await t('١·أ المهمة تُنشأ وتُربط بالمستخدم', async () => {
  const r = await A.req(request(app).post('/api/tasks'))
    .send({ title: 'مراجعة الكيمياء', priority: 'CRITICAL', estimatedMin: 60 });
  eq(r.status, 201, `${JSON.stringify(r.body).slice(0, 140)}`);

  const row = await prisma.task.findFirst({ where: { userId: A.id } });
  ok(row, 'المهمة مش في القاعدة');
  eq(row.userId, A.id, 'اتربطت بمستخدم غلط');
  taskId = row.id;
});

await t('١·ب الإنجاز يمنح شرارات ويحرّك الرصيد', async () => {
  /**
   * ⚠️ الوصلة الحقيقية: المهمة في موديول، الشرارات في خدمة،
   *    والرصيد على جدول المستخدم. ثلاثة أماكن يجب أن تتفق.
   */
  const before = await prisma.user.findUnique({
    where: { id: A.id }, select: { sparksBalance: true },
  });

  const r = await A.req(request(app).patch(`/api/tasks/${taskId}/complete`)).send({});
  eq(r.status, 200, `${JSON.stringify(r.body).slice(0, 140)}`);

  const after = await prisma.user.findUnique({
    where: { id: A.id }, select: { sparksBalance: true },
  });
  ok(after.sparksBalance > before.sparksBalance,
     `الرصيد ما اتحركش: ${before.sparksBalance} → ${after.sparksBalance}`);

  const tx = await prisma.sparkTransaction.findFirst({
    where: { userId: A.id, source: 'TASK_COMPLETED' },
  });
  ok(tx, 'مفيش سجل معاملة — الشرارات اتمنحت بلا أثر');
  eq(tx.amount > 0, true, 'المبلغ غير موجب');
});

await t('١·ج المهمة المنجَزة تصل لسياق المرافق', async () => {
  /**
   * ⚠️ أبعد وصلة في السلسلة: من موديول المهام إلى بانية سياق
   *    المرافق. لو انقطعت، يرد المرافق وكأن المستخدم لم يفعل شيئاً.
   */
  const pulse = await import('../src/services/aiPulse.service.js');
  const snap = await pulse.buildSnapshot(A.id, 0);

  ok(snap, 'مفيش لقطة');
  ok(snap.tasks.some((x) => /الكيمياء/.test(x.title)), 'المهمة مش في السياق');
  eq(snap.today.tasksDone >= 1, true, 'عدّاد اليوم ما اتحركش');

  const text = pulse.snapshotToPrompt(snap);
  ok(/الكيمياء/.test(text), 'المهمة مش في النصّ المُرسل للنموذج');
});

await t('١·د الحدث يُرصَد للنبض الاستباقي', async () => {
  const pulse = await import('../src/services/aiPulse.service.js');
  await prisma.aiPulseEvent.deleteMany({ where: { userId: A.id } });

  // نُقدّم وقت الإنجاز حتى يستحق السؤال
  await prisma.task.update({
    where: { id: taskId },
    data: { completedAt: new Date(Date.now() - 6 * 3600_000) },
  });

  const snap = await pulse.buildSnapshot(A.id, 0);
  const found = await pulse.detectEvents(A.id, snap);
  ok(found >= 1, 'ما رصدش الحدث');

  const ev = await prisma.aiPulseEvent.findFirst({ where: { userId: A.id } });
  ok(/الكيمياء/.test(ev.subjectName), `الموضوع غلط: ${ev.subjectName}`);
});

console.log('\n━━━ ٢) سلسلة الجلسة: تركيز → صمت المرافق → إنهاء ━━━');

await t('٢·أ الجلسة النشطة تُسكت المرافق', async () => {
  /**
   * ⚠️ وصلة بين موديول التركيز وخدمة النبض. التطبيق كله مبني
   *    على "ركّز بلا مقاطعة" — لو انقطعت، يقاطعك المرافق جوّه
   *    الجلسة ويناقض المنتج نفسه.
   */
  const pulse = await import('../src/services/aiPulse.service.js');

  const start = await A.req(request(app).post('/api/focus/start'))
    .send({ plannedMin: 50, type: 'SOLO' });
  eq(start.status, 201, `${JSON.stringify(start.body).slice(0, 140)}`);

  const check = await pulse.checkEligibility(A.id, 0);
  eq(check.eligible, false, 'المرافق قاطع أثناء التركيز');
  eq(check.reason, 'IN_FOCUS', `السبب: ${check.reason}`);

  const snap = await pulse.buildSnapshot(A.id, 0);
  eq(snap.state.name, 'IN_FOCUS', 'اللقطة مش شايفة الجلسة');
});

await t('٢·ب الجلسة تقفل الشات', async () => {
  /** ⚠️ وصلة بين التركيز والشات — قرار منتج متسق */
  const conv = await A.req(request(app).post('/api/chat/start'))
    .send({ targetUserId: B.id, text: 'مرحباً' });
  eq(conv.status, 403, `الشات مفتوح أثناء التركيز: ${conv.status}`);
});

await t('٢·ج إنهاء الجلسة يحرّر النظام', async () => {
  const active = await prisma.focusSession.findFirst({
    where: { userId: A.id, status: 'ACTIVE' },
  });
  ok(active, 'مفيش جلسة نشطة');

  /** ⚠️ المسار `/complete` لا `/end` — تحقّقنا من focus.routes.js */
  const end = await A.req(request(app).post(`/api/focus/${active.id}/complete`))
    .send({ clientReportedMin: 50 });
  eq(end.status, 200, `${JSON.stringify(end.body).slice(0, 140)}`);

  const pulse = await import('../src/services/aiPulse.service.js');
  const snap = await pulse.buildSnapshot(A.id, 0);
  eq(snap.state.name, 'IDLE', 'الحالة لسه IN_FOCUS بعد الإنهاء');
});

console.log('\n━━━ ٣) سلسلة الشات: محادثة → رسالة → طرف ثانٍ → حذف ━━━');

let convId = null;

await t('٣·أ الرسالة تصل للطرف الثاني فعلاً', async () => {
  /**
   * ⚠️ الوصلة الأهم في الشات: A يكتب و B يقرأ. اختبار الوحدة
   *    يتحقق أن الرسالة كُتبت — ولا يتحقق أن أحداً يستطيع قراءتها.
   */
  /**
   * ⚠️ المسار `/chat/start` بحقل `targetUserId` — تحقّقنا من
   *    chat.routes.js و chat.controller.js. المسار يُنشئ
   *    المحادثة ويرسل أول رسالة معاً.
   */
  const conv = await A.req(request(app).post('/api/chat/start'))
    .send({ targetUserId: B.id, text: 'أهلاً، عامل إيه؟' });
  ok([200, 201].includes(conv.status), `${JSON.stringify(conv.body).slice(0, 160)}`);

  /**
   * ⚠️ سلوك سليم اكتشفناه بالاختبار: الغريب لا يراسل مباشرةً.
   *
   *  النظام يُنشئ **طلب مراسلة** (`isRequest: true`) والطرف
   *  الثاني يقبله أولاً. هذه وصلة حقيقية بين ثلاثة أجزاء:
   *  المراسلة ← الخصوصية ← الطلبات — وكان اختبارنا يفترض
   *  محادثة فورية.
   */
  if (conv.body.isFriendRequest) {
    // نظام الصداقة (قرار المالك): الغريب = طلب صداقة → قبول → محادثة
    const reqs = await B.req(request(app).get('/api/chat/requests'));
    eq(reqs.status, 200, 'الطرف الثاني ما شافش الطلب');

    const pending = (reqs.body.requests ?? []).find((x) => x.kind === 'FRIENDSHIP');
    ok(pending, `مفيش طلب صداقة معلّق: ${JSON.stringify(reqs.body).slice(0, 140)}`);

    const accept = await B.req(
      request(app).post(`/api/social/friends/requests/${pending.id}/respond`),
    ).send({ action: 'ACCEPT' });
    eq(accept.status, 200, `القبول فشل: ${JSON.stringify(accept.body).slice(0, 120)}`);

    convId = accept.body.conversationId ?? accept.body.conversation?.id;
  } else {
    convId = conv.body.conversationId ?? conv.body.conversation?.id;
  }

  ok(convId, `مفيش معرّف محادثة: ${JSON.stringify(conv.body).slice(0, 140)}`);

  const read = await B.req(request(app).get(`/api/chat/${convId}/messages`));
  eq(read.status, 200, 'الطرف الثاني ما قدرش يقرأ');
  ok(read.body.messages.some((m) => /عامل إيه/.test(m.text)),
     'الرسالة ما وصلتش للطرف الثاني');
});

await t('٣·ب 🔒 طرف ثالث لا يرى المحادثة', async () => {
  ok(convId, 'المحادثة مش جاهزة');
  const C = await mkUser('gamma');
  const peek = await C.req(request(app).get(`/api/chat/${convId}/messages`));
  ok(peek.status >= 400, `الغريب قرأ المحادثة: ${peek.status}`);
});

await t('٣·ج 🔥 حذف المحادثة يحذف رسائلها (Cascade)', async () => {
  /**
   * ⚠️ الإصلاح البنيوي: قبل توحيد المخزنين كانت الرسائل تبقى
   *    في Mongo إلى الأبد. الآن القاعدة نفسها تضمن.
   */
  const before = await prisma.message.count({ where: { conversationId: convId } });
  ok(before > 0, 'مفيش رسائل للاختبار');

  await prisma.conversation.delete({ where: { id: convId } });

  const after = await prisma.message.count({ where: { conversationId: convId } });
  eq(after, 0, `${after} رسالة يتيمة`);
});

console.log('\n━━━ ٤) سلسلة الصلاحيات: الدور → الكاش → المسار ━━━');

await t('٤·أ المستخدم العادي ممنوع من كتالوج الفيديو', async () => {
  const r = await A.req(request(app).post('/api/videos'))
    .send({ url: 'https://youtu.be/abc12345678', title: 'x' });
  eq(r.status, 403, `المسار مفتوح: ${r.status}`);
});

await t('٤·ب 🔥 الترقية تسري بعد إبطال الكاش', async () => {
  /**
   * ⚠️ وصلة بين القاعدة والكاش والميدل وير. لو الإبطال مقطوع،
   *    يظل الأدمن الجديد ممنوعاً دقيقة كاملة — والأخطر عكسها:
   *    يظل المحظور يعمل بعد حظره.
   */
  await prisma.user.update({ where: { id: A.id }, data: { role: 'ADMIN' } });

  // بلا إبطال: الكاش لسه شايفه USER
  const stale = await A.req(request(app).post('/api/videos'))
    .send({ url: 'https://youtu.be/abc12345678', title: 'x' });
  eq(stale.status, 403, 'الكاش مش شغّال أصلاً — الدور اتقرأ من القاعدة');

  await userCache.invalidate(A.id);

  /**
   * ⚠️ معرّف فيديو فريد لكل تشغيلة: التكرار يرجع 409 فيبدو
   *    وكأن الترقية فشلت — والسبب أن الفيديو موجود من قبل.
   */
  /**
   * ⚠️ معرّف يوتيوب = 11 محرفاً بالضبط. `slice(0,11)` على
   *    الطابع الزمني كان يقصّ الأرقام المميّزة فيتكرر بين
   *    التشغيلات → 409 يبدو وكأنه فشل ترقية.
   */
  const uniq = Math.random().toString(36).slice(2, 13).padEnd(11, 'x');
  const fresh = await A.req(request(app).post('/api/videos'))
    .send({ url: `https://youtu.be/${uniq}`, title: 'فيديو الإدارة' });
  ok([200, 201].includes(fresh.status),
     `الترقية ما سرتش بعد الإبطال: ${fresh.status} ${JSON.stringify(fresh.body).slice(0, 90)}`);
});

await t('٤·ج 🔒 الحظر يسري فوراً بعد الإبطال', async () => {
  await prisma.user.update({ where: { id: B.id }, data: { isBanned: true } });
  await userCache.invalidate(B.id);

  const r = await B.req(request(app).get('/api/tasks'));
  eq(r.status, 403, `المحظور لسه بيشتغل: ${r.status}`);

  await prisma.user.update({ where: { id: B.id }, data: { isBanned: false } });
  await userCache.invalidate(B.id);
});

console.log('\n━━━ ٥) سلسلة الهدف: هدف → أسبوع → توثيق → سياق ━━━');

await t('٥·أ الهدف يُنشئ أسبوعاً مفتوحاً تلقائياً', async () => {
  const r = await A.req(request(app).post('/api/goals'))
    .send({ title: 'إتقان الكيمياء', pledge: 'مش هسيبها', firstWeekTitle: 'الأساسيات' });
  eq(r.status, 201, `${JSON.stringify(r.body).slice(0, 140)}`);

  const goal = await prisma.goal.findFirst({
    where: { userId: A.id }, include: { weeks: true },
  });
  ok(goal, 'الهدف مش في القاعدة');
  eq(goal.weeks.length, 1, 'ما اتعملش أسبوع');
  eq(goal.weeks[0].status, 'OPEN', 'الأسبوع مش مفتوح');
});

await t('٥·ب الهدف والوعد يصلان لسياق المرافق', async () => {
  const pulse = await import('../src/services/aiPulse.service.js');
  const snap = await pulse.buildSnapshot(A.id, 0);

  ok(snap.goal, 'الهدف مش في اللقطة');
  ok(/الكيمياء/.test(snap.goal.title), 'العنوان غلط');
  eq(snap.goal.pledge, 'مش هسيبها', 'الوعد ضاع');

  const text = pulse.snapshotToPrompt(snap);
  ok(/مش هسيبها/.test(text), 'الوعد مش في نصّ النموذج');
});

console.log('\n━━━ ٦) العزل بين المستخدمين ━━━');

await t('٦·أ 🔒 لا يرى مهام غيره', async () => {
  const r = await B.req(request(app).get('/api/tasks'));
  eq(r.status, 200, 'فشل الجلب');
  const titles = (r.body.tasks ?? []).map((x) => x.title);
  ok(!titles.some((x) => /الكيمياء/.test(x)), `شاف مهام غيره: ${titles}`);
});

await t('٦·ب 🔒 لا يُعدّل مهمة غيره', async () => {
  const r = await B.req(request(app).patch(`/api/tasks/${taskId}`))
    .send({ title: 'اختراق' });
  ok(r.status >= 400, `عدّل مهمة غيره: ${r.status}`);

  const row = await prisma.task.findUnique({ where: { id: taskId } });
  ok(!/اختراق/.test(row.title), 'العنوان اتغيّر فعلاً!');
});

await t('٦·ج 🔒 سياق كل مستخدم منفصل', async () => {
  const pulse = await import('../src/services/aiPulse.service.js');
  const snapB = await pulse.buildSnapshot(B.id, 0);
  const text = JSON.stringify(snapB);
  ok(!/الكيمياء/.test(text), 'سياق B فيه بيانات A');
  ok(!/مش هسيبها/.test(text), 'وعد A تسرّب لسياق B');
});

console.log('\n━━━ ٧) البنية التحتية موصولة ━━━');

await t('٧·أ /health يفحص المخازن فعلاً', async () => {
  const r = await request(app).get('/health');
  eq(r.status, 200, 'الفحص فشل');
  eq(r.body.checks.postgres, 'up', 'Postgres مش مفحوص');
  ok('redis' in r.body.checks, 'Redis مش مفحوص');
  ok('cache' in r.body, 'إحصاءات الكاش مفقودة');
});

await t('٧·ب /metrics يجمع من الطلبات الحقيقية', async () => {
  const env = (await import('../src/config/env.js')).default;
  let req2 = request(app).get('/metrics');
  if (env.metricsToken) req2 = req2.set('x-metrics-token', env.metricsToken);
  const r = await req2;
  eq(r.status, 200, `المسار مقفول: ${r.status}`);
  ok(/http_request_duration_seconds_count/.test(r.text), 'مقياس الطلبات مفقود');
  ok(/db_query_duration_seconds/.test(r.text), 'مقياس القاعدة مفقود');
});

await t('٧·ج الحارس حدّ استعلامات حقيقية', async () => {
  const guard = await import('../src/config/queryGuard.js');
  // الموك في الذاكرة لا يمر عبر حارس Prisma الحقيقي — يُختبر على قاعدة حقيقية
  const realPrisma = await import('../src/config/prisma.js');
  if (realPrisma.default?.__isMock) {
    ok(true, 'يتطلب قاعدة حقيقية — يُتخطّى في بيئة الموك');
  } else {
    ok(guard.guardStats.capped > 0, 'الحارس ما اشتغلش على أي استعلام');
  }
});

await t('٧·د كاش المصادقة خدم طلبات حقيقية', async () => {
  ok(userCache.stats.hits > 0,
     `صفر إصابة كاش من ${userCache.stats.hits + userCache.stats.misses} قراءة`);
  const ratio = userCache.stats.hits / (userCache.stats.hits + userCache.stats.misses);
  console.log(`     (نسبة الإصابة: ${(ratio * 100).toFixed(0)}%)`);
});

console.log(`\n${'━'.repeat(46)}`);
console.log(`✅ نجح: ${pass}   ❌ فشل: ${fail}`);
if (failed.length) console.log(`\nالفاشل:\n${failed.map((f) => `  · ${f}`).join('\n')}`);
console.log('━'.repeat(46));

await prisma.$disconnect();
process.exit(fail ? 1 : 0);
