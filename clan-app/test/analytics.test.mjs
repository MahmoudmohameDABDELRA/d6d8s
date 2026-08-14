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

// Setup test environment
await prisma.focusSession.deleteMany();
await prisma.task.deleteMany();
await prisma.dailyMoodLog.deleteMany();
await prisma.wakeLog.deleteMany();
await prisma.sparkTransaction.deleteMany();
await prisma.user.deleteMany();

// Register user 1
const reg1 = await request(app).post('/api/auth/google').send({ idToken: 'valid:ana_u1:tariq@clan.com:TariqAnalyst' });
const token1 = reg1.body.accessToken;
const user1Id = reg1.body.user.id;
await request(app).post('/api/auth/onboarding').set('Authorization', `Bearer ${token1}`).send({ domain: 'TECH', specialty: 'SOFTWARE_DEV' });

// Add seed activities for user 1
await prisma.user.update({
  where: { id: user1Id },
  data: {
    totalFocusMin: 180,
    currentStreak: 5,
    longestStreak: 12,
    sparksBalance: 350,
    totalSparksEarned: 500,
  },
});

// Seed completed focus sessions
await prisma.focusSession.createMany({
  data: [
    {
      userId: user1Id,
      status: 'COMPLETED',
      plannedMin: 60,
      serverVerifiedMin: 60,
      earnedSparks: 14,
      type: 'SOLO',
      startedAt: new Date(Date.now() - 2 * 3600 * 1000),
      endedAt: new Date(Date.now() - 1 * 3600 * 1000),
    },
    {
      userId: user1Id,
      status: 'COMPLETED',
      plannedMin: 45,
      serverVerifiedMin: 45,
      earnedSparks: 10,
      type: 'PULSE',
      startedAt: new Date(Date.now() - 24 * 3600 * 1000),
      endedAt: new Date(Date.now() - 23 * 3600 * 1000),
    },
  ],
});

// Seed tasks
await prisma.task.createMany({
  data: [
    {
      userId: user1Id,
      title: 'بناء معمارية البيانات',
      priority: 'CRITICAL',
      isCompleted: true,
      completedAt: new Date(),
    },
    {
      userId: user1Id,
      title: 'مراجعة الكود',
      priority: 'GROWTH',
      isCompleted: true,
      completedAt: new Date(Date.now() - 24 * 3600 * 1000),
    },
    {
      userId: user1Id,
      title: 'كتابة التوثيق',
      priority: 'QUICK',
      isCompleted: false,
    },
  ],
});

// Seed mood log
await prisma.dailyMoodLog.create({
  data: {
    userId: user1Id,
    date: new Date(),
    mood: 'ENERGIZED',
    note: 'جاهز للإنجاز الكبير',
  },
});

// Seed wake log
await prisma.wakeLog.create({
  data: {
    userId: user1Id,
    date: new Date(),
    scheduledTime: '05:30',
    result: 'WOKE',
    responseSec: 12,
    solvedTask: true,
  },
});

console.log('\n━━━ ١ · المصادقة والأمان ━━━');
await t('طلب الإحصائيات بدون توكن يرد 401', async () => {
  const res = await request(app).get('/api/analytics/dashboard');
  eq(res.status, 401);
});

console.log('\n━━━ ٢ · لوحة التحكم الموحدة (Master Dashboard) ━━━');
await t('GET /api/analytics/dashboard يرجع كافة مؤشرات الأداء', async () => {
  const res = await request(app)
    .get('/api/analytics/dashboard')
    .set('Authorization', `Bearer ${token1}`);

  eq(res.status, 200);
  ok(res.body.success, 'نجاح الاستجابة');
  ok(res.body.today, 'بيانات اليوم');
  ok(res.body.thisWeek, 'بيانات الأسبوع');
  ok(res.body.lifetime, 'بيانات الإجمالي');
  ok(res.body.radar, 'مصفوفة الرادار');
  ok(res.body.archetype?.title, 'النمط الإنتاجي');
  eq(res.body.lifetime.currentStreak, 5, 'الستريك الحالي');
});

console.log('\n━━━ ٣ · السلسلة الزمنية وخريطة الحرارة (Activity Timeline) ━━━');
await t('GET /api/analytics/timeline?days=7 يرجع 7 نقاط زمنية مع مستوى الكثافة', async () => {
  const res = await request(app)
    .get('/api/analytics/timeline?days=7')
    .set('Authorization', `Bearer ${token1}`);

  eq(res.status, 200);
  eq(res.body.timeline.length, 7, 'عدد الأيام');
  ok(res.body.summary.totalFocusMinutes >= 0, 'إجمالي الدقائق');
  ok(res.body.timeline[0].weekday, 'اسم اليوم');
  ok(typeof res.body.timeline[0].intensityLevel === 'number', 'مستوى الكثافة');
});

