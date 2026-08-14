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
const sparksService = await import('../src/services/sparks.service.js');

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
await prisma.audioPurchase.deleteMany();
await prisma.audioTrack.deleteMany();
await prisma.user.deleteMany();

// مستخدم عادي برصيد 100 شرارة
const regUser = await request(app).post('/api/auth/google').send({ idToken: 'valid:audio_u1:audio@user.com:AudioUser' });
const userTok = regUser.body.accessToken;
const userId = regUser.body.user.id;
await request(app).post('/api/auth/onboarding').set('Authorization', `Bearer ${userTok}`).send({ domain: 'TECH' });
await prisma.user.update({ where: { id: userId }, data: { sparksBalance: 100, totalSparksEarned: 100, unlockedAudioSlots: 1 } });

// مستخدم أدمن لإدارة التراكات
const regAdmin = await request(app).post('/api/auth/google').send({ idToken: 'valid:audio_adm:admin@audio.com:AudioAdmin' });
const adminTok = regAdmin.body.accessToken;
await request(app).post('/api/auth/onboarding').set('Authorization', `Bearer ${adminTok}`).send({ domain: 'TECH' });
await prisma.user.update({ where: { id: regAdmin.body.user.id }, data: { role: 'ADMIN' } });
const adminLogin = await request(app).post('/api/auth/google').send({ idToken: 'valid:audio_adm:admin@audio.com:AudioAdmin' });
const refreshedAdminTok = adminLogin.body.accessToken;

const A = (r) => r.set('Authorization', `Bearer ${userTok}`);
const Admin = (r) => r.set('Authorization', `Bearer ${refreshedAdminTok}`);

console.log('\n━━━ 🎧 إضافة المقاطع الرسمية (Admin) ━━━');

let trackId, rainTrackId;

await t('المستخدم العادي لا يستطيع إضافة تراك رسمي (403 ADMIN_ONLY)', async () => {
  const r = await A(request(app).post('/api/audio/tracks')).send({
    title: 'تراك غير مصرح',
    sourceUrl: 'https://cdn.clanapp.com/audio/test.mp3',
  });
  eq(r.status, 403, 'status');
  eq(r.body.code, 'ADMIN_ONLY', 'code');
});

await t('المشرف يضيف مقطع لو-فاي رسمي (201)', async () => {
  const r = await Admin(request(app).post('/api/audio/tracks')).send({
    title: 'موسيقى برمجة هادئة — Lo-Fi Chill',
    description: 'إيقاعات هادئة لتحفيز التركيز العميق',
    category: 'LOFI',
    durationSec: 360,
    sourceUrl: 'https://cdn.clanapp.com/audio/lofi_chill_01.mp3',
    previewUrl: 'https://cdn.clanapp.com/audio/previews/lofi_01.mp3',
    sparksCost: 30,
  });
  eq(r.status, 201, 'status');
  eq(r.body.track.category, 'LOFI', 'التصنيف');
  trackId = r.body.track.id;
});

await t('المشرف يضيف مقطع صوت مطر ورعد (201)', async () => {
  const r = await Admin(request(app).post('/api/audio/tracks')).send({
    title: 'أصوات مطر غزير في الغابة',
    category: 'NATURE',
    durationSec: 600,
    sourceUrl: 'https://cdn.clanapp.com/audio/heavy_rain.mp3',
    sparksCost: 40,
  });
  eq(r.status, 201, 'status');
  rainTrackId = r.body.track.id;
});

console.log('\n━━━ 📻 تصفح الكتالوج الرسمي ━━━');

await t('GET /api/audio/catalog يعرض التراكات مع التصنيفات العربية', async () => {
  const r = await A(request(app).get('/api/audio/catalog'));
  eq(r.status, 200, 'status');
  eq(r.body.total, 2, 'إجمالي التراكات');
  ok(r.body.categories.length >= 5, 'قائمة التصنيفات');
  const t1 = r.body.tracks.find((x) => x.id === trackId);
  eq(t1.isOwned, false, 'غير مملوك بعد');
  eq(t1.sourceUrl, null, 'الرابط الكامل محمي قبل الشراء');
});

