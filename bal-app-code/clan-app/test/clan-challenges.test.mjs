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
const alarmService = await import('../src/services/alarm.service.js');

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
await prisma.wakeChallengeParticipant.deleteMany();
await prisma.wakeChallenge.deleteMany();
await prisma.battleAlarm.deleteMany();
await prisma.clanMember.deleteMany();
await prisma.clan.deleteMany();
await prisma.user.deleteMany();

// المستخدم 1 (القائد - محمد)
const regUser1 = await request(app).post('/api/auth/google').send({ idToken: 'valid:chal_u1:mohamed@clan.com:Mohamed' });
const user1Tok = regUser1.body.accessToken;
const user1Id = regUser1.body.user.id;
await request(app).post('/api/auth/onboarding').set('Authorization', `Bearer ${user1Tok}`).send({ domain: 'TECH', specialty: 'SOFTWARE_DEV' });
await prisma.user.update({ where: { id: user1Id }, data: { sparksBalance: 50 } });

// المستخدم 2 (العضو - أحمد)
const regUser2 = await request(app).post('/api/auth/google').send({ idToken: 'valid:chal_u2:ahmed@clan.com:Ahmed' });
const user2Tok = regUser2.body.accessToken;
const user2Id = regUser2.body.user.id;
await request(app).post('/api/auth/onboarding').set('Authorization', `Bearer ${user2Tok}`).send({ domain: 'TECH', specialty: 'AI_DATA' });

const A = (r) => r.set('Authorization', `Bearer ${user1Tok}`);
const B = (r) => r.set('Authorization', `Bearer ${user2Tok}`);

console.log('\n━━━ ⚔️ إعداد العشيرة الخاصة ━━━');

let clanId;
const clanRes = await A(request(app).post('/api/clans/private/create')).send({
  name: 'عشيرة النخبة المتفوقة',
  description: 'تحديات الفجر والتركيز',
});
clanId = clanRes.body.clan.id;
const inviteCode = clanRes.body.clan.inviteCode;

// أحمد ينضم للعشيرة
await B(request(app).post('/api/clans/private/join')).send({ inviteCode });

console.log('\n━━━ 🌅 تحدي الاستيقاظ الجماعي المخصص والجدولة التلقائية ━━━');

let wakeChallengeId;

await t('القائد محمد ينشئ تحدي استيقاظ مخصص الساعة 05:30 فجراً', async () => {
  const r = await A(request(app).post('/api/alarms/challenges')).send({
    clanId,
    challengeType: 'COORDINATED_WAKE',
    title: 'تحدي استيقاظ الفجر 05:30',
    targetTime: '05:30',
    durationDays: 7,
  });
  eq(r.status, 201, 'status');
  eq(r.body.challenge.targetTime, '05:30', 'وقت الاستيقاظ المخصص');
  wakeChallengeId = r.body.challenge.id;

  // التحقق من ضبط منبه محمد تلقائياً
  const alarmM = await prisma.battleAlarm.findFirst({ where: { userId: user1Id, time: '05:30' } });
  ok(alarmM, 'منبه محمد مضبوط تلقائياً على 05:30');
});

await t('أحمد يقبل التحدي فيُجدول منبه هاتفه تلقائياً على 05:30 فوراً', async () => {
  const r = await B(request(app).post(`/api/alarms/challenges/${wakeChallengeId}/join`));
  eq(r.status, 200, 'status');
  ok(r.body.scheduledAlarm, 'تم إرجاع كائن المنبه لجدولته في نظام الهاتف');
  eq(r.body.scheduledAlarm.time, '05:30', 'وقت المنبه 05:30');

  // التأكد في قاعدة البيانات
  const alarmA = await prisma.battleAlarm.findFirst({ where: { userId: user2Id, time: '05:30' } });
  ok(alarmA, 'تم إنشاء BattleAlarm لأحمد في القاعدة');
  eq(alarmA.isActive, true, 'المنبه مفعّل');
});

console.log('\n━━━ ⚡ تحدي ماراثون التركيز (5 ساعات) ولوحة النتائج (Scoreboard) ━━━');

let marathonId;