console.log('\n━━━ ٤ · مصفوفة الرادار خماسية الأبعاد (Radar Matrix) ━━━');
await t('GET /api/analytics/radar يرجع درجات المحاور الخمسة والنمط', async () => {
  const res = await request(app)
    .get('/api/analytics/radar')
    .set('Authorization', `Bearer ${token1}`);

  eq(res.status, 200);
  ok(res.body.radar.focusDepth >= 15, 'عمق التركيز');
  ok(res.body.radar.taskExecution >= 15, 'تنفيذ المهام');
  ok(res.body.radar.streakDiscipline >= 15, 'انضباط الستريك');
  ok(res.body.radar.tribeImpact >= 15, 'أثر العشيرة');
  ok(res.body.radar.mindfulness >= 15, 'الوعي والصفاء');
  ok(res.body.overallScore > 0, 'الدرجة الإجمالية');
});

console.log('\n━━━ ٥ · ساعات الذروة والنمط البيولوجي (Peak Hours) ━━━');
await t('GET /api/analytics/peak-hours يرجع النافذة الذهبية والـ 24 ساعة', async () => {
  const res = await request(app)
    .get('/api/analytics/peak-hours')
    .set('Authorization', `Bearer ${token1}`);

  eq(res.status, 200);
  eq(res.body.hourlyDistribution.length, 24, '24 ساعة');
  ok(res.body.goldenWindow.from, 'بداية النافذة الذهبية');
  ok(res.body.goldenWindow.to, 'نهاية النافذة الذهبية');
  ok(res.body.chronotype, 'النمط البيولوجي');
});

console.log('\n━━━ ٦ · مقارنة النمو والتقدم (Growth Delta) ━━━');
await t('GET /api/analytics/growth يرجع الفروقات الأسبوعية بدقة', async () => {
  const res = await request(app)
    .get('/api/analytics/growth')
    .set('Authorization', `Bearer ${token1}`);

  eq(res.status, 200);
  ok(res.body.comparison.focusMinutes, 'مقارنة دقائق التركيز');
  ok(res.body.comparison.tasksCompleted, 'مقارنة المهام');
  ok(res.body.summaryMessage, 'رسالة التقييم الذكية');
});

console.log('\n━━━ ٧ · انضباط النوم والاستيقاظ (Circadian Discipline) ━━━');
await t('GET /api/analytics/circadian يرجع نسبة الاستيقاظ وسرعة الاستجابة', async () => {
  const res = await request(app)
    .get('/api/analytics/circadian')
    .set('Authorization', `Bearer ${token1}`);

  eq(res.status, 200);
  eq(res.body.stats.successfulWakesCount, 1, 'عدد مرات الاستيقاظ الناجحة');
  eq(res.body.stats.averageResponseSeconds, 12, 'متوسط زمن إطفاء المنبه');
  ok(res.body.stats.onTimeWakeRate >= 0, 'نسبة الاستيقاظ في الموعد');
});

console.log('\n━━━ ٨ · ارتباط المزاج بالإنتاجية (Mood vs Focus Correlation) ━━━');
await t('GET /api/analytics/mood-correlation يرجع تحليل الأداء بحسب المزاج', async () => {
  const res = await request(app)
    .get('/api/analytics/mood-correlation')
    .set('Authorization', `Bearer ${token1}`);

  eq(res.status, 200);
  ok(res.body.correlation.ENERGIZED, 'بيانات المزاج المتحمس');
  ok(res.body.insight, 'خلاصة الارتباط النفسي');
});

console.log('\n━━━ ٩ · الترتيب والنسبة المئوية في المجال (Percentile) ━━━');
await t('GET /api/analytics/ranking يرجع الترتيب في مسار TECH', async () => {
  const res = await request(app)
    .get('/api/analytics/ranking')
    .set('Authorization', `Bearer ${token1}`);

  eq(res.status, 200);
  eq(res.body.domain, 'TECH', 'المجال');
  ok(res.body.percentileBadge, 'شارة التميز المئوية');
  ok(res.body.domainRank >= 1, 'الترتيب في المجال');
});

console.log(`\n${'═'.repeat(48)}`);
console.log(`  نجح ${pass} · فشل ${fail}`);
console.log('═'.repeat(48));

process.exit(fail > 0 ? 1 : 0);
