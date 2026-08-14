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
await prisma.userReport.deleteMany();
await prisma.blockedUser.deleteMany();
await prisma.message.deleteMany();
await prisma.conversationParticipant.deleteMany();
await prisma.conversation.deleteMany();
await prisma.user.deleteMany();

// مستخدم 1 (المعتدي - عمر)
const regA = await request(app).post('/api/auth/google').send({ idToken: 'valid:rpt_a:omar@clan.com:OmarAbuser' });
const tokenA = regA.body.accessToken;
const userAId = regA.body.user.id;
await request(app).post('/api/auth/onboarding').set('Authorization', `Bearer ${tokenA}`).send({ domain: 'TECH', specialty: 'SOFTWARE_DEV' });

// مستخدم 2 (الضحية - سارة)
const regB = await request(app).post('/api/auth/google').send({ idToken: 'valid:rpt_b:sara@clan.com:SaraVictim' });
const tokenB = regB.body.accessToken;
const userBId = regB.body.user.id;
await request(app).post('/api/auth/onboarding').set('Authorization', `Bearer ${tokenB}`).send({ domain: 'TECH', specialty: 'SOFTWARE_DEV' });

// المشرف
const regAdmin = await request(app).post('/api/auth/google').send({ idToken: 'valid:rpt_adm:admin@clan.com:SuperAdmin' });
const tokenAdmin = regAdmin.body.accessToken;
const adminId = regAdmin.body.user.id;
await request(app).post('/api/auth/onboarding').set('Authorization', `Bearer ${tokenAdmin}`).send({ domain: 'TECH', specialty: 'CYBERSECURITY' });
await prisma.user.update({ where: { id: adminId }, data: { role: 'ADMIN' } });

// إنشاء محادثة مباشرة
const conv = await prisma.conversation.create({
  data: {
    type: 'DIRECT',
  },
});

await prisma.conversationParticipant.createMany({
  data: [
    { conversationId: conv.id, userId: userAId },
    { conversationId: conv.id, userId: userBId },
  ],
});

console.log('\n━━━ 💬 ١. إرسال رسالة مسيئة ━━━');
let messageId = null;
await t('عمر يرسل رسالة مسيئة لسارة في المحادثة', async () => {
  const msg = await prisma.message.create({
    data: {
      conversationId: conv.id,
      senderId: userAId,
      senderName: 'OmarAbuser',
      text: 'أنت فاشل ولن تنجز أي شيء في حياتك!',
    },
  });
  messageId = msg.id;
  ok(messageId, 'معرف الرسالة');
});

console.log('\n━━━ 🚨 ٢. الإبلاغ على الرسالة والحظر الفوري (Report & Block) ━━━');
let reportId = null;
await t('سارة تبلغ عن الرسالة المحددة مع الحظر الفوري بنقرة واحدة', async () => {
  const res = await request(app)
    .post(`/api/chat/messages/${messageId}/report-and-block`)
    .set('Authorization', `Bearer ${tokenB}`)
    .send({
      reason: 'HARASSMENT',
      details: 'شتائم ومضايقة شخصية غير مبررة',
    });

  eq(res.status, 201);
  eq(res.body.isBlocked, true, 'تم الحظر فوراً');
  ok(res.body.contentSnapshot.includes('أنت فاشل'), 'تم توثيق نص الرسالة في اللقطة');
  reportId = res.body.reportId;
  ok(reportId, 'معرف البلاغ');
});

await t('عمر ممنوع الآن من إرسال أي رسائل جديدة لسارة (403 BLOCKED)', async () => {
  const res = await request(app)
    .post(`/api/chat/${conv.id}/messages`)
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ text: 'رسالة أخرى بعد الحظر' });

  ok([403, 400].includes(res.status), 'ممنوع من الإرسال بعد الحظر');
});

console.log('\n━━━ 🗑️ ٣. محاولة الجاني حذف الرسالة ━━━');
await t('عمر يحذف رسالته المسيئة من المحادثة', async () => {
  await prisma.message.update({
    where: { id: messageId },
    data: { isDeleted: true },
  });
});

console.log('\n━━━ ⚖️ ٤. مراجعة الإدارة وحفظ لقطة الإدانة (Content Snapshot) ━━━');
await t('المشرف يرى نص الرسالة المحذوفة كاملاً ومحفوظاً كدليل قاطع في البلاغ', async () => {
  const res = await request(app)
    .get('/api/admin/reports')
    .set('Authorization', `Bearer ${tokenAdmin}`);

  eq(res.status, 200);
  const rep = res.body.reports.find((r) => r.id === reportId);
  ok(rep, 'البلاغ موجود في لوحة الإدارة');
  eq(rep.targetType, 'CHAT_MESSAGE', 'نوع الهدف رسالة شات');
  eq(rep.messageId, messageId, 'معرف الرسالة المبلّغ عنها');
  ok(rep.contentSnapshot.includes('أنت فاشل ولن تنجز أي شيء'), 'دليل الإدانة سليم ومحفوظ رغم حذف الرسالة!');
});

await t('المشرف يبت في البلاغ ويحظر المعتدي عمر نهائياً (One-Click Ban)', async () => {
  const res = await request(app)
    .patch(`/api/admin/reports/${reportId}/resolve`)
    .set('Authorization', `Bearer ${tokenAdmin}`)
    .send({
      action: 'RESOLVED',
      actionNote: 'ثبوت الإساءة والشتائم — حظر نهائي للحساب',
      banUser: true,
    });

  eq(res.status, 200);

  const checkOmar = await prisma.user.findUnique({ where: { id: userAId } });
  eq(checkOmar.isBanned, true, 'تم حظر حساب المعتدي بنجاح');
});

console.log(`\n${'═'.repeat(48)}`);
console.log(`  نجح ${pass} · فشل ${fail}`);
console.log('═'.repeat(48));

process.exit(fail > 0 ? 1 : 0);