await t('فلترة الكتالوج حسب التصنيف (category=NATURE)', async () => {
  const r = await A(request(app).get('/api/audio/catalog?category=NATURE'));
  eq(r.status, 200, 'status');
  eq(r.body.tracks.length, 1, 'مقطع مطر واحد');
  eq(r.body.tracks[0].category, 'NATURE', 'التصنيف');
});

await t('تصنيف صوتي غير صالح يُرفض 400', async () => {
  const r = await A(request(app).get('/api/audio/catalog?category=ROCK_METAL'));
  eq(r.status, 400, 'status');
});

console.log('\n━━━ 💎 الشراء بالشرارات ومكتبتي ━━━');

await t('شراء تراك رسمي يخصم 30 شرارة ويمنح الملكية', async () => {
  const r = await A(request(app).post(`/api/audio/${trackId}/purchase`));
  eq(r.status, 201, 'status');
  eq(r.body.sparks.spent, 30, 'المصروف');
  eq(r.body.sparks.balance, 70, 'الرصيد المتبقي (100 - 30)');
  eq(r.body.track.sourceUrl, 'https://cdn.clanapp.com/audio/lofi_chill_01.mp3', 'فتح رابط الاستماع');

  const u = await prisma.user.findUnique({ where: { id: userId } });
  eq(u.sparksBalance, 70, 'رصيد المستخدم في القاعدة');
  eq(u.totalSparksEarned, 100, 'الإجمالي التراكمي لم يتأثر');
});

await t('إعادة شراء نفس التراك تُرفض 409 (AUDIO_ALREADY_PURCHASED)', async () => {
  const r = await A(request(app).post(`/api/audio/${trackId}/purchase`));
  eq(r.status, 409, 'status');
  eq(r.body.code, 'AUDIO_ALREADY_PURCHASED', 'code');
});

await t('GET /api/audio/library يعرض المشتريات ومساحات الهاتف المحلية', async () => {
  const r = await A(request(app).get('/api/audio/library'));
  eq(r.status, 200, 'status');
  eq(r.body.localSlots.unlockedSlots, 1, 'مساحة محلية مجانية واحدة افتراضياً');
  eq(r.body.totalOfficialPurchased, 1, 'تراك رسمي واحد مشترى');
  eq(r.body.officialTracks[0].id, trackId, 'معرف التراك');
});

console.log('\n━━━ 📱 تحرير مساحات الهاتف المحلية بالشرارات (Slots) ━━━');

await t('تحرير مساحة محلية إضافية يخصم 50 شرارة ويزيد الـ Slots إلى 2', async () => {
  const r = await A(request(app).post('/api/audio/unlock-slot'));
  eq(r.status, 201, 'status');
  eq(r.body.localSlots.unlockedSlots, 2, 'عدد المساحات المحلية أصبح 2');
  eq(r.body.sparks.balance, 20, 'الرصيد المتبقي (70 - 50)');

  const u = await prisma.user.findUnique({ where: { id: userId } });
  eq(u.unlockedAudioSlots, 2, 'محدث في جدول المستخدم');
  eq(u.sparksBalance, 20, 'الرصيد 20');
});

await t('محاولة شراء مقطع جديد بدون رصيد كافٍ تُرفض (INSUFFICIENT_SPARKS)', async () => {
  // رصيد المستخدم 20 شرارة وتراك المطر سعره 40 شرارة
  const r = await A(request(app).post(`/api/audio/${rainTrackId}/purchase`));
  eq(r.status, 400, 'status');
  eq(r.body.code, 'INSUFFICIENT_SPARKS', 'كود نقص الرصيد');
});

console.log('\n━━━ 🗑️ حذف المقاطع الرسمية (Admin) ━━━');

await t('المشرف يحذف تراك رسمي بنجاح', async () => {
  const r = await Admin(request(app).delete(`/api/audio/tracks/${rainTrackId}`));
  eq(r.status, 200, 'status');

  const check = await prisma.audioTrack.findUnique({ where: { id: rainTrackId } });
  eq(check, null, 'حذف من القاعدة');
});

console.log(`\n${'═'.repeat(50)}\nالنتيجة: ✅ ${pass} نجح   ❌ ${fail} فشل\n${'═'.repeat(50)}`);
process.exit(fail ? 1 : 0);
