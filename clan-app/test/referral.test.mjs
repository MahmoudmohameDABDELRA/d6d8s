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
const referralController = await import('../src/modules/referral/referral.controller.js');

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
await prisma.referral.deleteMany();
await prisma.notification.deleteMany();
await prisma.sparkTransaction.deleteMany();
await prisma.user.deleteMany();

// المستخدم الأول (الداعي - طارق)
const regUser1 = await request(app).post('/api/auth/google').send({ idToken: 'valid:ref_u1:tarek@clan.com:Tarek' });
const user1Tok = regUser1.body.accessToken;
const user1Id = regUser1.body.user.id;
await request(app).post('/api/auth/onboarding').set('Authorization', `Bearer ${user1Tok}`).send({ domain: 'TECH', specialty: 'SOFTWARE_DEV' });
await prisma.user.update({ where: { id: user1Id }, data: { sparksBalance: 100, totalSparksEarned: 100, unlockedAudioSlots: 1 } });

// المستخدم الثاني (المنضم - زياد)
const regUser2 = await request(app).post('/api/auth/google').send({ idToken: 'valid:ref_u2:ziad@clan.com:Ziad' });
const user2Tok = regUser2.body.accessToken;
const user2Id = regUser2.body.user.id;
await request(app).post('/api/auth/onboarding').set('Authorization', `Bearer ${user2Tok}`).send({ domain: 'TECH', specialty: 'AI_DATA' });

const A = (r) => r.set('Authorization', `Bearer ${user1Tok}`);
const B = (r) => r.set('Authorization', `Bearer ${user2Tok}`);

console.log('\n━━━ 🎁 المستوى الأول: مكافأة التسجيل المجاني العادية ━━━');

let tarekReferralCode;

await t('GET /api/referrals/stats يولد كود إحالة فريد ويعرض تفاصيل المستويين', async () => {
  const r = await A(request(app).get('/api/referrals/stats'));
  eq(r.status, 200, 'status');
  ok(r.body.referralCode, 'كود الإحالة موجود');
  ok(r.body.shareUrl.includes(r.body.referralCode), 'رابط المشاركة');
  eq(r.body.rewardsSystem.freeSignup.referrerSparks, 25, '25 شرارة للداعي');
  tarekReferralCode = r.body.referralCode;
});

await t('محاولة استخدام المستخدم لكود الإحالة الخاص به تُرفض 403 (SELF_REFERRAL_FORBIDDEN)', async () => {
  const r = await A(request(app).post('/api/referrals/apply')).send({ code: tarekReferralCode });
  eq(r.status, 403, 'status');
  eq(r.body.code, 'SELF_REFERRAL_FORBIDDEN', 'code');
});

await t('كود إحالة وهمي أو غير موجود يُرفض 404', async () => {
  const r = await B(request(app).post('/api/referrals/apply')).send({ code: 'FAKE-999' });
  eq(r.status, 404, 'status');
});

await t('المستوى 1: زياد يطبق كود طارق فيحصل كلاهما على 25 شرارة وتتحرر مساحة صوتية محلية لطارق', async () => {
  const r = await B(request(app).post('/api/referrals/apply')).send({ code: tarekReferralCode });
  eq(r.status, 200, 'status');
  eq(r.body.rewards.sparksAwarded, 25, 'هدية المنضم 25 شرارة');

  // فحص حساب الداعي (طارق): +25 شرارة + تحرير مساحة صوتية بالهاتف (+1 Slot)
  const tarek = await prisma.user.findUnique({ where: { id: user1Id } });
  eq(tarek.sparksBalance, 125, 'رصيد طارق أصبح (100 + 25)');
  eq(tarek.unlockedAudioSlots, 2, 'تحرير مساحة صوتية محلية واحدة لطارق');
  eq(tarek.bonusAiMessages, 0, 'رسائل الـ AI الكبرى لا تُمنح في التسجيل المجاني');

  // فحص حساب المنضم (زياد): +25 شرارة وربط الإحالة
  const ziad = await prisma.user.findUnique({ where: { id: user2Id } });
  eq(ziad.sparksBalance, 25, 'رصيد زياد 25');
  eq(ziad.referredById, user1Id, 'ربط زياد بطارق');
});

await t('محاولة تطبيق كود إحالة مرة ثانية لنفس المستخدم تُرفض 409 (ALREADY_REFERRED)', async () => {
  const r = await B(request(app).post('/api/referrals/apply')).send({ code: tarekReferralCode });
  eq(r.status, 409, 'status');
  eq(r.body.code, 'ALREADY_REFERRED', 'code');
});

console.log('\n━━━ 👑 المستوى الثاني: المكافآت الكبرى عند اشتراك الصديق في باقة مدفوعة ━━━');

await t('المستوى 2: عند اشتراك زياد في باقة مدفوعة، تصل المكافأة الكبرى لطارق (+150 شرارة و +20 رسالة AI)', async () => {
  // محاكاة اشتراك زياد في باقة مدفوعة
  const conversionResult = await referralController.processPaidReferralConversion(user2Id);
  ok(conversionResult, 'تم تنفيذ التحويل المدفوع');
  eq(conversionResult.sparksAwarded, 150, '150 شرارة كبرى');
  eq(conversionResult.aiMessages, 20, '20 رسالة AI كبرى');

  // فحص حساب طارق النهائي بعد اشتراك صديقه
  const tarekFinal = await prisma.user.findUnique({ where: { id: user1Id } });
  eq(tarekFinal.sparksBalance, 275, 'رصيد طارق أصبح (125 + 150 = 275)');
  eq(tarekFinal.bonusAiMessages, 20, 'حصل على 20 رسالة AI إضافية');

  // التأكد من تسجيل الإشعار الفوري التتويجي لطارق
  const notifs = await prisma.notification.findMany({ where: { userId: user1Id }, orderBy: { createdAt: 'desc' } });
  ok(notifs.some(n => n.title.includes('المكافأة الكبرى')), 'إشعار المكافأة الكبرى وصل لهاتف طارق');
});

console.log(`\n${'═'.repeat(50)}\nالنتيجة: ✅ ${pass} نجح   ❌ ${fail} فشل\n${'═'.repeat(50)}`);
process.exit(fail ? 1 : 0);
