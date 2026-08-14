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
await prisma.drawingSketch.deleteMany();
await prisma.gameRoomPlayer.deleteMany();
await prisma.gameRoom.deleteMany();
await prisma.user.deleteMany();

// تسجيل مستخدمين
const reg1 = await request(app).post('/api/auth/google').send({ idToken: 'valid:dom_u1:user1@clan.com:Gamer1' });
const token1 = reg1.body.accessToken;
const user1Id = reg1.body.user.id;
await request(app).post('/api/auth/onboarding').set('Authorization', `Bearer ${token1}`).send({ domain: 'TECH', specialty: 'SOFTWARE_DEV' });

const reg2 = await request(app).post('/api/auth/google').send({ idToken: 'valid:dom_u2:user2@clan.com:Gamer2' });
const token2 = reg2.body.accessToken;
const user2Id = reg2.body.user.id;
await request(app).post('/api/auth/onboarding').set('Authorization', `Bearer ${token2}`).send({ domain: 'TECH', specialty: 'SOFTWARE_DEV' });

console.log('\n━━━ 🎨 ١. لوحة الرسم والتفريغ الاسترخائي ━━━');
let sketchId = null;
await t('POST /api/games/draw/save يحفظ اللوحة ويمنح 3 شرارات استرخاء', async () => {
  const res = await request(app)
    .post('/api/games/draw/save')
    .set('Authorization', `Bearer ${token1}`)
    .send({
      title: 'رسمة غروب وشاطئ هادئ 🌅',
      canvasData: { strokes: [{ color: '#FF5722', size: 4, points: [{ x: 10, y: 20 }, { x: 30, y: 40 }] }] },
      durationMin: 5,
    });

  eq(res.status, 201);
  ok(res.body.sketch.id, 'معرف اللوحة');
  sketchId = res.body.sketch.id;
  ok(res.body.sparksBalance >= 3, 'شرارات الاسترخاء');
});

await t('GET /api/games/draw/gallery يستعرض معرض لوحات المستخدم', async () => {
  const res = await request(app)
    .get('/api/games/draw/gallery')
    .set('Authorization', `Bearer ${token1}`);

  eq(res.status, 200);
  eq(res.body.total, 1, 'لوحة واحدة في المعرض');
  eq(res.body.sketches[0].title, 'رسمة غروب وشاطئ هادئ 🌅');
});

await t('GET /api/games/draw/:id يجلب اللوحة المحددة', async () => {
  const res = await request(app)
    .get(`/api/games/draw/${sketchId}`)
    .set('Authorization', `Bearer ${token1}`);

  eq(res.status, 200);
  eq(res.body.sketch.id, sketchId);
});

console.log('\n━━━ 🎲 ٢. قائمة الألعاب وإنشاء غرفة دومينو بسقف 4 لاعبين ━━━');
await t('GET /api/games يرجع الألعاب الثلاث (الثعبان والدومينو والرسم)', async () => {
  const res = await request(app)
    .get('/api/games')
    .set('Authorization', `Bearer ${token1}`);

  eq(res.status, 200);
  ok(res.body.games.some((g) => g.type === 'DOMINO'), 'لعبة الدومينو موجودة');
  const dominoGame = res.body.games.find((g) => g.type === 'DOMINO');
  eq(dominoGame.maxPlayers, 4, 'سقف 4 لاعبين فقط في الدومينو');
});

console.log(`\n${'═'.repeat(48)}`);
console.log(`  نجح ${pass} · فشل ${fail}`);
console.log('═'.repeat(48));

process.exit(fail > 0 ? 1 : 0);
