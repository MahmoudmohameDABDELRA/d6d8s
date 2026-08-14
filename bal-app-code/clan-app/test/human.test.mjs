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
await prisma.dailyMoodLog.deleteMany();
await prisma.sparkTransaction.deleteMany();
await prisma.user.deleteMany();

// مستخدم مسجل
const regUser = await request(app).post('/api/auth/google').send({ idToken: 'valid:human_u1:hero@clan.com:HeroUser' });
const userTok = regUser.body.accessToken;
const userId = regUser.body.user.id;
await request(app).post('/api/auth/onboarding').set('Authorization', `Bearer ${userTok}`).send({ domain: 'TECH', specialty: 'SOFTWARE_DEV' });
await prisma.user.update({
  where: { id: userId },
  data: {
    sparksBalance: 100,
    totalSparksEarned: 500,
    totalFocusMin: 3000,
    longestStreak: 30,
    currentStreak: 12,
    shieldsRemaining: 2,
    shieldsUsedThisMonth: 0,
  },
});

const A = (r) => r.set('Authorization', `Bearer ${userTok}`);

console.log('\n━━━ 🛡️ ١. درع استراحة المحارب وتجميد الستريك ━━━');

await t('تفعيل درع استراحة المحارب يخصم درعاً ويحفظ السلسلة في يوم التعب', async () => {
  const r = await A(request(app).post('/api/human/shield')).send({ timezone: 'Africa/Cairo' });
  eq(r.status, 200, 'status');
  eq(r.body.shieldsRemaining, 1, 'الدروع المتبقية أصبحت 1');
  ok(r.body.message.includes('أنت إنسان مش ماكينة'), 'رسالة الاحتواء والرحمة');

  const u = await prisma.user.findUnique({ where: { id: userId } });
  eq(u.shieldsRemaining, 1, 'محدث في جدول User');
});

await t('تفعيل الدرع الثاني في نفس الشهر ينجح', async () => {
  const r = await A(request(app).post('/api/human/shield')).send({ timezone: 'Africa/Cairo' });
  eq(r.status, 200, 'status');
  eq(r.body.shieldsRemaining, 0, 'الدروع أصبحت 0');
});

await t('محاولة تفعيل درع ثالث بعد نفاد الرصيد تُرفض 403 (NO_SHIELDS_LEFT)', async () => {
  const r = await A(request(app).post('/api/human/shield')).send({ timezone: 'Africa/Cairo' });
  eq(r.status, 403, 'status');
  eq(r.body.code, 'NO_SHIELDS_LEFT', 'code');
});

console.log('\n━━━ 🎭 ٢. فحص المزاج وتكيف نبرة التطبيق ━━━');

await t('تسجيل مزاج "محبط ومخنوق" 😔 يرجع نصيحة دافئة وتراك مطر و+3 شرارات', async () => {
  const r = await A(request(app).post('/api/human/mood')).send({
    mood: 'FRUSTRATED',
    note: 'حاسس بضغط ومفيش طاقة',
    timezone: 'Africa/Cairo',
  });
  eq(r.status, 200, 'status');
  eq(r.body.mood, 'FRUSTRATED', 'المزاج');
  ok(r.body.response.title.includes('حاسس بيك'), 'عنوان الاحتواء');
  eq(r.body.response.recommendedAudio, 'NATURE', 'تراك المطر المقترح');

  // فحص رصيد الشرارات
  const u = await prisma.user.findUnique({ where: { id: userId } });
  eq(u.sparksBalance, 103, 'الرصيد زاد 3 شرارات استرخاء');
});

await t('مزاج غير صالح يُرفض 400', async () => {
  const r = await A(request(app).post('/api/human/mood')).send({ mood: 'SUPER_ANGRY' });
  eq(r.status, 400, 'status');
});

console.log('\n━━━ 🕯️ ٣. صندوق تفريغ الغضب وحرق الهموم (Venting Box) ━━━');

await t('تفريغ الغضب يحرق النص دون حفظه في الداتابيز ويمنح +3 شرارات هدوء', async () => {
  const r = await A(request(app).post('/api/human/vent')).send({
    ventText: 'مخنوق جداً من ضغط الشغل والامتحانات ومحتاج أصرخ!',
  });
  eq(r.status, 200, 'status');
  eq(r.body.burned, true, 'تم الحرق');
  ok(r.body.message.includes('خرجت من صدرك خلاص وتلاشت في الرماد'), 'رسالة التحرر النفسي');
  eq(r.body.sparksAwarded, 3, 'مكافأة 3 شرارات');
});

await t('تفريغ فارغ يُرفض 400', async () => {
  const r = await A(request(app).post('/api/human/vent')).send({});
  eq(r.status, 400, 'status');
});

console.log('\n━━━ 👑 ٤. استقبال البطل وعرض الإنجازات الـ ٣ بعد الغياب (Hero Welcome) ━━━');

await t('GET /api/human/welcome-back يعرض الأمجاد الـ 3 بشرائح 5 ثوانٍ و+10 شرارات', async () => {
  const r = await A(request(app).get('/api/human/welcome-back?timezone=Africa/Cairo'));
  eq(r.status, 200, 'status');
  eq(r.body.isHeroComeback, true, 'استقبال البطل');
  ok(r.body.greeting.includes('أنت بطل حقيقي لا تكسره العثرات'), 'رسالة الاستقبال الإنسانية');
  eq(r.body.slideDurationSec, 5, 'مدة كل إنجاز 5 ثوانٍ بالضبط');
  eq(r.body.totalSlides, 3, '٣ إنجازات متتالية لإشعال الطاقة');
  eq(r.body.welcomeSparksGift, 10, 'هدية العودة 10 شرارات');
});

console.log(`\n${'═'.repeat(50)}\nالنتيجة: ✅ ${pass} نجح   ❌ ${fail} فشل\n${'═'.repeat(50)}`);
process.exit(fail ? 1 : 0);
