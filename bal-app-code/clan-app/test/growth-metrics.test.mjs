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
await prisma.operationalExpense.deleteMany();
await prisma.marketingCampaign.deleteMany();
await prisma.subscription.deleteMany();
await prisma.user.deleteMany();

// إنشاء أدمن
const regAdmin = await request(app).post('/api/auth/google').send({ idToken: 'valid:gw_adm:admin@clan.com:GrowthAdmin' });
const tokenAdmin = regAdmin.body.accessToken;
const adminId = regAdmin.body.user.id;
await request(app).post('/api/auth/onboarding').set('Authorization', `Bearer ${tokenAdmin}`).send({ domain: 'BUSINESS', specialty: 'FINANCE' });
await prisma.user.update({ where: { id: adminId }, data: { role: 'ADMIN' } });

// إنشاء مستخدمين باشتراكات
const reg1 = await request(app).post('/api/auth/google').send({ idToken: 'valid:gw_u1:u1@clan.com:UserPro1' });
const u1Id = reg1.body.user.id;
await prisma.subscription.create({
  data: {
    userId: u1Id,
    plan: 'PRO',
    status: 'ACTIVE',
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
  },
});

const reg2 = await request(app).post('/api/auth/google').send({ idToken: 'valid:gw_u2:u2@clan.com:UserHigh2' });
const u2Id = reg2.body.user.id;
await prisma.subscription.create({
  data: {
    userId: u2Id,
    plan: 'HIGH',
    status: 'ACTIVE',
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
  },
});

console.log('\n━━━ 📊 ١. تسجيل ميزانيات الإعلانات والمصروفات ━━━');
await t('POST /api/admin/growth/marketing-spend يسجل حملة إعلانية لحساب الـ CAC', async () => {
  const res = await request(app)
    .post('/api/admin/growth/marketing-spend')
    .set('Authorization', `Bearer ${tokenAdmin}`)
    .send({
      title: 'حملة إعلانات تيك توك وميتا للشباب',
      platform: 'tiktok',
      spendAmount: 200,
      currency: 'USD',
      startDate: '2026-08-01',
      endDate: '2026-08-30',
    });

  eq(res.status, 201);
  eq(res.body.campaign.spendAmount, 200, 'المبلغ المصروف');
});

await t('POST /api/admin/growth/expenses يسجل مصاريف السيرفرات ورواتب الفريق', async () => {
  const resServer = await request(app)
    .post('/api/admin/growth/expenses')
    .set('Authorization', `Bearer ${tokenAdmin}`)
    .send({
      title: 'خوادم Hetzner & Cloudflare R2',
      category: 'SERVERS_CLOUD',
      amount: 50,
      currency: 'USD',
    });
  eq(resServer.status, 201);

  const resSalary = await request(app)
    .post('/api/admin/growth/expenses')
    .set('Authorization', `Bearer ${tokenAdmin}`)
    .send({
      title: 'رواتب المطورين والدعم الفني',
      category: 'SALARY',
      amount: 1000,
      currency: 'USD',
    });
  eq(resSalary.status, 201);
});

console.log('\n━━━ 🚀 ٢. استخراج اقتصاديات الوحدة والنسب الذهبية تلقائياً ━━━');
await t('GET /api/admin/growth/dashboard يرجع الـ CAC و LTV ومؤشرات الـ 1%', async () => {
  const res = await request(app)
    .get('/api/admin/growth/dashboard')
    .set('Authorization', `Bearer ${tokenAdmin}`);

  eq(res.status, 200);
  ok(res.body.goldenRatios.cac.value > 0, 'حساب تكلفة الاستحواذ CAC');
  ok(res.body.goldenRatios.ltv.value > 0, 'حساب القيمة الدائمة للعميل LTV');
  ok(res.body.goldenRatios.ltvToCacRatio.ratioFormatted, 'النسبة الذهبية LTV/CAC');
  ok(res.body.recurringRevenue.mrr > 0, 'الدخل المتكرر MRR');
  ok(res.body.recurringRevenue.arr > 0, 'الدخل السنوي ARR');
  ok(res.body.financialLedgerSummary.onePercentFund, 'صندوق الـ 1% الذهبي');
});

console.log('\n━━━ 📈 ٣. مصفوفة استبقاء الأفواج (Cohort Retention) ━━━');
await t('GET /api/admin/growth/cohorts يرجع مصفوفة الـ 6 شهور للاستبقاء D1 و D7 و D30', async () => {
  const res = await request(app)
    .get('/api/admin/growth/cohorts')
    .set('Authorization', `Bearer ${tokenAdmin}`);

  eq(res.status, 200);
  eq(res.body.cohorts.length, 6, '6 أفواج شهرية');
  ok(res.body.cohorts[0].retentionRates.day30, 'معدل استبقاء اليوم 30');
});

console.log(`\n${'═'.repeat(48)}`);
console.log(`  نجح ${pass} · فشل ${fail}`);
console.log('═'.repeat(48));

process.exit(fail > 0 ? 1 : 0);
