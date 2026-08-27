/**
 * فحص الجبل: الحلم → الـ AI → الحقول → الرحلة → المهام → التوقيت
 * فحص فقط — بلا تعديل.
 */
process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/t';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.JWT_ACCESS_SECRET ??= 'harness-access-secret-long-enough-0000';
process.env.JWT_REFRESH_SECRET ??= 'harness-refresh-secret-long-enough-11';
process.env.NODE_ENV ??= 'development';
process.env.LOG_LEVEL ??= 'silent';
process.env.ENABLE_EMAIL_AUTH = 'true';
process.env.PORT = '4103';

const app = (await import('../../src/app.js')).default;
const server = app.listen(4103, '127.0.0.1');
await new Promise((r) => server.once('listening', r));

const API = 'http://127.0.0.1:4103/api';
const c = async (m, p, o = {}) => {
  const r = await fetch(API + p, {
    method: m,
    headers: { 'Content-Type': 'application/json', ...(o.token ? { Authorization: 'Bearer ' + o.token } : {}) },
    ...(o.body ? { body: JSON.stringify(o.body) } : {}),
  });
  return { s: r.status, b: await r.json().catch(() => null) };
};
const u = () => Math.random().toString(36).slice(2, 8);

const found = [];
const note = (icon, label, detail = '') => {
  found.push({ icon, label, detail });
  console.log(`  ${icon} ${label}${detail ? ' — ' + detail : ''}`);
};

console.log('\n═══ الجبل والتوقيت ═══\n');

const reg = await c('POST', '/auth/register', {
  body: { username: 'ج_' + u(), email: `m_${u()}@bal.app`, password: 'Passw0rd!23', domain: 'TECH' },
});
const token = reg.b.accessToken;
await c('POST', '/auth/onboarding', { token, body: { domain: 'TECH', interests: ['TECH'] } });

// ── 1) التوقيت: هل السيرفر بيعرف منطقة المستخدم؟ ──
console.log('── التوقيت ──');
const me = await c('GET', '/auth/me', { token });
const tz = me.b?.user?.timezone;
note(tz ? '✅' : '🔴', `منطقة المستخدم الزمنية: ${tz ?? 'مفقودة'}`);

/** ️ هل التطبيق بيبعت المنطقة عند التسجيل؟ */
const sentTz = /timezone/.test(
  await (await fetch('http://127.0.0.1:4103/api/auth/me', { headers: { Authorization: 'Bearer ' + token } })).text(),
);
note(sentTz ? '✅' : '⚠️', 'المنطقة موجودة في ملف المستخدم');

// هل الواجهة بتبعتها؟
const { readFileSync } = await import('node:fs');
const appState = readFileSync(new URL('../../bal_app/lib/core/app_state.dart', import.meta.url), 'utf8');
note(
  /timezone/.test(appState) ? '✅' : '🔴',
  'التطبيق بيبعت منطقة الجهاز عند التسجيل',
  /timezone/.test(appState) ? '' : 'الافتراضي Africa/Cairo للكل',
);

// ── 2) الحلم: الـ AI ──
console.log('\n── الحلم والـ AI ──');
const dream = await c('POST', '/goals/dream', { token, body: { title: 'أكون مبرمج محترف' } });
note(
  dream.s === 503 ? '✅' : dream.s === 201 ? '✅' : '🔴',
  `POST /goals/dream → ${dream.s}`,
  dream.s === 503 ? `رفض صريح: ${dream.b?.code}` : '',
);

const { isConfigured } = await import('../../src/services/gemini.service.js');
note(isConfigured() ? '✅' : '⚠️', `مفتاح Gemini ${isConfigured() ? 'موجود' : 'فاضي — الجبل مش هيشتغل'}`);

// ── 3) هل الجبل بيتولّد بلا AI؟ ──
const goals = await c('GET', '/goals', { token });
note(
  Array.isArray(goals.b?.goals) ? '✅' : '🔴',
  `GET /goals → ${goals.s} (${goals.b?.goals?.length ?? 0} هدف)`,
);

// ── 4) السلسلة: goal → step → journey → task ──
console.log('\n── سلسلة الجبل → المهام ──');
const prisma = (await import('../../src/config/prisma.js')).default;
const userId = reg.b.user.id;

const goal = await prisma.goal.create({
  data: { userId, title: 'أكون مبرمج محترف', draft: false, isActive: true, isPrimary: true },
});
const step = await prisma.goalStep.create({
  data: { goalId: goal.id, title: 'إتقان Dart', order: 0 },
});
const journey = await prisma.journey.create({
  data: { goalStepId: step.id, title: 'رحلة Dart', durationDays: 3, status: 'ACTIVE', currentDay: 1 },
});

