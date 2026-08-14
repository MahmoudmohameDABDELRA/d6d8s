/**
 * ═══════════════════════════════════════════════════════════
 *  اختبار تكامل حي — دورة حياة الجبل الكاملة (النسخة المعتمدة)
 *
 *  الحلم → أهداف → موافقة → رحلة (AI حقيقي) → موافقة →
 *  مهمة اليوم تتولد → إتمام → اليوم يكتمل → كل الأيام →
 *  المرحلة تكتمل → (آخر مرحلة) القمة 🏁
 *
 *  يركض ضد سيرفر حقيقي (node src/server.js) وقاعدة حقيقية
 *  وGemini حقيقي. لا بيانات وهمية إطلاقاً.
 *
 *  التشغيل:  node test/mountain-lifecycle.test.mjs
 * ═══════════════════════════════════════════════════════════
 */
const BASE = 'http://localhost:3000/api';
let pass = 0, fail = 0;
const ok = (cond, name) => {
  if (cond) { pass++; console.log('  ✅', name); }
  else { fail++; console.log('  ❌', name); }
};

const prisma = (await import('../src/config/prisma.js')).default;
const jwt = (await import('jsonwebtoken')).default;
const env = (await import('../src/config/env.js')).default;

// ── إعداد: مستخدم حقيقي ──
await prisma.user.deleteMany({ where: { email: 'mountain_flow@bal.app' } });
const u = await prisma.user.create({
  data: { username: 'متسلق', email: 'mountain_flow@bal.app', password: 'x', domain: 'TECH', specialty: 'SOFTWARE_DEV', onboarded: true },
});
const token = jwt.sign({ userId: u.id }, env.jwt.accessSecret, { expiresIn: '1h' });
const H = (t) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

console.log('\n━━━ 1) إنشاء الحلم → كويز AI حقيقي ━━━');
let dream, steps = [];
{
  const r = await fetch(`${BASE}/goals/dream`, { method: 'POST', headers: H(token), body: JSON.stringify({ title: 'عاوز أتعلم Flutter' }) });
  const j = await r.json();
  if (r.status === 201) {
    ok(Array.isArray(j.questions) && j.questions.length >= 3, `كويز حقيقي (${j.questions.length} أسئلة)`);
    dream = j;
  } else {
    ok(false, `إنشاء الحلم فشل: ${r.status} — هل Gemini متاح؟ (${j.message ?? ''})`);
    process.exit(fail ? 1 : 0);
  }
}

console.log('\n━━━ 2) الإجابات → خطة الأهداف (AI حقيقي) ━━━');
{
  const answers = (dream.questions ?? []).map((q) => ({ question: q.question, answer: q.options[0] }));
  const r = await fetch(`${BASE}/goals/dream/${dream.draftGoalId}/answers`, { method: 'POST', headers: H(token), body: JSON.stringify({ answers }) });
  const j = await r.json();
  if (r.ok && j.plan?.steps?.length >= 2) {
    steps = j.plan.steps;
    ok(true, `AI خطط ${steps.length} أهداف`);
    steps.forEach((s, i) => console.log(`      [${i}] ${s.title}${i === steps.length - 1 ? '  ← القمة 🏁' : ''}`));
  } else {
    ok(false, `توليد الأهداف فشل: ${r.status}`);
    process.exit(fail ? 1 : 0);
  }
}

console.log('\n━━━ 3) موافقة المستخدم → الهدف نشط ━━━');
let goalId;
{
  const r = await fetch(`${BASE}/goals/dream/${dream.draftGoalId}/approve`, { method: 'POST', headers: H(token) });
  const j = await r.json();
  ok(r.status === 200 && j.goal?.id, 'الموافقة → 200 + goal.id');
  goalId = j.goal.id;
  const g = await prisma.goal.findUnique({ where: { id: goalId } });
  ok(g && g.draft === false && g.isActive === true, 'القاعدة: draft=false + isActive=true');
}

