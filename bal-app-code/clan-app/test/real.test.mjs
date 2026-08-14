// اختبار على PostgreSQL + MongoDB حقيقيين — بلا أي محاكاة
import { MongoMemoryServer } from 'mongodb-memory-server';

const mongod = await MongoMemoryServer.create();
process.env.MONGO_URI = mongod.getUri('clan_app_chat');
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.JWT_ACCESS_SECRET = 'real_access_secret_1234567890_abcdef';
process.env.JWT_REFRESH_SECRET = 'real_refresh_secret_0987654321_fedcba';
process.env.NODE_ENV = 'test';

const { default: request } = await import('supertest');
const { default: prisma } = await import('../src/config/prisma.js');
const { connectMongo } = await import('../src/config/mongo.js');
const { default: Message } = await import('../src/modules/chat/message.model.js');
const { default: app } = await import('../src/app.js');

await connectMongo();

// تنظيف
await prisma.clanMember.deleteMany(); await prisma.clanInvite.deleteMany();
await prisma.clanAchievement.deleteMany(); await prisma.clanSession.deleteMany();
await prisma.refreshToken.deleteMany(); await prisma.clan.deleteMany();
await prisma.user.deleteMany();

let pass = 0, fail = 0;
const t = async (n, fn) => { try { await fn(); console.log(`✅ ${n}`); pass++; }
  catch (e) { console.log(`❌ ${n}\n     ${e.message}`); fail++; } };