await t('القائد ينشئ تحدي ماراثون تركيز 5 ساعات (300 دقيقة) خلال 24 ساعة', async () => {
  // إلغاء التحدي السابق لإنشاء الماراثون
  await prisma.wakeChallenge.update({ where: { id: wakeChallengeId }, data: { status: 'CANCELLED' } });

  const r = await A(request(app).post('/api/alarms/challenges')).send({
    clanId,
    challengeType: 'FOCUS_MARATHON',
    title: 'ماراثون التركيز العميق ٥ ساعات',
    targetHours: 5,
    durationHours: 24,
    rewardSparks: 100,
  });
  eq(r.status, 201, 'status');
  eq(r.body.challenge.targetMinutes, 300, '300 دقيقة = 5 ساعات');
  marathonId = r.body.challenge.id;

  // أحمد ينضم للماراثون
  await B(request(app).post(`/api/alarms/challenges/${marathonId}/join`));
});

await t('تسجيل تقدم التركيز تلقائياً للمشاركين في الماراثون', async () => {
  // محمد أنجز 360 دقيقة (6 ساعات)
  await alarmService.recordMarathonProgress(user1Id, 360);
  // أحمد أنجز 300 دقيقة (5 ساعات)
  await alarmService.recordMarathonProgress(user2Id, 300);

  const p1 = await prisma.wakeChallengeParticipant.findUnique({ where: { challengeId_userId: { challengeId: marathonId, userId: user1Id } } });
  eq(p1.progressMinutes, 360, 'محمد 360 دقيقة');
  eq(p1.isCompleted, true, 'محمد أكمل الهدف');

  const p2 = await prisma.wakeChallengeParticipant.findUnique({ where: { challengeId_userId: { challengeId: marathonId, userId: user2Id } } });
  eq(p2.progressMinutes, 300, 'أحمد 300 دقيقة');
  eq(p2.isCompleted, true, 'أحمد أكمل الهدف');
});

await t('GET /api/alarms/challenges/:id/scoreboard يرجع ترتيب المتنافسين ونسب الإنجاز', async () => {
  const r = await A(request(app).get(`/api/alarms/challenges/${marathonId}/scoreboard`));
  eq(r.status, 200, 'status');
  eq(r.body.totalParticipants, 2, 'مشاركان');
  eq(r.body.winnersCount, 2, 'فائزان');

  // المركز الأول لمحمد (6 ساعات)
  const rank1 = r.body.scoreboard[0];
  eq(rank1.username.toLowerCase(), 'mohamed', 'المركز الأول');
  eq(rank1.progress, 360, '360 دقيقة');
  eq(rank1.isGoalReached, true, 'حقق الهدف');

  // المركز الثاني لأحمد (5 ساعات)
  const rank2 = r.body.scoreboard[1];
  eq(rank2.username.toLowerCase(), 'ahmed', 'المركز الثاني');
  eq(rank2.progress, 300, '300 دقيقة');
});

console.log('\n━━━ 🧭 موجه حالة الدخول والترتيب النفسي (App Entry State) ━━━');

await t('المستخدم بعد غياب 5 أيام يستلم إجراء HERO_COMEBACK كأولوية قصوى (P1)', async () => {
  // تزوير تاريخ آخر نشاط لمحمد قبل 5 أيام (بداية يوم — محايد زمنياً)
  const { localDate } = await import('../src/services/streak.service.js');
  const todayStart = localDate('Africa/Cairo');
  const fiveDaysAgo = new Date(todayStart.getTime() - 5 * 86_400_000);
  await prisma.user.update({ where: { id: user1Id }, data: { lastActiveDate: fiveDaysAgo } });

  const r = await A(request(app).get('/api/human/app-entry-state'));
  eq(r.status, 200, 'status');
  eq(r.body.action, 'HERO_COMEBACK', 'أولوية استقبال البطل');
  eq(r.body.priority, 1, 'P1');
  eq(r.body.gapDays, 5, '5 أيام غياب');
});

await t('المستخدم بعد غياب يوم أمس فقط يستلم إجراء YESTERDAY_VENT (P2)', async () => {
  const { localDate } = await import('../src/services/streak.service.js');
  const todayStart = localDate('Africa/Cairo');
  const oneDayAgo = new Date(todayStart.getTime() - 1 * 86_400_000);
  await prisma.user.update({ where: { id: user2Id }, data: { lastActiveDate: oneDayAgo } });

  const r = await B(request(app).get('/api/human/app-entry-state'));
  eq(r.status, 200, 'status');
  eq(r.body.action, 'YESTERDAY_VENT', 'حرق عتب الأمس');
  eq(r.body.priority, 2, 'P2');
});

console.log(`\n${'═'.repeat(50)}\nالنتيجة: ✅ ${pass} نجح   ❌ ${fail} فشل\n${'═'.repeat(50)}`);
process.exit(fail ? 1 : 0);
