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
await prisma.audioPurchase.deleteMany();
await prisma.audioTrack.deleteMany();
await prisma.focusSession.deleteMany();
await prisma.user.deleteMany();

// مستخدم عادي برصيد 100 شرارة
const regUser = await request(app).post('/api/auth/google').send({ idToken: 'valid:astream_u1:stream@user.com:StreamUser' });
const userTok = regUser.body.accessToken;
const userId = regUser.body.user.id;
await request(app).post('/api/auth/onboarding').set('Authorization', `Bearer ${userTok}`).send({ domain: 'TECH' });
await prisma.user.update({ where: { id: userId }, data: { sparksBalance: 100, totalSparksEarned: 100, unlockedAudioSlots: 1 } });

// مستخدم مشرف
const regAdmin = await request(app).post('/api/auth/google').send({ idToken: 'valid:astream_adm:adm@stream.com:StreamAdmin' });
const adminTok = regAdmin.body.accessToken;
await request(app).post('/api/auth/onboarding').set('Authorization', `Bearer ${adminTok}`).send({ domain: 'TECH' });
await prisma.user.update({ where: { id: regAdmin.body.user.id }, data: { role: 'ADMIN' } });
const adminLogin = await request(app).post('/api/auth/google').send({ idToken: 'valid:astream_adm:adm@stream.com:StreamAdmin' });
const refreshedAdminTok = adminLogin.body.accessToken;

const A = (r) => r.set('Authorization', `Bearer ${userTok}`);
const Admin = (r) => r.set('Authorization', `Bearer ${refreshedAdminTok}`);

console.log('\n━━━ 🔒 حماية البث ومنع القرصنة (Audio Stream Proxy) ━━━');

let trackId;
// إضافة تراك رسمي
const addTrackRes = await Admin(request(app).post('/api/audio/tracks')).send({
  title: 'موجات بيتا للتركيز المكثف — Beta Waves 14Hz',
  category: 'BINAURAL',
  durationSec: 900,
  sourceUrl: 'https://drive.google.com/file/d/1A2B3C4D5E6F7G8H9I0J1K2L3M/view',
  previewUrl: 'https://cdn.clanapp.com/previews/beta_sample.mp3',
  sparksCost: 35,
});
trackId = addTrackRes.body.track.id;

await t('محاولة البث المباشر قبل الشراء تُرفض 403 (AUDIO_NOT_PURCHASED)', async () => {
  const r = await A(request(app).get(`/api/audio/${trackId}/stream`));
  eq(r.status, 403, 'status');
  eq(r.body.code, 'AUDIO_NOT_PURCHASED', 'code');
});

await t('شراء التراك بالشرارات يمنح ترخيص الاستماع', async () => {
  const r = await A(request(app).post(`/api/audio/${trackId}/purchase`));
  eq(r.status, 201, 'status');
  eq(r.body.sparks.balance, 65, 'الرصيد المتبقي (100 - 35)');
});

await t('فتح مجرى البث الصوتي المشفر بعد الشراء بترويسات الأمان (200 OK / audio/mpeg)', async () => {
  const r = await A(request(app).get(`/api/audio/${trackId}/stream`));
  eq(r.status, 200, 'status');
  eq(r.headers['content-type'], 'audio/mpeg', 'نوع المحتوى الصوتي');
  eq(r.headers['accept-ranges'], 'bytes', 'دعم التقديم والتأخير');
  eq(r.headers['x-content-type-options'], 'nosniff', 'حماية الرؤوس');
});

await t('المشرف يستطيع فحص وبث أي تراك دون شراء مسبق', async () => {
  const r = await Admin(request(app).get(`/api/audio/${trackId}/stream`));
  eq(r.status, 200, 'status');
  eq(r.headers['content-type'], 'audio/mpeg', 'بث المشرف');
});

console.log('\n━━━ ⏱️ تكامل فقاعة الصوتيات وويدجت جلسة التركيز (Now Playing) ━━━');

await t('بدء جلسة تركيز مع ربط المقطع الصوتي المشغل (audioTrackId & audioTitle)', async () => {
  const r = await A(request(app).post('/api/focus/start')).send({
    plannedMin: 25,
    audioTrackId: trackId,
    audioTitle: 'موجات بيتا للتركيز المكثف — Beta Waves 14Hz',
  });
  eq(r.status, 201, 'status');
});

await t('GET /api/focus/active يرجع بيانات التراك لويدجت "يعمل الآن" تحت المؤقت', async () => {
  const r = await A(request(app).get('/api/focus/active'));
  eq(r.status, 200, 'status');
  ok(r.body.session, 'الجلسة النشطة');
  eq(r.body.session.audioTrackId, trackId, 'معرف التراك في الويدجت');
  eq(r.body.session.audioTitle, 'موجات بيتا للتركيز المكثف — Beta Waves 14Hz', 'عنوان التراك');
});

console.log(`\n${'═'.repeat(50)}\nالنتيجة: ✅ ${pass} نجح   ❌ ${fail} فشل\n${'═'.repeat(50)}`);
process.exit(fail ? 1 : 0);
