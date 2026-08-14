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
await prisma.userReport.deleteMany();
await prisma.follow.deleteMany();
await prisma.user.deleteMany();

// مستخدم 1 (طارق - حساب عام)
const reg1 = await request(app).post('/api/auth/google').send({ idToken: 'valid:soc_u1:tariq@clan.com:Tariq' });
const token1 = reg1.body.accessToken;
const user1Id = reg1.body.user.id;
await request(app).post('/api/auth/onboarding').set('Authorization', `Bearer ${token1}`).send({ domain: 'TECH', specialty: 'SOFTWARE_DEV' });

// مستخدم 2 (ياسمين - حساب خاص)
const reg2 = await request(app).post('/api/auth/google').send({ idToken: 'valid:soc_u2:yasmin@clan.com:Yasmin' });
const token2 = reg2.body.accessToken;
const user2Id = reg2.body.user.id;
await request(app).post('/api/auth/onboarding').set('Authorization', `Bearer ${token2}`).send({ domain: 'BUSINESS', specialty: 'ENTREPRENEUR' });

// مستخدم 3 (المشرف)
const regAdmin = await request(app).post('/api/auth/google').send({ idToken: 'valid:soc_adm:admin@clan.com:Admin' });
const tokenAdmin = regAdmin.body.accessToken;
const adminId = regAdmin.body.user.id;
await request(app).post('/api/auth/onboarding').set('Authorization', `Bearer ${tokenAdmin}`).send({ domain: 'TECH', specialty: 'CYBERSECURITY' });
await prisma.user.update({ where: { id: adminId }, data: { role: 'ADMIN' } });

console.log('\n━━━ 🔒 ١. إعدادات الخصوصية والحساب الخاص ━━━');
await t('ياسمين تحول حسابها إلى حساب خاص (Private Account)', async () => {
  const res = await request(app)
    .patch('/api/social/privacy')
    .set('Authorization', `Bearer ${token2}`)
    .send({ isPrivateAccount: true, showStreak: false, dmPrivacy: 'FOLLOWERS_ONLY' });

  eq(res.status, 200);
  eq(res.body.privacy.isPrivateAccount, true, 'حساب خاص');
  eq(res.body.privacy.showStreak, false, 'إخفاء الستريك');
  eq(res.body.privacy.dmPrivacy, 'FOLLOWERS_ONLY', 'خصوصية الرسائل للمتابعين فقط');
});

console.log('\n━━━ 🌿 ٢. الحالة اللحظية والروابط الاجتماعية ━━━');
await t('طارق يحدث حالته التعبيرية وروابطه المهنية', async () => {
  const res = await request(app)
    .patch('/api/social/status')
    .set('Authorization', `Bearer ${token1}`)
    .send({
      customStatus: 'أبني النسخة الأسطورية من التطبيق 🚀',
      statusEmoji: '🚀',
      bio: 'مهندس برمجيات ومحب للتركيز العميق',
      socialLinks: { github: 'https://github.com/tariq', linkedin: 'https://linkedin.com/in/tariq' },
    });

  eq(res.status, 200);
  eq(res.body.profile.customStatus, 'أبني النسخة الأسطورية من التطبيق 🚀');
  eq(res.body.profile.socialLinks.github, 'https://github.com/tariq');
});

console.log('\n━━━ 🤝 ٣. شبكة المتابعة وطلبات الصداقة للحسابات الخاصة ━━━');
await t('طارق يرسل طلب متابعة لحساب ياسمين الخاص فتصبح الحالة PENDING', async () => {
  const res = await request(app)
    .post(`/api/social/follow/${user2Id}`)
    .set('Authorization', `Bearer ${token1}`);

  eq(res.status, 200);
  eq(res.body.status, 'PENDING', 'حالة الطلب معلقة');
});

