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
await prisma.dailyInsightLog.deleteMany();
await prisma.dailyInsightItem.deleteMany();
await prisma.sparkTransaction.deleteMany();
await prisma.user.deleteMany();

// مستخدم رائد أعمال (بزنس) برصيد 50 شرارة
const regUser = await request(app).post('/api/auth/google').send({ idToken: 'valid:insight_u1:founder@biz.com:FounderMahmoud' });
const userTok = regUser.body.accessToken;
const userId = regUser.body.user.id;
await request(app).post('/api/auth/onboarding').set('Authorization', `Bearer ${userTok}`).send({ domain: 'BUSINESS', specialty: 'ENTREPRENEUR' });
await prisma.user.update({ where: { id: userId }, data: { sparksBalance: 50, totalSparksEarned: 50 } });

// مستخدم أدمن لإدارة الخزانة
const regAdmin = await request(app).post('/api/auth/google').send({ idToken: 'valid:insight_adm:admin@biz.com:AdminBoss' });
const adminTok = regAdmin.body.accessToken;
await request(app).post('/api/auth/onboarding').set('Authorization', `Bearer ${adminTok}`).send({ domain: 'BUSINESS' });
await prisma.user.update({ where: { id: regAdmin.body.user.id }, data: { role: 'ADMIN' } });
const adminLogin = await request(app).post('/api/auth/google').send({ idToken: 'valid:insight_adm:admin@biz.com:AdminBoss' });
const refreshedAdminTok = adminLogin.body.accessToken;

const A = (r) => r.set('Authorization', `Bearer ${userTok}`);
const Admin = (r) => r.set('Authorization', `Bearer ${refreshedAdminTok}`);

console.log('\n━━━ 💡 إضافة معلومات اليوم المخصصة (Admin Vault) ━━━');

let elonInsightId;

await t('المستخدم العادي لا يستطيع إضافة معلومة للخزانة (403 ADMIN_ONLY)', async () => {
  const r = await A(request(app).post('/api/insights/admin/items')).send({
    title: 'تزوير معلومة',
    content: 'كلام عادي',
    domain: 'BUSINESS',
  });
  eq(r.status, 403, 'status');
});

await t('المشرف يضيف معلومة ريادة الأعمال لإيلون ماسك (201)', async () => {
  const r = await Admin(request(app).post('/api/insights/admin/items')).send({
    title: 'كيف تبني شركة ناشئة وتتحمل المخاطر الشديدة',
    content: 'عندما تبدأ شركة، عليك أن تعمل 80 إلى 100 ساعة أسبوعياً لتضاعف فرص نجاحك. إذا كان غيرك يعمل 40 ساعة وأنت 100 ساعة، فستحقق في 4 أشهر ما يحققونه في عام كامل.',
    domain: 'BUSINESS',
    specialty: 'ENTREPRENEUR',
    speaker: 'إيلون ماسك — Elon Musk',
    videoUrl: 'https://youtube.com/shorts/elon_musk_startup_relentless',
    takeaway: 'الكثافة والتركيز الشديد في البدايات يختصران سنوات من المنافسة.',
  });
  eq(r.status, 201, 'status');
  eq(r.body.item.speaker, 'إيلون ماسك — Elon Musk', 'المتحدث');
  elonInsightId = r.body.item.id;
});

console.log('\n━━━ 🌟 الزر العائم لمعلومة اليوم وقفل الـ 24 ساعة الصارم ━━━');

await t('الضغط الأول اليوم يفتح معلومة إيلون ماسك ويمنح 5 شرارات استكشاف', async () => {
  const r = await A(request(app).post('/api/insights/today')).send({ tzOffsetMinutes: -120 });
  eq(r.status, 200, 'status');
  eq(r.body.alreadyViewedToday, false, 'أول مرة تفتح اليوم');
  eq(r.body.sparksAwarded, 5, 'مكافأة 5 شرارات');
  eq(r.body.insight.speaker, 'إيلون ماسك — Elon Musk', 'معلومة مخصصة للبزنس');
  ok(r.body.insight.videoUrl.includes('elon_musk'), 'فيديو إيلون ماسك المحفز');

  // فحص رصيد المستخدم في قاعدة البيانات
  const u = await prisma.user.findUnique({ where: { id: userId } });
  eq(u.sparksBalance, 55, 'الرصيد زاد (50 + 5 = 55)');
});

await t('الضغط الثاني خلال نفس الـ 24 ساعة يعيد نفس المعلومة بـ alreadyViewed=true وصفر شرارات', async () => {
  const r = await A(request(app).post('/api/insights/today')).send({ tzOffsetMinutes: -120 });
  eq(r.status, 200, 'status');
  eq(r.body.alreadyViewedToday, true, 'تم فتحها مسبقاً اليوم');
  eq(r.body.sparksAwarded, 0, 'صفر شرارات إضافية لمنع الاستغلال');
  ok(r.body.nextAvailableInHours >= 0, 'ساعات التجديد لغد');

  const u = await prisma.user.findUnique({ where: { id: userId } });
  eq(u.sparksBalance, 55, 'الرصيد لم يتغير وظل 55');
});

await t('GET /api/insights/status يعرض حالة الزر العائم وتجدده', async () => {
  const r = await A(request(app).get('/api/insights/status'));
  eq(r.status, 200, 'status');
  eq(r.body.availableToday, false, 'مستلمة اليوم');
});

await t('GET /api/insights/history يعرض أرشيف المعلومات السابقة للمستخدم', async () => {
  const r = await A(request(app).get('/api/insights/history'));
  eq(r.status, 200, 'status');
  eq(r.body.total, 1, 'سجل معلومة اليوم');
  eq(r.body.history[0].speaker, 'إيلون ماسك — Elon Musk', 'المتحدث في الأرشيف');
});

console.log('\n━━━ 🗑️ حذف وتعطيل المعلومات (Admin) ━━━');

await t('المشرف يعطل معلومة بنجاح', async () => {
  const r = await Admin(request(app).delete(`/api/insights/admin/items/${elonInsightId}`));
  eq(r.status, 200, 'status');
});

console.log(`\n${'═'.repeat(50)}\nالنتيجة: ✅ ${pass} نجح   ❌ ${fail} فشل\n${'═'.repeat(50)}`);
process.exit(fail ? 1 : 0);
