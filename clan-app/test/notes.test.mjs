import 'dotenv/config';
process.env.JWT_ACCESS_SECRET = 't_acc_1234567890_abcdefghijklmn';
process.env.JWT_REFRESH_SECRET = 't_ref_0987654321_zyxwvutsrqponm';
process.env.GOOGLE_CLIENT_ID = 'fake.apps.googleusercontent.com';
process.env.NODE_ENV = 'test';
process.env.MONGO_URI ||= 'mongodb://127.0.0.1:27017/x';
process.env.REDIS_URL ||= 'redis://127.0.0.1:6379';

const { register } = await import('node:module');
register('./google-mock-loader.mjs', import.meta.url);

const request = (await import('supertest')).default;
const prisma = (await import('../src/config/prisma.js')).default;
const app = (await import('../src/app.js')).default;

let pass = 0, fail = 0;
const t = async (n, f) => {
  try {
    await f();
    console.log(`✅ ${n}`);
    pass++;
  } catch (e) {
    console.log(`❌ ${n}\n     ${e.message}`);
    fail++;
  }
};
const eq = (a, b, m = '') => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: توقعت ${JSON.stringify(b)} فحصلت ${JSON.stringify(a)}`);
};
const ok = (c, m) => {
  if (!c) throw new Error(m);
};

// ── تنظيف ──
await prisma.note.deleteMany();
await prisma.refreshToken.deleteMany();
await prisma.user.deleteMany();

const reg = await request(app).post('/api/auth/google').send({ idToken: 'valid:n1:notes@t.com:NotesUser' });
const TOK = reg.body.accessToken;
await request(app).post('/api/auth/onboarding').set('Authorization', `Bearer ${TOK}`).send({ domain: 'TECH' });
const A = (r) => r.set('Authorization', `Bearer ${TOK}`);

// مستخدم ثانٍ لاختبار العزل
const reg2 = await request(app).post('/api/auth/google').send({ idToken: 'valid:n2:other@t.com:OtherNotesUser' });
const TOK2 = reg2.body.accessToken;
await request(app).post('/api/auth/onboarding').set('Authorization', `Bearer ${TOK2}`).send({ domain: 'STUDY' });
const B = (r) => r.set('Authorization', `Bearer ${TOK2}`);

console.log('\n━━━ إنشاء المسودات والحفظ ━━━');

await t('إنشاء مسودة بنجاح (201) مع عنوان ومحتوى', async () => {
  const res = await A(request(app).post('/api/notes')).send({
    title: 'فكرة بناء نظام إشعارات ذكي',
    body: 'نحتاج لربط خدمة Socket.io مع Redis Pub/Sub لمعالجة ملايين الرسائل',
    tag: 'تقنية',
  });
  eq(res.status, 201);
  ok(res.body.note.id, 'id موجود');
  eq(res.body.note.title, 'فكرة بناء نظام إشعارات ذكي');
  eq(res.body.note.body, 'نحتاج لربط خدمة Socket.io مع Redis Pub/Sub لمعالجة ملايين الرسائل');
  eq(res.body.note.tag, 'تقنية');
});

await t('إنشاء مسودة عبر المسار البديل /api/drafts', async () => {
  const res = await A(request(app).post('/api/drafts')).send({
    title: 'مسودة عبر مسار drafts',
    body: 'محتوى تجريبي عبر المسار البديل',
  });
  eq(res.status, 201);
  ok(res.body.note.id);
});

await t('إنشاء مسودة بلا محتوى يُرفض 400', async () => {
  const res = await A(request(app).post('/api/notes')).send({
    title: 'عنوان فقط',
    body: '',
  });
  eq(res.status, 400);
});

await t('إنشاء مسودة بمحتوى مسافات فقط يُرفض 400', async () => {
  const res = await A(request(app).post('/api/notes')).send({
    title: 'عنوان',
    body: '    ',
  });
  eq(res.status, 400);
});

console.log('\n━━━ القوائم والبحث والفلاتر ━━━');

await t('جلب قائمة المسودات مرتبة تنازلياً', async () => {
  const res = await A(request(app).get('/api/notes'));
  eq(res.status, 200);
  ok(Array.isArray(res.body.notes), 'notes مصفوفة');
  ok(res.body.notes.length >= 2, 'توجد مسودات');
});

await t('البحث في المسودات بالكلمة المفتاحية', async () => {
  const res = await request(app)
    .get('/api/notes')
    .query({ q: 'إشعارات' })
    .set('Authorization', `Bearer ${TOK}`);
  if (res.body.notes?.length !== 1) {
    console.log('SEARCH RES BODY:', JSON.stringify(res.body, null, 2));
  }
  eq(res.status, 200);
  eq(res.body.notes.length, 1);
  eq(res.body.notes[0].title, 'فكرة بناء نظام إشعارات ذكي');
});

console.log('\n━━━ التعديل والتحديث ━━━');

let testNoteId = null;
await t('تحديث محتوى وعنوان وتثبيت مسودة', async () => {
  const createRes = await A(request(app).post('/api/notes')).send({
    title: 'مسودة للتعديل',
    body: 'نص أصلي',
  });
  testNoteId = createRes.body.note.id;

  const updateRes = await A(request(app).put(`/api/notes/${testNoteId}`)).send({
    title: 'مسودة بعد التعديل',
    body: 'نص محدث ومعدل بنجاح',
    isPinned: true,
  });
  eq(updateRes.status, 200);
  eq(updateRes.body.note.title, 'مسودة بعد التعديل');
  eq(updateRes.body.note.body, 'نص محدث ومعدل بنجاح');
  eq(updateRes.body.note.isPinned, true);
});

await t('تحديث بمحتوى فارغ يُرفض 400', async () => {
  const res = await A(request(app).patch(`/api/notes/${testNoteId}`)).send({
    body: '   ',
  });
  eq(res.status, 400);
});

console.log('\n━━━ رفع وتحليل المسودة بالـ AI ━━━');

await t('رفع المسودة للتحليل الذكي عبر POST /api/notes/:id/ai-analyze', async () => {
  const res = await A(request(app).post(`/api/notes/${testNoteId}/ai-analyze`)).send({});
  eq(res.status, 200);
  ok(res.body.analysis, 'يحتوي على تحليل الـ AI');
  ok(res.body.analysis.length > 20, 'التحليل نص غني');
});

await t('تحليل مسودة مباشرة بدون حفظ مسبق عبر POST /api/notes/ai-analyze', async () => {
  const res = await A(request(app).post('/api/notes/ai-analyze')).send({
    title: 'تعلم مهارة جديدة',
    body: 'أريد تعلم برمجة الأنظمة الموزعة في 8 أسابيع',
  });
  eq(res.status, 200);
  ok(res.body.analysis);
});

console.log('\n━━━ الحذف والعزل بين المستخدمين ━━━');

await t('🔥 مستخدم آخر لا يرى مسودات المستخدم الأول (عزل تام)', async () => {
  const res = await B(request(app).get('/api/notes'));
  eq(res.status, 200);
  eq(res.body.notes.length, 0, 'مستخدم 2 لا يرى مسودات مستخدم 1');
});

await t('🔥 مستخدم آخر لا يستطيع تعديل أو حذف مسودة غيره (404/حماية)', async () => {
  const res = await B(request(app).delete(`/api/notes/${testNoteId}`));
  eq(res.status, 404);
});

await t('حذف المسودة من صاحبها الأصلي بنجاح', async () => {
  const delRes = await A(request(app).delete(`/api/notes/${testNoteId}`));
  eq(delRes.status, 200);

  const getRes = await A(request(app).get(`/api/notes/${testNoteId}`));
  eq(getRes.status, 404);
});

console.log(`\n══════════════════════════════════════════════`);
console.log(`  نجح ${pass} · فشل ${fail}`);
console.log(`══════════════════════════════════════════════\n`);

if (fail > 0) process.exit(1);