await t('طارق يرى بروفايل ياسمين بصيغة مقيدة (Restricted) والبيانات الحساسة محجوبة', async () => {
  const res = await request(app)
    .get(`/api/social/profile/${user2Id}`)
    .set('Authorization', `Bearer ${token1}`);

  eq(res.status, 200);
  eq(res.body.isRestricted, true, 'الملف مقيد');
  eq(res.body.profile.relationship, 'REQUESTED', 'حالة العلاقة');
  eq(res.body.profile.currentStreak, null, 'الستريك محجوب');
  eq(res.body.profile.totalFocusHours, null, 'ساعات التركيز محجوبة');
});

let requestId = null;
await t('ياسمين تستعرض طلبات المتابعة الواردة', async () => {
  const res = await request(app)
    .get('/api/social/requests')
    .set('Authorization', `Bearer ${token2}`);

  eq(res.status, 200);
  eq(res.body.total, 1, 'طلب وارد واحد');
  requestId = res.body.requests[0].requestId;
  ok(requestId, 'معرف الطلب');
});

await t('ياسمين تقبل طلب متابعة طارق وتتحول الحالة إلى ACCEPTED', async () => {
  const res = await request(app)
    .post(`/api/social/requests/${requestId}/respond`)
    .set('Authorization', `Bearer ${token2}`)
    .send({ action: 'ACCEPT' });

  eq(res.status, 200);
});

await t('طارق يرى الآن بروفايل ياسمين كاملاً بعد قبول المتابعة', async () => {
  const res = await request(app)
    .get(`/api/social/profile/${user2Id}`)
    .set('Authorization', `Bearer ${token1}`);

  eq(res.status, 200);
  eq(res.body.isRestricted, false, 'الملف متاح');
  eq(res.body.profile.relationship, 'FOLLOWING', 'أصبح متابعاً');
});

console.log('\n━━━ 👥 ٤. قوائم المتابعين وإلغاء المتابعة ━━━');
await t('GET /api/social/followers/:userId يعرض قائمة المتابعين', async () => {
  const res = await request(app)
    .get(`/api/social/followers/${user2Id}`)
    .set('Authorization', `Bearer ${token1}`);

  eq(res.status, 200);
  eq(res.body.total, 1, 'متابع واحد');
  eq(res.body.followers[0].id, user1Id, 'طارق في قائمة المتابعين');
});

await t('طارق يلغي متابعة ياسمين بنجاح', async () => {
  const res = await request(app)
    .delete(`/api/social/unfollow/${user2Id}`)
    .set('Authorization', `Bearer ${token1}`);

  eq(res.status, 200);
});

console.log('\n━━━ 🛡️ ٥. نظام البلاغات والمراجعة الإدارية ━━━');
let reportId = null;
await t('ياسمين تبلغ عن مستخدم مسيء لسبب SPAM', async () => {
  const res = await request(app)
    .post('/api/social/report')
    .set('Authorization', `Bearer ${token2}`)
    .send({
      targetUserId: user1Id,
      reason: 'SPAM',
      details: 'إرسال رسائل متكررة مزعجة',
    });

  eq(res.status, 201);
  ok(res.body.reportId, 'معرف البلاغ');
  reportId = res.body.reportId;
});

await t('المشرف يستعرض البلاغات الواردة ويبت فيها', async () => {
  const list = await request(app)
    .get('/api/social/admin/reports')
    .set('Authorization', `Bearer ${tokenAdmin}`);

  eq(list.status, 200);
  eq(list.body.total, 1, 'بلاغ واحد وارد');

  const resolve = await request(app)
    .patch(`/api/social/admin/reports/${reportId}/resolve`)
    .set('Authorization', `Bearer ${tokenAdmin}`)
    .send({ action: 'RESOLVED', actionNote: 'تم توجيه إنذار رسمي للمستخدم' });

  eq(resolve.status, 200);
});

console.log(`\n${'═'.repeat(48)}`);
console.log(`  نجح ${pass} · فشل ${fail}`);
console.log('═'.repeat(48));

process.exit(fail > 0 ? 1 : 0);
