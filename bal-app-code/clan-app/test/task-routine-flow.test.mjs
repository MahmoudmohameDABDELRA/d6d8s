/**
 * ═══════════════════════════════════════════════════════════
 *  اختبار تكامل حي — القسم 7: المهام (رؤية «بال»)
 *
 *  يركض ضد سيرفر حقيقي + قاعدة حقيقية + Redis حقيقي.
 *  يشمل: روتين يومي (نسخة الغد) · المكتملة تختفي · نكشة AI قبل المهمة.
 *
 *  التشغيل:  node test/task-routine-flow.test.mjs
 * ═══════════════════════════════════════════════════════════
 */
const BASE = 'http://localhost:3000/api';
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✅', n); } else { fail++; console.log('  ❌', n); } };

const prisma = (await import('../src/config/prisma.js')).default;
const jwt = (await import('jsonwebtoken')).default;
const env = (await import('../src/config/env.js')).default;
const { Worker } = await import('bullmq');
const { createConnection, QUEUE_NAMES, getQueue } = await import('../src/queues/index.js');

// ── إعداد مستخدم ──
await prisma.user.deleteMany({ where: { email: 'task_flow@bal.app' } });
await prisma.task.deleteMany({ where: { userId: (await prisma.user.findFirst({ select: { id: true } }))?.id ?? '' } });
const user = await prisma.user.create({
  data: { username: 'task_user', email: 'task_flow@bal.app', password: 'x', domain: 'TECH', interests: ['TECH'], onboarded: true, companionName: 'ليكم' },
});
const token = jwt.sign({ userId: user.id }, env.jwt.accessSecret, { expiresIn: '1h' });
const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

const todayStr = new Date().toISOString().slice(0, 10);

console.log('\n━━━ 1) بلوكات بروتين يومي ━━━');
let groupId, routineTaskId;
{
  const r = await fetch(`${BASE}/tasks/batch-blocks`, {
    method: 'POST', headers: H,
    body: JSON.stringify({
      blocks: [{
        title: 'الفطار الصحي',
        startTime: '08:00',
        endTime: '08:30',
        routineType: 'DAILY',
        soundTheme: 'ZEN_BELL',
        scheduleSlots: [{ date: todayStr, startTime: '08:00', endTime: '08:30' }],
      }],
    }),
  });
  const j = await r.json();
  ok(r.status === 200 || r.status === 201, 'إنشاء بلوك روتين → نجاح');
  const t = j.tasks?.[0];
  ok(t && t.routineType === 'DAILY', 'القاعدة: routineType = DAILY');
  groupId = t?.repeatGroupId;
  routineTaskId = t?.id;
  ok(Boolean(groupId), 'repeatGroupId موجود (لربط النسخ)');
}

console.log('\n━━━ 2) مهمة مفردة بروتين ━━━');
{
  const r = await fetch(`${BASE}/tasks`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ title: 'قراءة 20 دقيقة', routineType: 'DAILY', dueDate: new Date(Date.now() + 86400000).toISOString() }),
  });
  const j = await r.json();
  ok(r.status === 201 && j.task.routineType === 'DAILY', 'مهمة مفردة روتين → 201 + DAILY');
}

console.log('\n━━━ 3) المكتملة تختفي من القائمة الافتراضية ━━━');
{
  // ننشئ مهمة عادية ونكملها
  const c = await (await fetch(`${BASE}/tasks`, { method: 'POST', headers: H, body: JSON.stringify({ title: 'مهمة تتكمل' }) })).json();
  const done = await (await fetch(`${BASE}/tasks/${c.task.id}/complete`, { method: 'PATCH', headers: H, body: '{}' })).json();
  ok(done.success === true, 'المهمة اكتملت');

  const list = await (await fetch(`${BASE}/tasks`, { headers: H })).json();
  const titles = (list.tasks ?? list).map((t) => t.title);
  ok(!titles.includes('مهمة تتكمل'), 'الافتراضي: المكتملة مش ظاهرة');
  ok(titles.includes('الفطار الصحي') || titles.includes('قراءة 20 دقيقة'), 'المعلّقة ظاهرة');

  const hist = await (await fetch(`${BASE}/tasks?filter=completed`, { headers: H })).json();
  const histTitles = (hist.tasks ?? hist).map((t) => t.title);
  ok(histTitles.includes('مهمة تتكمل'), 'التاريخ: filter=completed بيرجعها');
}

