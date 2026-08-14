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
await prisma.user.deleteMany();
await prisma.clan.deleteMany();
await prisma.clanMember.deleteMany();

// مستخدم عادي
const regUser = await request(app).post('/api/auth/google').send({ idToken: 'valid:u1:normal@user.com:NormalUser' });
const userTok = regUser.body.accessToken;
const normalUserId = regUser.body.user.id;
await request(app).post('/api/auth/onboarding').set('Authorization', `Bearer ${userTok}`).send({ domain: 'TECH' });

// مستخدم أدمن (يرقى في القاعدة مباشرة)
const regAdmin = await request(app).post('/api/auth/google').send({ idToken: 'valid:adm1:admin@clan.com:SuperAdmin' });
const adminUserId = regAdmin.body.user.id;
await request(app).post('/api/auth/onboarding').set('Authorization', `Bearer ${regAdmin.body.accessToken}`).send({ domain: 'TECH' });
await prisma.user.update({ where: { id: adminUserId }, data: { role: 'ADMIN' } });

// تسجيل دخول جديد للأدمن للحصول على توكن محدث بالرتبة
const adminLogin = await request(app).post('/api/auth/google').send({ idToken: 'valid:adm1:admin@clan.com:SuperAdmin' });
const adminTok = adminLogin.body.accessToken;

const asAdmin = (r) => r.set('Authorization', `Bearer ${adminTok}`);
const asUser = (r) => r.set('Authorization', `Bearer ${userTok}`);

console.log('\n━━━ 🛡️ حماية لوحة التحكم (RBAC) ━━━');

await t('المستخدم العادي يُرفض 403 مع ADMIN_ONLY', async () => {
  const r = await asUser(request(app).get('/api/admin/stats'));
  eq(r.status, 403, 'status');
  eq(r.body.code, 'ADMIN_ONLY', 'code');
});

await t('الطلب بدون توكن يُرفض 401', async () => {
  const r = await request(app).get('/api/admin/stats');
  eq(r.status, 401, 'status');
});

await t('المشرف يمر بنجاح 200', async () => {
  const r = await asAdmin(request(app).get('/api/admin/stats'));
  eq(r.status, 200, 'status');
  ok(r.body.stats, 'بيانات الإحصائيات');
  ok(r.body.stats.users.total >= 2, 'إجمالي المستخدمين');
});

console.log('\n━━━ 👥 إدارة المستخدمين ━━━');

await t('GET /api/admin/users يعرض القائمة كاملة مع الترقيم', async () => {
  const r = await asAdmin(request(app).get('/api/admin/users?page=1&limit=10'));
  eq(r.status, 200, 'status');
  ok(r.body.users.length >= 2, 'قائمة المستخدمين');
  eq(r.body.page, 1, 'رقم الصفحة');
});

await t('حظر مستخدم يغير حالته ويلغي جلساته فوراً', async () => {
  const r = await asAdmin(request(app).patch(`/api/admin/users/${normalUserId}/ban`)).send({ isBanned: true, reason: 'مخالفة الشروط' });
  eq(r.status, 200, 'status');
  eq(r.body.user.isBanned, true, 'isBanned');

  // التحقق من طرده فوراً
  const check = await asUser(request(app).get('/api/auth/me'));
  eq(check.status, 403, 'المحظور طرد');
  eq(check.body.code, 'USER_BANNED', 'كود الحظر');
});

await t('رفع الحظر يسمح للمستخدم بالعودة', async () => {
  const r = await asAdmin(request(app).patch(`/api/admin/users/${normalUserId}/ban`)).send({ isBanned: false });
  eq(r.status, 200, 'status');
  eq(r.body.user.isBanned, false, 'isBanned');

  const check = await asUser(request(app).get('/api/auth/me'));
  eq(check.status, 200, 'عاد للعمل');
});

await t('المشرف لا يستطيع حظر حسابه الإداري', async () => {
  const r = await asAdmin(request(app).patch(`/api/admin/users/${adminUserId}/ban`)).send({ isBanned: true });
  eq(r.status, 403, 'رفض حظر النفس');
});

await t('تعديل الشرارات إدارياً يسجل الحركة ويزيد الرصيد', async () => {
  const before = (await prisma.user.findUnique({ where: { id: normalUserId } })).sparksBalance;
  const r = await asAdmin(request(app).post(`/api/admin/users/${normalUserId}/sparks-adjust`)).send({ amount: 150, note: 'مكافأة مسابقة' });
  eq(r.status, 200, 'status');
  eq(r.body.adjustment, 150, 'قيمة التعديل');
  eq(r.body.newBalance, before + 150, 'الرصيد الجديد');
});

await t('تعديل الرتبة إلى ADMIN ينجح', async () => {
  const r = await asAdmin(request(app).patch(`/api/admin/users/${normalUserId}/role`)).send({ role: 'ADMIN' });
  eq(r.status, 200, 'status');
  eq(r.body.user.role, 'ADMIN', 'الرتبة الجديدة');
});

console.log('\n━━━ ⚔️ إدارة العشائر إدارياً ━━━');

let clanId;
await t('إنشاء عشيرة ثم حذفها إدارياً بكنس العضويات', async () => {
  const c = await prisma.clan.create({
    data: { name: 'عشيرة مسيئة', type: 'PRIVATE', leaderId: normalUserId },
  });
  clanId = c.id;
  await prisma.clanMember.create({ data: { clanId, userId: normalUserId, role: 'LEADER' } });

  const r = await asAdmin(request(app).delete(`/api/admin/clans/${clanId}`));
  eq(r.status, 200, 'status');

  const check = await prisma.clan.findUnique({ where: { id: clanId } });
  eq(check, null, 'حُذفت من القاعدة');
  const members = await prisma.clanMember.count({ where: { clanId } });
  eq(members, 0, 'حُذفت العضويات');
});

await t('العشائر العامة محمية من الحذف الإداري العشوائي', async () => {
  const globalClan = await prisma.clan.create({
    data: { name: 'عشيرة البرمجة العامة', type: 'GLOBAL', category: 'TECH' },
  });
  const r = await asAdmin(request(app).delete(`/api/admin/clans/${globalClan.id}`));
  eq(r.status, 403, 'status');
});

console.log('\n━━━ 🧠 مراقبة الذكاء الاصطناعي ━━━');

await t('GET /api/admin/ai/usage يرجع ملخص الاستهلاك والتوكنات', async () => {
  const r = await asAdmin(request(app).get('/api/admin/ai/usage'));
  eq(r.status, 200, 'status');
  ok(r.body.summary, 'ملخص التوكنات');
});

console.log(`\n${'═'.repeat(50)}\nالنتيجة: ✅ ${pass} نجح   ❌ ${fail} فشل\n${'═'.repeat(50)}`);
process.exit(fail ? 1 : 0);