console.log('\n━━━ 4) توليد رحلة أول هدف (AI حقيقي) ━━━');
let journey, journeyDays = [];
{
  const stepId = steps[0].id;
  const r = await fetch(`${BASE}/goals/steps/${stepId}/journey`, { method: 'POST', headers: H(token) });
  const j = await r.json();
  if (r.status === 201 && Array.isArray(j.days) && j.days.length >= 2) {
    journey = j.journey;
    journeyDays = j.days;
    ok(true, `AI بنى رحلة «${steps[0].title}»: ${j.days.length} يوم`);
    j.days.slice(0, 3).forEach((d) => console.log(`      اليوم ${d.dayNumber}: ${d.title}`));
    const inDb = await prisma.journey.findUnique({ where: { id: journey.id }, include: { days: true } });
    ok(inDb && inDb.days.length === j.days.length, 'القاعدة: Journey + أيامها اتخزنت');
    ok(inDb.status === 'DRAFT', 'الحالة DRAFT (قبل الموافقة)');
  } else {
    ok(false, `توليد الرحلة فشل: ${r.status} (${j.message ?? ''})`);
    process.exit(fail ? 1 : 0);
  }
}

console.log('\n━━━ 5) موافقة الرحلة → ACTIVE + مهمة اليوم الأول اتولدت ━━━');
let firstTask;
{
  const stepId = steps[0].id;
  const r = await fetch(`${BASE}/goals/steps/${stepId}/journey/approve`, { method: 'POST', headers: H(token) });
  const j = await r.json();
  ok(r.status === 200 && j.journey.status === 'ACTIVE', 'الرحلة ACTIVE + approvedAt');
  ok(j.generatedTasks >= 1, `مهمة اليوم 1 اتولدت (${j.generatedTasks})`);
  const db = await prisma.journey.findUnique({ where: { id: journey.id }, include: { days: { where: { status: 'PENDING' }, orderBy: { dayNumber: 'asc' } } } });
  const firstPending = db.days[0];
  firstTask = await prisma.task.findUnique({ where: { journeyDayId: firstPending.id } });
  ok(firstTask && firstTask.source === 'JOURNEY', 'القاعدة: Task مولدة بـ source=JOURNEY + journeyDayId');
  ok(firstTask.title === firstPending.title, 'عنوان المهمة = عنوان اليوم');
}

console.log('\n━━━ 6) إتمام مهمة اليوم → سلسلة التقدم ━━━');
{
  const r = await fetch(`${BASE}/tasks/${firstTask.id}/complete`, { method: 'PATCH', headers: H(token) });
  const j = await r.json();
  ok(r.status === 200 && j.success, 'إتمام المهمة → 200');
  const dayDb = await prisma.journeyDay.findUnique({ where: { id: firstTask.journeyDayId } });
  ok(dayDb.status === 'COMPLETED' && dayDb.completedAt, 'اليوم COMPLETED في القاعدة');
  const jDb = await prisma.journey.findUnique({ where: { id: journey.id }, include: { days: { orderBy: { dayNumber: 'asc' } } } });
  const nextPending = jDb.days.find((d) => d.status === 'PENDING');
  ok(jDb.currentDay === nextPending.dayNumber, `currentDay تقدم لليوم ${nextPending.dayNumber}`);
  // ═══ بوابة منتصف الليل المحلي: يوم 2 معاده بكرة → مفيش توليد قبل معاده ═══
  const t2 = await prisma.task.findUnique({ where: { journeyDayId: nextPending.id } });
  ok(!t2, 'مهمة اليوم 2 لسه متولدتش — معادها بكرة (منتصف ليل المستخدم)');
  const { generateTodayTasks } = await import('../src/services/journeyScheduler.service.js');
  const res2 = await generateTodayTasks({ journeyId: journey.id });
  ok(res2.deferred >= 1 && res2.created === 0, `الـ Scheduler أرجأ اليوم 2 (deferred=${res2.deferred}) — مش بيتولد بدري`);
}

console.log('\n━━━ 7) تخطي الأيام (المستخدم يكمل كل الأيام يدوياً عبر المهام) ━━━');
{
  // نكمل كل الأيام المتبقية: لكل يوم نقدّم معاده لليوم (محاكاة مرور الأيام/منتصف الليل) ثم نولّد مهمته ثم نكملها
  let remaining = await prisma.journeyDay.findMany({ where: { journeyId: journey.id, status: 'PENDING' }, orderBy: { dayNumber: 'asc' } });
  const { generateTodayTasks } = await import('../src/services/journeyScheduler.service.js');
  for (const day of remaining) {
    // محاكاة منتصف الليل: معاد اليوم يبقى النهارده → الجوب يولّد مهمته
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    await prisma.journeyDay.update({ where: { id: day.id }, data: { scheduledDate: today } });
    await generateTodayTasks({ journeyId: journey.id });
    const t = await prisma.task.findUnique({ where: { journeyDayId: day.id } });
    if (!t) { ok(false, `مهمة اليوم ${day.dayNumber} مش اتولدت`); break; }
    const r = await fetch(`${BASE}/tasks/${t.id}/complete`, { method: 'PATCH', headers: H(token) });
    if (!r.ok) { ok(false, `إتمام يوم ${day.dayNumber} فشل`); break; }
  }
  const jDb = await prisma.journey.findUnique({ where: { id: journey.id }, include: { days: true } });
  const allDaysDone = jDb.days.every((d) => d.status === 'COMPLETED');
  ok(allDaysDone, 'كل الأيام COMPLETED');
  const stepDb = await prisma.goalStep.findUnique({ where: { id: steps[0].id } });
  ok(stepDb.isCompleted && stepDb.completedAt, 'المرحلة (الهدف 1) اكتملت في القاعدة');
}