console.log('\n━━━ 4) إتمام روتين يومي → نسخة الغد تلقائياً ━━━');
{
  const done = await (await fetch(`${BASE}/tasks/${routineTaskId}/complete`, { method: 'PATCH', headers: H, body: '{}' })).json();
  ok(done.success === true, 'إتمام مهمة الروتين → نجاح');

  const tomorrow = new Date(new Date(`${todayStr}T00:00:00.000Z`).getTime() + 86400000).toISOString().slice(0, 10);
  const next = await prisma.task.findFirst({
    where: { repeatGroupId: groupId, slotDate: new Date(`${tomorrow}T00:00:00.000Z`) },
  });
  ok(Boolean(next), 'القاعدة: نسخة الغد اتنشأت تلقائياً');
  ok(next.title === 'الفطار الصحي' && next.startTime === '08:00' && next.routineType === 'DAILY', 'نسخة الغد بنفس الاسم والوقت والروتين');
  ok(done.nextRoutine?.id === next.id, 'الرد بيأكد النسخة الجديدة');

  // إتمام نسخة الغد تاني → ممنوع التكرار (نسخة بعد غد واحدة بس)
  const done2 = await (await fetch(`${BASE}/tasks/${next.id}/complete`, { method: 'PATCH', headers: H, body: '{}' })).json();
  const dayAfter = new Date(new Date(`${tomorrow}T00:00:00.000Z`).getTime() + 86400000).toISOString().slice(0, 10);
  const dayAfterCount = await prisma.task.count({
    where: { repeatGroupId: groupId, slotDate: new Date(`${dayAfter}T00:00:00.000Z`) },
  });
  ok(done2.success === true && dayAfterCount === 1, 'التسلسل اليومي مستمر بدون تكرار');
}

console.log('\n━━━ 5) نكشة الـ AI قبل المهمة (عبر الطابور الحقيقي) ━━━');
{
  // مهمة مستقبلية + جدولة نكشة مباشرة بتأخير صغير (بدل 5 دقايق)
  const task = await prisma.task.create({
    data: {
      userId: user.id,
      title: 'مراجعة الفيزياء',
      priority: 'CRITICAL',
      hasPreReminder: true,
      reminderMinutesBefore: 5,
      scheduledStart: new Date(Date.now() + 3600000),
      routineType: null,
    },
  });

  // إضافة المهمة للطابور بتأخير 500ms (محاكاة وصول موعد النكشة)
  await getQueue(QUEUE_NAMES.TASK_NUDGE).add('nudge', { taskId: task.id }, { delay: 500, removeOnComplete: true });

  // تشغيل عامل حقيقي يعالج المهمة
  const worker = new Worker(QUEUE_NAMES.TASK_NUDGE, async (job) => {
    const nudge = await import('../src/services/taskNudge.service.js');
    return nudge.executeNudge(job.data.taskId);
  }, { connection: createConnection(), concurrency: 1 });

  // انتظار وصول الإشعار للقاعدة (مهلة 30 ثانية)
  let notification = null;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 500));
    notification = await prisma.notification.findFirst({
      where: { userId: user.id, type: 'TASK_REMINDER', data: { path: ['taskId'], equals: task.id } },
      orderBy: { createdAt: 'desc' },
    });
    if (notification) break;
  }

  ok(Boolean(notification), 'القاعدة: إشعار TASK_REMINDER اتخزن');
  if (notification) {
    ok(notification.body.length > 5, `فيه نص نكشة: "${notification.body.slice(0, 70)}..."`);
    const src = notification.data?.['source'];
    ok(src === 'AI' || src === 'SYSTEM', `المصدر صريح (${src}): AI حقيقي أو تذكير نظام — لا وهمي`);
  }

  await worker.close();
}

// ── تنظيف ──
await prisma.task.deleteMany({ where: { userId: user.id } });
await prisma.user.deleteMany({ where: { email: 'task_flow@bal.app' } });
console.log(`\n${'═'.repeat(44)}\nالنتيجة: ✅ ${pass} نجح · ❌ ${fail} فشل\n${'═'.repeat(44)}`);
await prisma.$disconnect();
process.exit(fail ? 1 : 0);
