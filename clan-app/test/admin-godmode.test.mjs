import 'dotenv/config';
process.env.DATABASE_URL ||= 'postgresql://x:x@localhost:5432/x';
process.env.JWT_ACCESS_SECRET = 't_acc_1234567890_abcdefghijklmn';
process.env.JWT_REFRESH_SECRET = 't_ref_0987654321_zyxwvutsrqponm';
process.env.GOOGLE_CLIENT_ID = 'fake.apps.googleusercontent.com';
process.env.NODE_ENV = 'test';
process.env.MONGO_URI ||= 'mongodb://127.0.0.1:27017/x';
process.env.REDIS_URL ||= 'redis://127.0.0.1:6379';

const { register } = await import('node:module');
register('./loader.mjs', import.meta.url);

const request = (await import('supertest')).default;
const prisma = (await import('../src/config/prisma.js')).default;
const app = (await import('../src/app.js')).default;

let pass = 0, fail = 0;
const t = async (n, f) => {
  try {
    await f();
    console.log(`✅ ${n}`);
    pass += 1;
  } catch (e) {
    console.log(`❌ ${n}\n     ${e.message}`);
    fail += 1;
  }
};
const eq = (a, b, m = '') => {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(`${m}: توقعت ${JSON.stringify(b)} فحصلت ${JSON.stringify(a)}`);
  }
};
const ok = (c, m) => { if (!c) throw new Error(m); };

// تنظيف
await prisma.userTitle.deleteMany();
await prisma.focusSession.deleteMany();
await prisma.clanMember.deleteMany();
await prisma.clan.deleteMany();
await prisma.user.deleteMany();

// إنشاء أدمن
const regAdmin = await request(app).post('/api/auth/google').send({ idToken: 'valid:adm_master:super@clan.com:SuperAdmin' });
const tokenAdmin = regAdmin.body.accessToken;
const adminId = regAdmin.body.user.id;
await request(app).post('/api/auth/onboarding').set('Authorization', `Bearer ${tokenAdmin}`).send({ domain: 'TECH', specialty: 'CYBERSECURITY' });
await prisma.user.update({ where: { id: adminId }, data: { role: 'ADMIN' } });

// إنشاء مستخدم عادي
const regUser = await request(app).post('/api/auth/google').send({ idToken: 'valid:usr_m:member@clan.com:MemberUser' });
const tokenUser = regUser.body.accessToken;
const userId = regUser.body.user.id;
await request(app).post('/api/auth/onboarding').set('Authorization', `Bearer ${tokenUser}`).send({ domain: 'BUSINESS', specialty: 'ENTREPRENEUR' });

console.log('\n━━━ 🛡️ ١. حماية لوحة التحكم وصحة النظام ━━━');
await t('المستخدم العادي يُمنع من مسارات الإدارة 403', async () => {
  const res = await request(app)
    .get('/api/admin/stats')
    .set('Authorization', `Bearer ${tokenUser}`);
  eq(res.status, 403);
});

await t('GET /api/admin/system/health-deep يرجع فحصاً شاملاً للخادم والذاكرة', async () => {
  const res = await request(app)
    .get('/api/admin/system/health-deep')
    .set('Authorization', `Bearer ${tokenAdmin}`);
  eq(res.status, 200);
  ok(res.body.system.memory.rss, 'استهلاك الذاكرة');
  ok(res.body.system.postgres.status === 'HEALTHY', 'حالة قاعدة البيانات');
});

console.log('\n━━━ 👤 ٢. التفتيش العميق والتعديل على المستخدمين ━━━');
await t('GET /api/admin/users/:userId/inspect يرجع تفريغاً شاملاً للمستخدم', async () => {
  const res = await request(app)
    .get(`/api/admin/users/${userId}/inspect`)
    .set('Authorization', `Bearer ${tokenAdmin}`);

  eq(res.status, 200);
  eq(res.body.user.id, userId, 'معرف المستخدم');
  ok(res.body.user.statsCounts, 'إحصائيات الأنشطة التراكمية');
});

await t('POST /api/admin/users/:userId/streak-adjust يعدل الستريك ويمنح دروعاً', async () => {
  const res = await request(app)
    .post(`/api/admin/users/${userId}/streak-adjust`)
    .set('Authorization', `Bearer ${tokenAdmin}`)
    .send({ currentStreak: 45, shieldsRemaining: 4 });

  eq(res.status, 200);
  eq(res.body.user.currentStreak, 45, 'الستريك الجديد');
  eq(res.body.user.shieldsRemaining, 4, 'رصيد الدروع');
});

await t('POST /api/admin/users/:userId/subscription يمنح باقة PRO للمستخدم', async () => {
  const res = await request(app)
    .post(`/api/admin/users/${userId}/subscription`)
    .set('Authorization', `Bearer ${tokenAdmin}`)
    .send({ plan: 'PRO', durationDays: 60 });

  eq(res.status, 200);
  eq(res.body.subscription.plan, 'PRO', 'نوع الباقة');
  eq(res.body.subscription.status, 'ACTIVE', 'حالة الاشتراك');
});

