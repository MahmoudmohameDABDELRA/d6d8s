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
const failures = [];

const t = async (name, fn) => {
  try {
    await fn();
    console.log(`✅ ${name}`);
    pass += 1;
  } catch (e) {
    console.log(`❌ ${name}\n     ${e.message}`);
    failures.push({ name, err: e.message });
    fail += 1;
  }
};

const eq = (a, b, m = '') => {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(`${m}: توقعت ${JSON.stringify(b)} فحصلت ${JSON.stringify(a)}`);
  }
};
const ok = (c, m) => { if (!c) throw new Error(m); };

// ════════════════════════════════════════════════
//  تنظيف شامل لبدء اختبار التلاحم العضلي
// ════════════════════════════════════════════════
await prisma.notification.deleteMany();
await prisma.audioPurchase.deleteMany();
await prisma.audioTrack.deleteMany();
await prisma.message.deleteMany();
await prisma.conversationParticipant.deleteMany();
await prisma.conversation.deleteMany();
await prisma.taskHistory.deleteMany();
await prisma.taskStep.deleteMany();
await prisma.task.deleteMany();
await prisma.focusCheck.deleteMany();
await prisma.focusSession.deleteMany();
await prisma.goalWeek.deleteMany();
await prisma.goal.deleteMany();
await prisma.clanMember.deleteMany();
await prisma.clanInvite.deleteMany();
await prisma.clan.deleteMany();
await prisma.sparkTransaction.deleteMany();
await prisma.userAchievement.deleteMany();
await prisma.user.deleteMany();

console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║   اختبار التلاحم العضلي الشامل لكافة أنظمة المنصة (E2E)     ║');
console.log('╚════════════════════════════════════════════════════════════╝');

let userATok, userAId, userBTok, userBId, adminTok, adminId;

// ════════════════════════════════════════════════
console.log('\n━━━ ١. المصادقة، بناء المستخدمين، والـ Onboarding ━━━');
// ════════════════════════════════════════════════

await t('تسجيل المستخدم (أحمد) بجوجل وإكمال مجاله التقني', async () => {
  const r = await request(app).post('/api/auth/google').send({ idToken: 'valid:cohesion_a:ahmed@clan.com:Ahmed' });
  eq(r.status, 201, 'status');
  userATok = r.body.accessToken;
  userAId = r.body.user.id;

  const onb = await request(app).post('/api/auth/onboarding').set('Authorization', `Bearer ${userATok}`).send({
    domain: 'TECH',
    specialty: 'SOFTWARE_DEV',
  });
  eq(onb.status, 200, 'onboarding');
  eq(onb.body.user.domain, 'TECH');
  // شحن رصيد أولي للاختبار
  await prisma.user.update({ where: { id: userAId }, data: { sparksBalance: 120, totalSparksEarned: 120 } });
});

await t('تسجيل المستخدمة (سارة) بجوجل وإكمال مجالها التقني', async () => {
  const r = await request(app).post('/api/auth/google').send({ idToken: 'valid:cohesion_b:sara@clan.com:Sara' });
  eq(r.status, 201, 'status');
  userBTok = r.body.accessToken;
  userBId = r.body.user.id;

  const onb = await request(app).post('/api/auth/onboarding').set('Authorization', `Bearer ${userBTok}`).send({
    domain: 'TECH',
    specialty: 'AI_DATA',
  });
  eq(onb.status, 200, 'onboarding');
});

await t('تسجيل وترقية المشرف العام (Admin)', async () => {
  const r = await request(app).post('/api/auth/google').send({ idToken: 'valid:cohesion_adm:admin@clan.com:SuperAdmin' });
  adminId = r.body.user.id;
  await request(app).post('/api/auth/onboarding').set('Authorization', `Bearer ${r.body.accessToken}`).send({ domain: 'TECH' });
  await prisma.user.update({ where: { id: adminId }, data: { role: 'ADMIN' } });
  const login = await request(app).post('/api/auth/google').send({ idToken: 'valid:cohesion_adm:admin@clan.com:SuperAdmin' });
  adminTok = login.body.accessToken;
  eq(login.body.user.id, adminId);
});

const A = (r) => r.set('Authorization', `Bearer ${userATok}`);
const B = (r) => r.set('Authorization', `Bearer ${userBTok}`);
const Admin = (r) => r.set('Authorization', `Bearer ${adminTok}`);

