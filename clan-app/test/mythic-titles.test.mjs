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
const titleEngine = await import('../src/services/titleEngine.service.js');

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

// تنظيف البيئة
await prisma.userTitle.deleteMany();
await prisma.focusSession.deleteMany();
await prisma.task.deleteMany();
await prisma.wakeLog.deleteMany();
await prisma.sparkTransaction.deleteMany();
await prisma.user.deleteMany();

// تسجيل مستخدم بطل
const reg = await request(app).post('/api/auth/google').send({ idToken: 'valid:tit_u1:titan@clan.com:TitanUser' });
const token = reg.body.accessToken;
const userId = reg.body.user.id;
await request(app).post('/api/auth/onboarding').set('Authorization', `Bearer ${token}`).send({ domain: 'TECH', specialty: 'SOFTWARE_DEV' });

console.log('\n━━━ 👑 ١. استعراض الألقاب الأسطورية الثلاثة النادرة ━━━');
let titlesList = [];
await t('GET /api/achievements/titles يعرض الألقاب الثلاثة مع الشروط المركبة', async () => {
  const res = await request(app)
    .get('/api/achievements/titles')
    .set('Authorization', `Bearer ${token}`);

  eq(res.status, 200);
  eq(res.body.titlesCount, 3, 'عدد الألقاب النادرة');
  eq(res.body.unlockedCount, 0, 'المفتوح في البداية');
  titlesList = res.body.titles;
  ok(titlesList.some((t) => t.code === 'SOLAR_TITAN'), 'وحش اليوم الكامل موجود');
  ok(titlesList.some((t) => t.code === 'IRON_JUGGERNAUT'), 'المحارب الفولاذي موجود');
  ok(titlesList.some((t) => t.code === 'CONQUEROR_SOVEREIGN'), 'الفاتح الأسطوري موجود');
});

console.log('\n━━━ 🔒 ٢. الحماية من ارتداء ألقاب مقفلة ━━━');
await t('محاولة ارتداء لقب أسطوري قبل استيفاء شروطه تُرفض 403 (TITLE_LOCKED)', async () => {
  const solarId = titlesList.find((t) => t.code === 'SOLAR_TITAN').id;
  const res = await request(app)
    .post(`/api/achievements/titles/${solarId}/equip`)
    .set('Authorization', `Bearer ${token}`);

  eq(res.status, 403);
});

console.log('\n━━━ 🐉 ٣. تحقيق الشروط المركبة لفتح لقب "وحش اليوم الكامل" ━━━');
await t('تحقيق ١٠ ساعات تركيز + مهمة حرجة + صفر إخفاق يفتح اللقب ويمنح 500 شرارة', async () => {
  // زرع جلسة 600 دقيقة مكتملة
  await prisma.focusSession.create({
    data: {
      userId,
      status: 'COMPLETED',
      plannedMin: 600,
      serverVerifiedMin: 600,
      earnedSparks: 140,
      type: 'SOLO',
      startedAt: new Date(Date.now() - 10 * 3600 * 1000),
      endedAt: new Date(),
    },
  });

  // مهمة حرجة منجزة في نفس اليوم
  await prisma.task.create({
    data: {
      userId,
      title: 'إنجاز المهمة الحرجة الكبرى',
      priority: 'CRITICAL',
      isCompleted: true,
      completedAt: new Date(),
    },
  });

  // تقييم الألقاب
  const newlyUnlocked = await titleEngine.evaluateUserMythicTitles(userId);
  ok(newlyUnlocked.length >= 1, 'تم فتح اللقب الأسطوري');
  eq(newlyUnlocked[0].code, 'SOLAR_TITAN', 'رمز اللقب المفتوح');
  eq(newlyUnlocked[0].bonusSparks, 500, 'شرارات الشرف');
});

console.log('\n━━━ ⚡ ٤. ارتداء اللقب وهيبة الدخول النادر (Mythic Entrance) ━━━');
await t('ارتداء لقب وحش اليوم الكامل يولد هالة اللهب القرمزي وبنر الدخول الملكي', async () => {
  const solarId = titlesList.find((t) => t.code === 'SOLAR_TITAN').id;
  const res = await request(app)
    .post(`/api/achievements/titles/${solarId}/equip`)
    .set('Authorization', `Bearer ${token}`);

  eq(res.status, 200);
  eq(res.body.equippedTitle.code, 'SOLAR_TITAN', 'اللقب المجهز');
  eq(res.body.equippedTitle.auraEffect, 'CRIMSON_SOLAR_FLAME', 'هالة اللهب القرمزي');

  // فحص حزمة الدخول النادر عبر السوكيت
  const entrancePayload = await titleEngine.generateEliteEntrancePayload(userId);
  ok(entrancePayload, 'حزمة الدخول النادر موجودة');
  eq(entrancePayload.isElite, true, 'حالة النخبة');
  ok(entrancePayload.bannerMessage.includes('وحش اليوم الكامل'), 'نص بنر الدخول');
  eq(entrancePayload.soundFx, 'MYTHIC_DRAGON_ROAR', 'المؤثر الصوتي الأسطوري');
});

console.log('\n━━━ 🛡️ ٥. خلع اللقب وقاعة المشاهير ━━━');
await t('خلع اللقب بنجاح', async () => {
  const res = await request(app)
    .post('/api/achievements/titles/unequip')
    .set('Authorization', `Bearer ${token}`);

  eq(res.status, 200);
  const entrancePayload = await titleEngine.generateEliteEntrancePayload(userId);
  eq(entrancePayload, null, 'لا يتم بث أي دخول بعد خلع اللقب');
});

await t('GET /api/achievements/hall-of-fame يعرض أساطير الألقاب النادرة', async () => {
  const res = await request(app)
    .get('/api/achievements/hall-of-fame')
    .set('Authorization', `Bearer ${token}`);

  eq(res.status, 200);
  ok(res.body.hallOfFame.length === 3, 'الألقاب الثلاثة في قاعة المشاهير');
  const solarHof = res.body.hallOfFame.find((h) => h.code === 'SOLAR_TITAN');
  eq(solarHof.totalHoldersCount, 1, 'حامل واحد للقب');
});

console.log(`\n${'═'.repeat(48)}`);
console.log(`  نجح ${pass} · فشل ${fail}`);
console.log('═'.repeat(48));

process.exit(fail > 0 ? 1 : 0);