await t('POST /api/admin/users/:userId/ai-bonus يشحن 50 رسالة AI إضافية', async () => {
  const res = await request(app)
    .post(`/api/admin/users/${userId}/ai-bonus`)
    .set('Authorization', `Bearer ${tokenAdmin}`)
    .send({ count: 50 });

  eq(res.status, 200);
  eq(res.body.user.bonusAiMessages, 50, 'رسائل الذكاء الاصطناعي');
});

console.log('\n━━━ ⚔️ ٣. السيطرة على العشائر والقيادة ━━━');
let testClanId = null;
await t('POST /api/admin/clans ينشئ عشيرة جديدة إدارياً', async () => {
  const res = await request(app)
    .post('/api/admin/clans')
    .set('Authorization', `Bearer ${tokenAdmin}`)
    .send({
      name: 'عشيرة النخبة الإدارية',
      description: 'عشيرة رسمية للرواد',
      domain: 'BUSINESS',
      type: 'PRIVATE',
      leaderId: userId,
    });

  eq(res.status, 201);
  testClanId = res.body.clan.id;
  ok(testClanId, 'معرف العشيرة');
});

await t('POST /api/admin/clans/:clanId/transfer-leader ينقل قيادة العشيرة', async () => {
  const res = await request(app)
    .post(`/api/admin/clans/${testClanId}/transfer-leader`)
    .set('Authorization', `Bearer ${tokenAdmin}`)
    .send({ newLeaderId: adminId });

  eq(res.status, 200);
});

console.log('\n━━━ 🧠 ٤. الرقابة الحية على جلسات التركيز ومكافحة الغش ━━━');
let testSessionId = null;
await t('إنهاء جلسة تركيز قسرياً ومكافحة الغش', async () => {
  const session = await prisma.focusSession.create({
    data: {
      userId,
      status: 'ACTIVE',
      plannedMin: 60,
      type: 'SOLO',
      startedAt: new Date(),
    },
  });
  testSessionId = session.id;

  const activeList = await request(app)
    .get('/api/admin/focus/active')
    .set('Authorization', `Bearer ${tokenAdmin}`);

  eq(activeList.status, 200);
  ok(activeList.body.sessions.some((s) => s.id === testSessionId), 'الجلسة تظهر في الرقابة الحية');

  const term = await request(app)
    .post(`/api/admin/focus/${testSessionId}/terminate`)
    .set('Authorization', `Bearer ${tokenAdmin}`)
    .send({ reason: 'تكرار فتح تطبيقات محظورة أثناء التركيز' });

  eq(term.status, 200);
});

console.log('\n━━━ 👑 ٥. منح وسحب الألقاب الأسطورية ━━━');
await t('POST /api/admin/titles/grant يمنح لقب وحش اليوم الكامل للمستخدم', async () => {
  const res = await request(app)
    .post('/api/admin/titles/grant')
    .set('Authorization', `Bearer ${tokenAdmin}`)
    .send({ userId, titleCode: 'SOLAR_TITAN' });

  eq(res.status, 200);
});

await t('POST /api/admin/titles/revoke يسحب اللقب الأسطوري', async () => {
  const res = await request(app)
    .post('/api/admin/titles/revoke')
    .set('Authorization', `Bearer ${tokenAdmin}`)
    .send({ userId, titleCode: 'SOLAR_TITAN' });

  eq(res.status, 200);
});

console.log('\n━━━ 📢 ٦. البث الشامل والسجل المالي ━━━');
await t('POST /api/admin/broadcast يرسل بثاً شاملاً لجميع المتصلين', async () => {
  const res = await request(app)
    .post('/api/admin/broadcast')
    .set('Authorization', `Bearer ${tokenAdmin}`)
    .send({
      title: 'انطلاق ماراثون نهاية الأسبوع 🔥',
      message: 'الجوائز مضاعفة لجميع الكتائب المشاركة',
      priority: 'HIGH',
    });

  eq(res.status, 200);
  ok(res.body.broadcast.timestamp, 'طابع البث الزمني');
});

await t('GET /api/admin/sparks/ledger يستعرض السجل المالي للحركات', async () => {
  const res = await request(app)
    .get('/api/admin/sparks/ledger')
    .set('Authorization', `Bearer ${tokenAdmin}`);

  eq(res.status, 200);
  ok(Array.isArray(res.body.transactions), 'قائمة المعاملات');
});

console.log(`\n${'═'.repeat(48)}`);
console.log(`  نجح ${pass} · فشل ${fail}`);
console.log('═'.repeat(48));

process.exit(fail > 0 ? 1 : 0);