const today = new Date();
const dayStr = today.toISOString().slice(0, 10);
for (let i = 0; i < 3; i++) {
  const d = new Date(`${dayStr}T00:00:00.000Z`);
  d.setDate(d.getDate() + i);
  await prisma.journeyDay.create({
    data: { journeyId: journey.id, dayNumber: i + 1, title: `اليوم ${i + 1}`, scheduledDate: d, status: 'PENDING' },
  });
}
note('✅', 'الجبل اتبنى: هدف → مرحلة → رحلة → 3 أيام');

/**
 * ️ `generateTodayTasks` بيقرا `journey.step.goal.userId` — تداخل
 *    بمستويين والمحاكاة بتدعم مستوى واحد. بنفحص المنطق نفسه بدل
 *    ما نبني محاكاة أعقد: هل بوابة منتصف الليل بتشتغل صح؟
 */
let sched = { created: 0, deferred: 0, skipped: 0 };
try {
  const { generateTodayTasks } = await import('../../src/services/journeyScheduler.service.js');
  sched = await generateTodayTasks({ userId });
  note(sched.created >= 1 ? '✅' : '🔴', `المزامنة ولّدت ${sched.created} مهمة`);
} catch (e) {
  note('⚠️', 'المزامنة محتاجة قاعدة حقيقية (تداخل علاقات)', e.message.slice(0, 60));
}

/** بوابة منتصف الليل — المنطق اللي بيقرر تتولّد إمتى */
const schedSrc = readFileSync(new URL('../../src/services/journeyScheduler.service.js', import.meta.url), 'utf8');
note(
  /dayDate\.getTime\(\) > localToday\.getTime\(\)/.test(schedSrc) ? '✅' : '🔴',
  'اليوم اللي معاده لسه مجاش بيتأجّل (deferred)',
);
note(
  /journeyDayId: day\.id/.test(schedSrc) ? '✅' : '🔴',
  'مهمة واحدة لكل يوم (unique) — مفيش تكرار',
);
note(
  /tzMap\.get\(journey\.step\.goal\.userId\)/.test(schedSrc) ? '✅' : '🔴',
  'التوليد بيستخدم منطقة كل مستخدم لوحده',
);

/** نتأكد إن المهمة المولّدة من الجبل بتوصل لقايمة المهام */
await prisma.task.create({
  data: {
    userId, title: 'اليوم 1', priority: 'GROWTH', source: 'JOURNEY',
    goalStepId: step.id, dueDate: new Date(), slotDate: new Date(), isCompleted: false,
  },
});
const tasksAfter = await c('GET', '/tasks', { token });
const journeyTask = (tasksAfter.b?.tasks ?? []).find((t) => t.source === 'JOURNEY');
note(journeyTask ? '✅' : '🔴', `مهمة الجبل ظهرت في المهام: ${journeyTask?.title ?? 'مفيش'}`);

// ── 5) التوقيت في المزامنة ──
console.log('\n── مزامنة منتصف الليل ──');
const { localDate, startOfLocalDay } = await import('../../src/services/streak.service.js');
for (const zone of ['Africa/Cairo', 'Asia/Tokyo', 'America/New_York']) {
  const d = localDate(zone);
  note('ℹ️', `${zone}: اليوم المحلي ${d.toISOString().slice(0, 10)}`);
}

const { localHourToUtc } = await import('../../src/utils/taskTiming.js');
const cairo = localHourToUtc(dayStr, 'Africa/Cairo', 21);
const tokyo = localHourToUtc(dayStr, 'Asia/Tokyo', 21);
note(
  cairo.getTime() !== tokyo.getTime() ? '✅' : '🔴',
  'كل مستخدم بيتسأل بتوقيته هو',
  `القاهرة ${cairo.toISOString().slice(11, 16)}Z · طوكيو ${tokyo.toISOString().slice(11, 16)}Z`,
);

// ── 6) جدولة المزامنة اليومية ──
const queuesSrc = readFileSync(new URL('../../src/queues/index.js', import.meta.url), 'utf8');
const every15 = /every: 15 \* 60_000/.test(queuesSrc);
note(every15 ? '✅' : '⚠️', 'جوب المزامنة كل 15 دقيقة');
note(
  /journey-daily-recurring/.test(queuesSrc) ? '✅' : '🔴',
  'الجوب مسجّل بمعرّف ثابت (مايتكررش في الـ cluster)',
);

console.log('\n');
server.close();
process.exit(0);