console.log('\n━━━ 8) القمة: إكمال كل المراحل المتبقية → الهدف كله يكتمل ━━━');
{
  // باقي المراحل (من غير رحلات) — نكملها مباشرة بالترتيب (نفس مسار الجبل القديم)
  const remainingSteps = await prisma.goalStep.findMany({
    where: { goalId, isCompleted: false, id: { not: steps[0].id } },
    orderBy: { order: 'asc' },
  });
  for (const s of remainingSteps) {
    const r = await fetch(`${BASE}/goals/dream/${goalId}/steps/${s.id}/complete`, { method: 'POST', headers: H(token) });
    if (!r.ok) { ok(false, `إتمام مرحلة ${s.title} فشل: ${r.status}`); break; }
  }
  const goalDb = await prisma.goal.findUnique({ where: { id: goalId } });
  ok(goalDb.completedAt !== null, 'القمة: Goal.completedAt اتسجل 🏁');
  ok(goalDb.isActive === false, 'الهدف اتقفل (isActive=false)');
}

console.log('\n━━━ 9) أمان: مستخدم تاني مش شايف رحلة غيرو ━━━');
{
  const u2 = await prisma.user.create({ data: { username: 'مستخدم_تاني', email: 'mountain_flow2@bal.app', password: 'x', domain: 'TECH', specialty: 'SOFTWARE_DEV', onboarded: true } });
  const t2 = jwt.sign({ userId: u2.id }, env.jwt.accessSecret, { expiresIn: '1h' });
  const r = await fetch(`${BASE}/goals/steps/${steps[0].id}/journey`, { headers: H(t2) });
  ok(r.status === 404, 'مستخدم تاني → 404');
  await prisma.user.delete({ where: { id: u2.id } });
}

console.log('\n━━━ 10) إعادة التوليد idempotent (لا مهام مكررة) ━━━');
{
  const { generateTodayTasks } = await import('../src/services/journeyScheduler.service.js');
  await generateTodayTasks({});
  // كل الأيام مكتملة → مفيش PENDING → مفيش مهام جديدة تتولد
  const tasksCount = await prisma.task.count({ where: { userId: u.id, source: 'JOURNEY' } });
  const daysCount = await prisma.journeyDay.count({ where: { journeyId: journey.id } });
  ok(tasksCount === daysCount, `مفيش تكرار (المهام المولدة = ${tasksCount} = الأيام ${daysCount})`);
}