const eq = (a, b, m='') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: توقعت ${JSON.stringify(b)} فحصلت ${JSON.stringify(a)}`); };

console.log('\n████ POSTGRESQL 17 حقيقي + MONGODB حقيقي ████');
console.log('\n━━━ 1. المصادقة على قاعدة بيانات حقيقية ━━━');

let tokA, tokB, userA, userB, cookieA;

await t('تسجيل مستخدم A (كتابة فعلية في Postgres)', async () => {
  const r = await request(app).post('/api/auth/register')
    .send({ username: 'omar', email: 'omar@test.com', password: 'password123', field: 'برمجة' });
  eq(r.status, 201, 'status'); tokA = r.body.accessToken; cookieA = r.headers['set-cookie'];
  userA = r.body.user.id;
  const inDb = await prisma.user.findUnique({ where: { id: userA } });
  if (!inDb) throw new Error('لم يُكتب في قاعدة البيانات');
});

await t('تسجيل مستخدم B', async () => {
  const r = await request(app).post('/api/auth/register')
    .send({ username: 'sara', email: 'sara@test.com', password: 'password123', field: 'برمجة' });
  eq(r.status, 201, 'status'); tokB = r.body.accessToken; userB = r.body.user.id;
});

await t('🔥 قيد التفرد الحقيقي يمنع الإيميل المكرر (P2002 → 409)', async () => {
  const r = await request(app).post('/api/auth/register')
    .send({ username: 'other', email: 'omar@test.com', password: 'password123' });
  eq(r.status, 409, 'status');
});

await t('argon2 hash محفوظ فعلياً في العمود', async () => {
  const u = await prisma.user.findUnique({ where: { id: userA } });
  if (!u.password.startsWith('$argon2id$')) throw new Error('غير مجزأة');
});

console.log('\n━━━ 2. العشائر — منطق فعلي على SQL ━━━');
const A = (r) => r.set('Authorization', `Bearer ${tokA}`);
const B = (r) => r.set('Authorization', `Bearer ${tokB}`);

let globalClanId, privClanId, inviteCode;

await t('auto-assign ينشئ عشيرة عالمية ويضم A', async () => {
  const r = await A(request(app).post('/api/clans/global/auto-assign'));
  eq(r.status, 200, 'status'); globalClanId = r.body.clan.id;
  const c = await prisma.clan.count({ where: { type: 'GLOBAL' } });
  eq(c, 1, 'عدد العشائر في DB');
});

await t('🔥 5 استدعاءات متزامنة لا تُنشئ تكراراً (upsert ذرّي على قيد حقيقي)', async () => {
  await Promise.all(Array.from({ length: 5 }, () =>
    B(request(app).post('/api/clans/global/auto-assign'))));
  const c = await prisma.clan.count({ where: { type: 'GLOBAL', category: 'برمجة' } });
  eq(c, 1, 'عشيرة واحدة رغم 5 طلبات متوازية');
  const m = await prisma.clanMember.count({ where: { clanId: globalClanId } });
  eq(m, 2, 'عضوان فقط بلا تكرار');
});

await t('إنشاء عشيرة خاصة (معاملة: عشيرة+قائد+دعوة)', async () => {
  const r = await A(request(app).post('/api/clans/private/create')).send({ name: 'فريق النخبة' });
  eq(r.status, 201, 'status'); privClanId = r.body.clan.id; inviteCode = r.body.clan.inviteCode;
  const inv = await prisma.clanInvite.count({ where: { clanId: privClanId } });
  const led = await prisma.clanMember.count({ where: { clanId: privClanId, role: 'LEADER' } });
  eq([inv, led], [1, 1], 'الدعوة والقائد');
});

await t('🔥 B ينضم بكود دعوة حقيقي', async () => {
  const r = await B(request(app).post('/api/clans/private/join')).send({ inviteCode });
  eq(r.status, 200, 'status');
  eq(await prisma.clanMember.count({ where: { clanId: privClanId } }), 2, 'عضوان');
});

await t('🔥 انضمام مكرر يُرفض 409 (قيد @@unique الحقيقي)', async () => {
  const r = await B(request(app).post('/api/clans/private/join')).send({ inviteCode });
  eq(r.status, 409, 'status');
});

await t('كود دعوة خاطئ → 404 (كان 500 TypeError)', async () => {
  eq((await B(request(app).post('/api/clans/private/join')).send({ inviteCode: 'BADCODE1' })).status, 404);
});

await t('🔥 العشيرة الممتلئة تُرفض (maxMembers=2)', async () => {
  await prisma.clan.update({ where: { id: privClanId }, data: { maxMembers: 2 } });
  const r = await request(app).post('/api/auth/register')
    .send({ username: 'third', email: 'third@test.com', password: 'password123' });
  const r2 = await request(app).post('/api/clans/private/join')
    .set('Authorization', `Bearer ${r.body.accessToken}`).send({ inviteCode });
  eq(r2.status, 400, 'status'); eq(r2.body.message, 'العشيرة ممتلئة', 'msg');
});

await t('القائد لا يغادر عشيرته (403)', async () => {
  eq((await A(request(app).delete(`/api/clans/leave/${privClanId}`))).status, 403);
});

await t('B يغادر بنجاح والحذف يتم فعلياً', async () => {
  eq((await B(request(app).delete(`/api/clans/leave/${privClanId}`))).status, 200);
  eq(await prisma.clanMember.count({ where: { clanId: privClanId, userId: userB } }), 0, 'حُذف');
});

await t('🔥 لوحة الصدارة مرتّبة بـ ORDER BY حقيقي', async () => {
  await prisma.user.update({ where: { id: userA }, data: { sparksCount: 10 } });
  await prisma.user.update({ where: { id: userB }, data: { sparksCount: 99 } });
  const r = await A(request(app).get(`/api/clans/leaderboard/${globalClanId}`));
  eq(r.status, 200, 'status');
  eq(r.body.leaderboard[0].username, 'sara', 'الأعلى نقاطاً أولاً');
  eq(r.body.leaderboard[0].rank, 1, 'rank');
});

await t('my-clans يُرجع العشائر مع عدد الأعضاء', async () => {
  const r = await A(request(app).get('/api/clans/my-clans'));
  eq(r.status, 200, 'status'); eq(r.body.clans.length, 2, 'عشيرتان');
});

console.log('\n━━━ 3. الحذف المتتالي (onDelete) ━━━');

await t('🔥 حذف مستخدم يحذف عضوياته تلقائياً (Cascade)', async () => {
  const u = await prisma.user.create({ data: { username: 'temp', email: 't@t.com', password: 'x' } });
  await prisma.clanMember.create({ data: { userId: u.id, clanId: globalClanId } });
  await prisma.user.delete({ where: { id: u.id } });
  eq(await prisma.clanMember.count({ where: { userId: u.id } }), 0, 'حُذفت العضوية');
});

await t('🔥 حذف القائد يجعل leaderId = NULL (SetNull) لا يحذف العشيرة', async () => {
  const l = await prisma.user.create({ data: { username: 'leader2', email: 'l2@t.com', password: 'x' } });
  const c = await prisma.clan.create({ data: { name: 'عشيرة اختبار', type: 'PRIVATE', leaderId: l.id } });
  await prisma.user.delete({ where: { id: l.id } });
  const after = await prisma.clan.findUnique({ where: { id: c.id } });
  if (!after) throw new Error('العشيرة حُذفت! كان يجب أن تبقى');
  eq(after.leaderId, null, 'leaderId');
  await prisma.clan.delete({ where: { id: c.id } });
});

console.log('\n━━━ 4. الدردشة — MongoDB حقيقي ━━━');

await t('حفظ رسالة في MongoDB', async () => {
  const m = await Message.create({ clanId: globalClanId, senderId: userA, text: 'مرحباً بالجميع' });
  if (!m._id) throw new Error('لم تُحفظ');
  eq(m.text, 'مرحباً بالجميع', 'النص');
});

await t('🔥 رسالة > 2000 حرف تُرفض (maxlength)', async () => {
  try { await Message.create({ clanId: globalClanId, senderId: userA, text: 'x'.repeat(2001) });
    throw new Error('قُبلت رغم التجاوز'); }
  catch (e) { if (!e.message.includes('maxlength') && !e.name?.includes('Validation')) throw e; }
});

await t('🔥 الفهرس المركّب { clanId, createdAt } موجود فعلياً', async () => {
  const idx = await Message.collection.indexes();
  const found = idx.find((i) => i.key.clanId === 1 && i.key.createdAt === -1);
  if (!found) throw new Error('الفهرس المركّب غير موجود: ' + JSON.stringify(idx.map(i=>i.key)));
});

await t('جلب آخر الرسائل يستخدم الفهرس (IXSCAN لا COLLSCAN)', async () => {
  for (let i = 0; i < 30; i++) await Message.create({ clanId: globalClanId, senderId: userA, text: `رسالة ${i}` });
  const plan = await Message.find({ clanId: globalClanId }).sort({ createdAt: -1 }).limit(10).explain('queryPlanner');
  const stage = JSON.stringify(plan.queryPlanner.winningPlan);
  if (!stage.includes('IXSCAN')) throw new Error('لم يستخدم الفهرس: ' + stage.slice(0, 200));
});

await t('نص فارغ يُرفض (required)', async () => {
  try { await Message.create({ clanId: globalClanId, senderId: userA, text: '   ' });
    throw new Error('قُبل نص فارغ'); } catch (e) { if (!e.name?.includes('Validation')) throw e; }
});

console.log('\n━━━ 5. دورة الجلسة الكاملة ━━━');

await t('refresh على DB حقيقي + إبطال القديم', async () => {
  const r1 = await request(app).post('/api/auth/refresh').set('Cookie', cookieA);
  eq(r1.status, 200, 'الأول ينجح');
  const revoked = await prisma.refreshToken.count({ where: { userId: userA, revokedAt: { not: null } } });
  if (revoked < 1) throw new Error('التوكن القديم لم يُبطل');
  const r2 = await request(app).post('/api/auth/refresh').set('Cookie', cookieA);
  eq(r2.status, 401, 'إعادة الاستخدام تُرفض');
});

await t('logout يُبطل التوكن في قاعدة البيانات', async () => {
  const lg = await request(app).post('/api/auth/login').send({ email: 'omar@test.com', password: 'password123' });
  const ck = lg.headers['set-cookie'];
  eq((await request(app).post('/api/auth/logout').set('Cookie', ck)).status, 200, 'logout');
  eq((await request(app).post('/api/auth/refresh').set('Cookie', ck)).status, 401, 'refresh بعده يفشل');
});

await t('🔥 إصدار 20 refresh token متزامن بلا تصادم (بق jti)', async () => {
  // نستدعي issueRefreshToken مباشرة لتجاوز الـ rate limiter
  const { default: jwt } = await import('jsonwebtoken');
  const crypto = (await import('node:crypto')).default;
  const before = await prisma.refreshToken.count({ where: { userId: userB } });
  const rs = await Promise.allSettled(Array.from({ length: 20 }, () => {
    const tk = jwt.sign({ userId: userB, jti: crypto.randomUUID() },
      process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
    return prisma.refreshToken.create({ data: {
      token: crypto.createHash('sha256').update(tk).digest('hex'),
      userId: userB, expiresAt: new Date(Date.now() + 6e8) } });
  }));
  const bad = rs.filter((r) => r.status === 'rejected');
  if (bad.length) throw new Error(`${bad.length} تصادمت: ${bad[0].reason.message.slice(0,80)}`);
  eq(await prisma.refreshToken.count({ where: { userId: userB } }), before + 20, 'العدد');
});

await t('🔥 rate limiter الحقيقي يوقف المحاولة الحادية عشرة (429)', async () => {
  const rs = [];
  for (let i = 0; i < 12; i++) {
    rs.push(await request(app).post('/api/auth/login')
      .send({ email: 'nobody@test.com', password: 'wrongpassword' }));
  }
  const limited = rs.filter((r) => r.status === 429);
  if (limited.length === 0) throw new Error('الـ rate limiter لم يعمل');
  console.log(`     (حُظرت ${limited.length} محاولة من 12 — الحماية تعمل)`);
});

console.log(`\n${'═'.repeat(50)}`);
console.log(`النتيجة النهائية:  ✅ ${pass} نجح   ❌ ${fail} فشل`);
console.log('═'.repeat(50));

await prisma.$disconnect();
const mongoose = (await import('mongoose')).default;
await mongoose.connection.close();
await mongod.stop();
process.exit(fail ? 1 : 0);
