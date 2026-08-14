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
await prisma.taskStep.deleteMany();
await prisma.taskHistory.deleteMany();
await prisma.task.deleteMany();
await prisma.user.deleteMany();

// تسجيل مستخدم
const reg = await request(app).post('/api/auth/google').send({ idToken: 'valid:tb_u1:tariq@clan.com:TariqBlocks' });
const token = reg.body.accessToken;
const userId = reg.body.user.id;
await request(app).post('/api/auth/onboarding').set('Authorization', `Bearer ${token}`).send({ domain: 'TECH', specialty: 'SOFTWARE_DEV' });

console.log('\n━━━ 🎵 ١. النغمات والتنبيهات المجهزة مسبقاً ━━━');
await t('GET /api/tasks/sound-themes يعرض نغمات المهام مع تنبيه الـ 5 دقائق الافتراضي', async () => {
  const res = await request(app)
    .get('/api/tasks/sound-themes')
    .set('Authorization', `Bearer ${token}`);

  eq(res.status, 200);
  eq(res.body.defaultTheme, 'ZEN_BELL', 'النغمة الافتراضية جرس زن');
  eq(res.body.defaultPreReminderMinutes, 5, 'تنبيه الـ 5 دقائق مجهز وثابت');
  ok(res.body.themes.some((s) => s.code === 'WARRIOR_CHIME'), 'رنين المحارب موجود');
});

console.log('\n━━━ 📦 ٢. إضافة بلوكات المهام المتعددة وتوزيع الأيام الذكي ━━━');
let batchResult = null;
await t('POST /api/tasks/batch-blocks ينشئ مهام متعددة عبر أيام متباينة بنقرة واحدة', async () => {
  const res = await request(app)
    .post('/api/tasks/batch-blocks')
    .set('Authorization', `Bearer ${token}`)
    .send({
      blocks: [
        {
          title: 'كرة القدم والتمرين ⚽',
          priority: 'GROWTH',
          soundTheme: 'WARRIOR_CHIME',
          reminderMinutesBefore: 5,
          scheduleSlots: [
            { date: '2026-08-10', startTime: '18:00', endTime: '20:00' },
            { date: '2026-08-11', startTime: '19:00', endTime: '21:00' },
            { date: '2026-08-12', startTime: '18:00', endTime: '20:00' },
          ],
        },
        {
          title: 'مذاكرة هياكل البيانات 🧠',
          priority: 'CRITICAL',
          soundTheme: 'ZEN_BELL',
          reminderMinutesBefore: 5,
          scheduleSlots: [
            { date: '2026-08-10', startTime: '06:00', endTime: '08:30' },
            { date: '2026-08-11', startTime: '06:00', endTime: '08:30' },
          ],
          steps: ['مراجعة Binary Trees', 'حل 3 مسائل LeetCode'],
        },
      ],
    });

  eq(res.status, 201);
  eq(res.body.createdCount, 5, 'تم إنشاء 5 مهام عبر الأيام المحددة');
  batchResult = res.body.tasks;
  ok(batchResult[0].repeatGroupId, 'معرف ربط البلوك');
  eq(batchResult[0].soundTheme, 'WARRIOR_CHIME', 'نغمة المحارب للمهمة الأولى');
  eq(batchResult[0].reminderMinutesBefore, 5, 'تنبيه 5 دقائق مسبق');
});

console.log('\n━━━ 📅 ٣. الجدول الزمني اليومي والترتيب من الصباح للمساء ━━━');
await t('GET /api/tasks/timeline-schedule يرجع جدول اليوم مرتباً زمنياً', async () => {
  const res = await request(app)
    .get('/api/tasks/timeline-schedule?startDate=2026-08-10&endDate=2026-08-12')
    .set('Authorization', `Bearer ${token}`);

  eq(res.status, 200);
  ok(res.body.days.length >= 1, 'الأيام المجدولة');
  const day1 = res.body.days.find((d) => d.date === '2026-08-10');
  ok(day1, 'يوم 10 موجود');
  eq(day1.tasks.length, 2, 'مهمتان في يوم 10');
  // الصباح (06:00) قبل المساء (18:00)
  eq(day1.tasks[0].startTime, '06:00', 'المهمة الأولى صباحاً');
  eq(day1.tasks[1].startTime, '18:00', 'المهمة الثانية مساءً');
});

console.log('\n━━━ 🛍️ ٤. المشاوير السريعة العابرة (Quick Errands) ━━━');
await t('POST /api/tasks/quick-errand ينشئ مشواراً سريعاً بنقرة واحدة', async () => {
  const res = await request(app)
    .post('/api/tasks/quick-errand')
    .set('Authorization', `Bearer ${token}`)
    .send({
      title: 'مشوار لعم محمد أجيب الأغراض 🛍️',
      date: '2026-08-10',
      startTime: '15:00',
    });

  eq(res.status, 201);
  eq(res.body.task.isQuickErrand, true, 'مشوار سريع');
  eq(res.body.task.priority, 'QUICK', 'أولوية سريعة');
});

console.log(`\n${'═'.repeat(48)}`);
console.log(`  نجح ${pass} · فشل ${fail}`);
console.log('═'.repeat(48));

process.exit(fail > 0 ? 1 : 0);