console.log('\n━━━ 11) منتصف الليل المحلي — منطقتان زمنيتان مختلفتان ━━━');
{
  const { generateTodayTasks } = await import('../src/services/journeyScheduler.service.js');
  const { localDate } = await import('../src/services/streak.service.js');

  // مستخدمان: A في UTC+14 (أول من يصل الغد) · B في UTC-11 (آخر من يصل)
  const tzA = 'Pacific/Kiritimati';
  const tzB = 'Pacific/Pago_Pago';
  const mkTzUser = async (email, username, timezone) => {
    const u2 = await prisma.user.create({ data: { username, email, password: 'x', domain: 'TECH', specialty: 'SOFTWARE_DEV', onboarded: true, timezone } });
    const g = await prisma.goal.create({ data: { userId: u2.id, title: 'هدف توقيت', isActive: true } });
    const s = await prisma.goalStep.create({ data: { goalId: g.id, title: 'خطوة توقيت', order: 0 } });
    const j = await prisma.journey.create({ data: { goalStepId: s.id, title: 'رحلة توقيت', status: 'ACTIVE' } });
    return { u2, j };
  };
  const A = await mkTzUser('tz_a@bal.app', 'tz_a', tzA);
  const B = await mkTzUser('tz_b@bal.app', 'tz_b', tzB);

  const todayA = localDate(tzA); // تاريخ A المحلي
  const todayB = localDate(tzB); // تاريخ B المحلي
  const diffDays = Math.round((todayA - todayB) / 86_400_000);
  ok(diffDays >= 1, `في نفس اللحظة: A (UTC+14) متقدم بيوم على B (UTC-11) — فرق ${diffDays} يوم`);

  // يوم عند A معاده = يومه المحلي → يتولد
  await prisma.journeyDay.create({ data: { journeyId: A.j.id, dayNumber: 1, title: 'يوم A', scheduledDate: todayA } });
  // يوم عند B معاده = يومه المحلي → يتولد
  await prisma.journeyDay.create({ data: { journeyId: B.j.id, dayNumber: 1, title: 'يوم B', scheduledDate: todayB } });
  // يوم عند B معاده = يوم A (بكرة محلياً عند B) → لا يتولد (deferred)
  await prisma.journeyDay.create({ data: { journeyId: B.j.id, dayNumber: 2, title: 'يوم B بكرة', scheduledDate: todayA } });

  const r = await generateTodayTasks({});
  const tA = await prisma.task.findFirst({ where: { userId: A.u2.id, journeyDayId: { not: null } } });
  const tB1 = await prisma.task.findFirst({ where: { userId: B.u2.id, journeyDayId: { not: null }, title: 'يوم B' } });
  const tB2 = await prisma.task.findFirst({ where: { userId: B.u2.id, journeyDayId: { not: null }, title: 'يوم B بكرة' } });
  ok(tA && tB1, 'كل مستخدم أخد مهمة "النهارده" بتوقيته المحلي');
  ok(!tB2, 'يوم "بكرة" المحلي لـ B لسه متولدش — ينتظر منتصف ليله');

  await prisma.user.deleteMany({ where: { email: { in: ['tz_a@bal.app', 'tz_b@bal.app'] } } });
}

console.log('\n━━━ 12) اطمئنان ما بعد المهمة (Follow-up Coach) ━━━');
{
  // مهمة يدوية جديدة نكملها → جدولة اطمئنان → تنفيذ فوري للدالة (نفس اللي الـ Worker بيناديها)
  const manualTask = await prisma.task.create({
    data: { userId: u.id, title: 'مهمة يدوية للاطمئنان', source: 'MANUAL' },
  });
  const { scheduleTaskCheckIn, executeCheckIn } = await import('../src/services/taskCheckIn.service.js');
  await scheduleTaskCheckIn(manualTask.id);
  const checkinQueued = await prisma.notification.count({ where: { userId: u.id, type: 'TASK_CHECKIN' } });
  ok(checkinQueued === 0, 'الاطمئنان جدول (بعد 10 دقايق — لسه مفيش إشعار)');

  // أكمل المهمة ثم نفّذ الاطمئنان مباشرة (بدل انتظار 10 دقايق)
  await prisma.task.update({ where: { id: manualTask.id }, data: { isCompleted: true, completedAt: new Date() } });
  const res = await executeCheckIn(manualTask.id);
  ok(res?.source === 'AI' || res?.source === 'SYSTEM', `الاطمئنان اتنفذ (المصدر: ${res?.source ?? '?'})`);
  const notif = await prisma.notification.findFirst({ where: { userId: u.id, type: 'TASK_CHECKIN' }, orderBy: { createdAt: 'desc' } });
  ok(notif && notif.body?.length > 0, 'إشعار الاطمئنان اتخزن في القاعدة برسالة');
  console.log(`      💬 الرسالة: ${notif?.body?.slice(0, 90)}…`);

  // منع التكرار: تنفيذ تاني لنفس المهمة → skipped
  const again = await executeCheckIn(manualTask.id);
  ok(again?.skipped === 'ALREADY_CHECKED', 'تنفيذ تاني → skipped (منع تكرار الرسائل)');
}

// ── تنظيف ──
await prisma.user.deleteMany({ where: { email: { in: ['mountain_flow@bal.app', 'mountain_flow2@bal.app'] } } });

console.log(`\n════════════════════════════════════════════`);
console.log(`النتيجة: ✅ ${pass} نجح · ❌ ${fail} فشل`);
console.log('════════════════════════════════════════════');
process.exit(fail ? 1 : 0);