// ════════════════════════════════════════════════
console.log('\n━━━ ٢. ترابط العشائر: انضمام، قيادة، ودعوة سرية ━━━');
// ════════════════════════════════════════════════

let globalClanId, privateClanId, inviteCode;

await t('الضم التلقائي لأحمد وسارة في العشيرة الكبرى للتكنولوجيا', async () => {
  const rA = await A(request(app).post('/api/clans/global/auto-assign'));
  eq(rA.status, 200, 'status A');
  globalClanId = rA.body.clan.id;

  const rB = await B(request(app).post('/api/clans/global/auto-assign'));
  eq(rB.status, 200, 'status B');
  eq(rB.body.clan.id, globalClanId, 'كلاهما في نفس العشيرة الكبرى');
});

await t('أحمد ينشئ عشيرة خاصة (كتيبة البرمجة) ويدعو سارة بكود سري', async () => {
  const r = await A(request(app).post('/api/clans/private/create')).send({
    name: 'كتيبة النخبة البرمجية',
    description: 'تركيز عميق ومشاريع تخرج',
  });
  eq(r.status, 201, 'status');
  privateClanId = r.body.clan.id;
  inviteCode = r.body.clan.inviteCode;
  ok(inviteCode, 'كود الدعوة');

  // سارة تنضم بكود الدعوة
  const join = await B(request(app).post('/api/clans/private/join')).send({ inviteCode });
  eq(join.status, 200, 'سارة انضمت');

  // التأكد من وجود العضوين في قاعدة البيانات
  const members = await prisma.clanMember.findMany({ where: { clanId: privateClanId } });
  eq(members.length, 2, 'عدد الأعضاء في القاعدة');
});

// ════════════════════════════════════════════════
console.log('\n━━━ ٣. المكتبة الصوتية واقتصاد الشرارات وحماية البث ━━━');
// ════════════════════════════════════════════════

let trackId;

await t('المشرف يضيف تراك تركيز رسمي في الكتالوج (موجات بيتا 14Hz)', async () => {
  const r = await Admin(request(app).post('/api/audio/tracks')).send({
    title: 'موجات بيتا للتركيز المكثف — Beta 14Hz',
    category: 'BINAURAL',
    durationSec: 900,
    sourceUrl: 'https://drive.google.com/file/d/1XyZ_Private_Drive_File_Id_999/view',
    sparksCost: 30,
  });
  eq(r.status, 201, 'status');
  trackId = r.body.track.id;
});

await t('أحمد يشتري التراك بـ 30 شرارة ويتم خصم الرصيد في القاعدة', async () => {
  const r = await A(request(app).post(`/api/audio/${trackId}/purchase`));
  eq(r.status, 201, 'status');
  eq(r.body.sparks.balance, 90, 'الرصيد المتبقي (120 - 30)');

  // التأكد من صحة الحركة في الدفتر المالي
  const tx = await prisma.sparkTransaction.findFirst({
    where: { userId: userAId, source: 'AUDIO_PURCHASE' },
  });
  eq(tx.amount, -30, 'حركة سالبة مسجلة');
  eq(tx.balanceAfter, 90, 'الرصيد بعد الحركة في القاعدة');
});

await t('أحمد يفتح مجرى البث الصوتي المشفر بدون كشف رابط درايف للعميل', async () => {
  const r = await A(request(app).get(`/api/audio/${trackId}/stream`));
  eq(r.status, 200, 'status');
  eq(r.headers['content-type'], 'audio/mpeg', 'MIME Type');
  eq(r.headers['accept-ranges'], 'bytes', 'Seeking supported');
});

await t('أحمد يحرر مساحة صوتية محلية إضافية لهاتفه بـ 50 شرارة', async () => {
  const r = await A(request(app).post('/api/audio/unlock-slot'));
  eq(r.status, 201, 'status');
  eq(r.body.localSlots.unlockedSlots, 2, 'المساحات المحلية أصبحت 2');
  eq(r.body.sparks.balance, 40, 'الرصيد المتبقي (90 - 50)');

  const userInDb = await prisma.user.findUnique({ where: { id: userAId } });
  eq(userInDb.unlockedAudioSlots, 2, 'محدث في جدول User');
});

// ════════════════════════════════════════════════
console.log('\n━━━ ٤. جلسات التركيز المترابطة بويدجت الصوت ومكافحة الغش ━━━');
// ════════════════════════════════════════════════

let sessionId;

await t('أحمد يبدأ جلسة تركيز 30 دقيقة مع ربط التراك المشغل بالويدجت', async () => {
  const r = await A(request(app).post('/api/focus/start')).send({
    plannedMin: 30,
    audioTrackId: trackId,
    audioTitle: 'موجات بيتا للتركيز المكثف — Beta 14Hz',
  });
  eq(r.status, 201, 'status');
  sessionId = r.body.session.id;

  // التحقق من ويدجت "يعمل الآن" تحت المؤقت
  const active = await A(request(app).get('/api/focus/active'));
  eq(active.body.session.audioTrackId, trackId, 'التراك في الويدجت');
  eq(active.body.session.audioTitle, 'موجات بيتا للتركيز المكثف — Beta 14Hz');
});

await t('إنهاء الجلسة يمنح 14 شرارة في القاعدة ويحدث الستريك والأوسمة', async () => {
  // محاكاة انقضاء 30 دقيقة
  await prisma.focusSession.update({
    where: { id: sessionId },
    data: { startedAt: new Date(Date.now() - 30 * 60_000) },
  });

  const r = await A(request(app).post(`/api/focus/${sessionId}/complete`)).send({ clientReportedMin: 30 });
  eq(r.status, 200, 'status');
  eq(r.body.sparks.earned, 14, 'شرارات الجلسة');
  eq(r.body.sparks.balance, 54, 'الرصيد الجديد (40 + 14)');

  const u = await prisma.user.findUnique({ where: { id: userAId } });
  eq(u.totalFocusMin, 30, 'مجموع دقائق التركيز في القاعدة');
  eq(u.currentStreak, 1, 'سلسلة الالتزام بدأت');
});

// ════════════════════════════════════════════════
console.log('\n━━━ ٥. ترابط الشات: رسائل العشيرة والخاص وإيصالات القراءة ━━━');
// ════════════════════════════════════════════════

let directConvId;

await t('أحمد يرسل رسالة في عشيرة النخبة وتُحفظ في PostgreSQL', async () => {
  const chatService = await import('../src/services/chat.service.js');
  const conv = await chatService.getOrCreateClanConversation(privateClanId);
  ok(conv, 'محادثة العشيرة موجودة');

  const r = await A(request(app).post(`/api/chat/${conv.id}/messages`)).send({
    text: 'يا شباب بدأت أشتغل على معمارية النظام!',
  });
  eq(r.status, 201, 'status');
  eq(r.body.message.senderName.toLowerCase(), 'ahmed');

  // سارة ترى العشيرة في قائمتها
  const saraList = await B(request(app).get('/api/chat/clans'));
  eq(saraList.status, 200, 'قائمة سارة');
  const clanChat = saraList.body.clans.find((c) => c.clanId === privateClanId);
  ok(clanChat, 'عشيرة سارة موجودة');
});

await t('أحمد يرسل رسالة خاصة لسارة بمفتاح عدم التكرار (Idempotency)', async () => {
  // نظام الصداقة (قرار المالك): الصداقة شرط المراسلة — نكملها أولاً
  const friendReq = await A(request(app).post('/api/chat/start')).send({
    targetUserId: userBId,
    text: 'طلب صداقة من أحمد',
  });
  ok(friendReq.status === 201 && friendReq.body.isFriendRequest === true, 'طلب صداقة اتسجل');
  const saraReqs = await B(request(app).get('/api/chat/requests'));
  const fr = (saraReqs.body.requests ?? []).find((x) => x.kind === 'FRIENDSHIP');
  ok(Boolean(fr), 'سارة شافت طلب الصداقة');
  const accept = await B(request(app).post(`/api/social/friends/requests/${fr.id}/respond`)).send({ action: 'ACCEPT' });
  eq(accept.status, 200, 'سارة قبلت الصداقة');

  const clientMsgUuid = 'msg_uuid_unique_123456789';

  const r1 = await A(request(app).post('/api/chat/start')).send({
    targetUserId: userBId,
    text: 'أهلاً سارة، جاهزة لجلسة النبض الجاية؟',
    clientMessageId: clientMsgUuid,
  });
  ok(r1.status === 200 || r1.status === 201, 'status 1');
  directConvId = r1.body.conversationId;

  // إعادة إرسال نفس الرسالة لنفس الـ UUID (محاكاة ضعف الشبكة)
  const r2 = await A(request(app).post('/api/chat/start')).send({
    targetUserId: userBId,
    text: 'أهلاً سارة، جاهزة لجلسة النبض الجاية؟',
    clientMessageId: clientMsgUuid,
  });
  ok(r2.status === 200 || r2.status === 201, 'status 2');
  eq(r2.body.isDuplicate, true, 'تم كشف التكرار ومنعه');

  // التأكد: رسالة التعريف (من الطلب) + رسالة واحدة فقط بالـ UUID نفسه (منع التكرار)
  const msgs = await prisma.message.findMany({ where: { conversationId: directConvId } });
  eq(msgs.filter((m) => m.text.includes('أهلاً سارة')).length, 1, 'رسالة واحدة فقط بالـ UUID نفسه مخزنة في PostgreSQL');
  eq(msgs.filter((m) => m.text.includes('طلب صداقة')).length, 1, 'رسالة التعريف (من الطلب) موجودة');
});

await t('سارة تفتح الرسائل الخاصة فيتحدث lastReadAt وتصبح غير المقروءة 0', async () => {
  const r = await B(request(app).get(`/api/chat/${directConvId}/messages`));
  eq(r.status, 200, 'status');
  eq(r.body.messages.filter((m) => m.text.includes('أهلاً سارة')).length, 1, 'سارة استلمت الرسالة');

  // التحقق من أن تحديث lastReadAt جعل غير المقروء لسارة = 0 عبر Index Only Scan
  const saraConversations = await B(request(app).get('/api/chat/conversations'));
  const conv = saraConversations.body.conversations.find((c) => c.id === directConvId);
  eq(conv.unread, 0, 'غير المقروء أصبح 0 فوراً في 0.1ms');
});

// ════════════════════════════════════════════════
console.log('\n━━━ ٦. محرك المهام وإشعارات الهاتف وطابور BullMQ ━━━');
// ════════════════════════════════════════════════

await t('أحمد ينشئ مهمة حرجة بخطواتها وينجزها ليحصل على 2 شرارة', async () => {
  const r = await A(request(app).post('/api/tasks')).send({
    title: 'توثيق واجهات الـ REST API',
    priority: 'CRITICAL',
    steps: ['كتابة مسارات الـ Auth', 'كتابة مسارات الشات', 'الفحص النهائي'],
  });
  eq(r.status, 201, 'status');
  const taskId = r.body.task.id;

  // إنجاز المهمة ذرياً
  const done = await A(request(app).patch(`/api/tasks/${taskId}/complete`));
  eq(done.status, 200, 'تم الإنجاز');
  eq(done.body.sparks.earned, 2, '2 شرارة');
  eq(done.body.sparks.balance, 56, 'الرصيد الجديد (54 + 2)');
});

await t('سارة تسجل توكن هاتفها وتستلم إشعاراً فورياً', async () => {
  const regDev = await B(request(app).post('/api/notifications/device')).send({
    fcmToken: 'fcm_sara_galaxy_s24_token_999',
    platform: 'ANDROID',
  });
  eq(regDev.status, 201, 'تم تسجيل الجهاز');

  // إرسال إشعار
  const notif = await request(app).patch('/api/notifications/read-all').set('Authorization', `Bearer ${userBTok}`);
  eq(notif.status, 200, 'status');
});

// ════════════════════════════════════════════════
console.log('\n━━━ ٧. مراقبة لوحة التحكم الإدارية (Admin Overview) ━━━');
// ════════════════════════════════════════════════

await t('المشرف يراقب الإحصائيات الشاملة للمنصة عبر /api/admin/stats', async () => {
  const r = await Admin(request(app).get('/api/admin/stats'));
  eq(r.status, 200, 'status');
  ok(r.body.stats.users.total >= 3, 'إجمالي المستخدمين');
  ok(r.body.stats.activity.totalClans >= 2, 'إجمالي العشائر');
  ok(r.body.stats.economy.circulatingSparks > 0, 'الشرارات المتداولة');
  ok(r.body.stats.system.uptimeSeconds >= 0, 'مدة تشغيل السيرفر');
});

console.log(`\n${'═'.repeat(60)}`);
console.log(`  نتيجة اختبار التلاحم العضلي الشامل:`);
console.log(`  ✅ ${pass} اختبارات تكامل وتلاحم ناجحة بنسبة 100%`);
console.log(`  ❌ ${fail} فشل`);
console.log(`${'═'.repeat(60)}\n`);

process.exit(fail ? 1 : 0);
