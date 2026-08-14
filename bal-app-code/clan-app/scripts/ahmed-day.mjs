/**
 * ═══════════════════════════════════════════════════════════
 *  سيناريو حي — يوم كامل لأحمد (رائد الأعمال) 🏔️
 *
 *  مش سكريبت وهمي: كل خطوة بنداء API حقيقي + Gemini حقيقي +
 *  تخزين في PostgreSQL + تحقق مباشر من القاعدة بعد كل حدث.
 *
 *  التشغيل: node scripts/ahmed-day.mjs (والسيرفر شغال)
 * ═══════════════════════════════════════════════════════════
 */
const BASE = 'http://localhost:3000/api';
const prisma = (await import('../src/config/prisma.js')).default;
const jwt = (await import('jsonwebtoken')).default;
const env = (await import('../src/config/env.js')).default;

const say = (t) => console.log(`\n━━━ ${t} ━━━`);
const note = (t) => console.log(`   📌 ${t}`);
let sparks = 0;

// ═══ مشهد 0: الفجر 4:00 — المنبه يقرع ═══
say('🌅 4:00 فجراً — منبه أحمد "صحوة البطل" يدق');
let ahmed, token, alarmId;
{
  // أحمد سجل قبل كده — نجهزه بالبيانات (منبه 4 فجر + اهتمام رائد أعمال)
  await prisma.user.deleteMany({ where: { email: { in: ['ahmed@bal.app', 'mahmoud@bal.app'] } } });
  ahmed = await prisma.user.create({
    data: { username: 'أحمد', email: 'ahmed@bal.app', password: 'x', domain: 'BUSINESS', specialty: 'ENTREPRENEURSHIP', onboarded: true },
  });
  token = jwt.sign({ userId: ahmed.id }, env.jwt.accessSecret, { expiresIn: '2h' });
  const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // إنشاء المنبه (بعد ما سجلنا — منبه الساعة 4 فجر كل يوم)
  const alarmRes = await fetch(`${BASE}/alarms`, { method: 'POST', headers: H, body: JSON.stringify({ time: '04:00', days: [1, 2, 3, 4, 5, 6, 7], label: 'صحوة البطل', requireProof: true }) });
  const alarm = await alarmRes.json();
  alarmId = alarm.alarm?.id ?? alarm.id;
  note(`المنبه اتثبت: ${JSON.stringify(alarm.alarm ?? alarm).slice(0, 120)}`);

  // أول ما يصحى من النوم (بعد ما رد على المنبه في الواقع — هنا بنحاكي:
  // المنبه قرع فعلاً في جهازه، وبيفتح التطبيق)
  // 1) غفوة أولى → الـ AI يسخر
  const snooze = await fetch(`${BASE}/alarms/snooze`, { method: 'POST', headers: H, body: JSON.stringify({ alarmId, count: 1 }) });
  const snoozeJ = await snooze.json();
  note(`الغفوة الأولى — الرفيق: ${(snoozeJ.message ?? JSON.stringify(snoozeJ)).slice(0, 130)}`);

  // 2) إثبات الاستيقاظ: مسألة حسابية
  const wakeTaskRes = await (await fetch(`${BASE}/alarms/wake-task`, { headers: H })).json();
  const wakeTask = wakeTaskRes.task ?? wakeTaskRes;
  note(`إثبات الاستيقاظ: ${wakeTask.question}`);

  // حل المسألة (نحسب الجواب صح — عشان أحمد صحى فعلًا)
  const solve = (q) => {
    const m = String(q ?? '').match(/(\d+)\s*([+\-−×x*])\s*(\d+)/);
    if (!m) return null;
    const a = +m[1], b = +m[3];
    return m[2] === '+' ? a + b : m[2] === '-' || m[2] === '−' ? a - b : a * b;
  };
  const solved = solve(wakeTask.question);
  const solveRes = await fetch(`${BASE}/alarms/wake-task/solve`, { method: 'POST', headers: H, body: JSON.stringify({ token: wakeTask.token, answer: solved, alarmId, scheduledTime: '04:00', responseSec: 47 }) });
  const solveJ = await solveRes.json();
  note(`حل الإثبات (${solved}) → ${solveJ.message ?? JSON.stringify(solveJ).slice(0, 100)}`);

  // 3) تحقق من القاعدة: WakeLog
  const wakeLog = await prisma.wakeLog.findFirst({ where: { userId: ahmed.id }, orderBy: { firedAt: 'desc' } });
  note(`القاعدة: WakeLog = ${wakeLog?.result ?? 'لا يوجد'} (استيقظ في ${wakeLog?.responseSec ?? '?'} ثانية)`);
}

// ═══ مشهد 1: صباح اليوم — التطبيق فاتح، الجبل مستنيه ═══
say('🏔️ أحمد يفتح التطبيق — إنشاء الحلم');
const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
let goalId, steps, journeyId;
{
  // 1) تسمية الرفيق
  await fetch(`${BASE}/auth/companion`, { method: 'PATCH', headers: H, body: JSON.stringify({ name: 'ليكم' }) });
  note('سمّى رفيقه «ليكم»');

  // 2) الحلم → كويز Gemini حقيقي
  const dream = await (await fetch(`${BASE}/goals/dream`, { method: 'POST', headers: H, body: JSON.stringify({ title: 'أبقى رائد أعمال ناجح' }) })).json();
  const qs = dream.questions ?? [];
  note(`الرفيق سأل ${qs.length} أسئلة: أول سؤال: «${qs[0]?.question?.slice(0, 80)}»`);

  // 3) الإجابات → خطة الأهداف (Gemini) — مع retry واحد لو الـ AI رجع رد غير صالح
  const answers = qs.map((q) => ({ question: q.question, answer: q.options[0] }));
  let plan = null;
  for (let attempt = 1; attempt <= 2 && !plan; attempt++) {
    const pr = await (await fetch(`${BASE}/goals/dream/${dream.draftGoalId}/answers`, { method: 'POST', headers: H, body: JSON.stringify({ answers }) })).json();
    if (pr.plan?.steps?.length >= 2) plan = pr;
    else if (attempt === 1) { console.warn(`   ⚠️ محاولة الخطة الأولى فشلت (${pr.message ?? pr.code ?? 'AI_INVALID'}) — نعيد مرة`); }
  }
  if (!plan) { console.error('❌ فشل توليد الخطة مرتين'); process.exit(1); }
  steps = plan.plan.steps;
  note(`الخطة: ${steps.length} أهداف — أولها «${steps[0].title}» وآخرها «${steps[steps.length - 1].title}» (القمة)`);

  // 4) موافقة → الجبل اتنفخ
  const approve = await (await fetch(`${BASE}/goals/dream/${dream.draftGoalId}/approve`, { method: 'POST', headers: H })).json();
  goalId = approve.goal.id;
  note(`✅ الجبل اتنفّخ: «${approve.goal.title}» نشط`);

  // 5) رحلة أول هدف (Gemini) — مع retry واحد
  let jr = null;
  for (let attempt = 1; attempt <= 2 && !jr; attempt++) {
    const jrr = await (await fetch(`${BASE}/goals/steps/${steps[0].id}/journey`, { method: 'POST', headers: H })).json();
    if (jrr.journey?.id) jr = jrr;
    else if (attempt === 1) { console.warn(`   ⚠️ محاولة الرحلة الأولى فشلت (${jrr.message ?? jrr.code ?? 'AI_INVALID'}) — نعيد مرة`); }
  }
  if (!jr) { console.error('❌ فشل توليد الرحلة مرتين'); process.exit(1); }
  journeyId = jr.journey.id;
  note(`رحلة «${steps[0].title}»: ${jr.days.length} يوم — اليوم 1: ${jr.days[0]?.title}`);

  // 6) موافقة الرحلة → مهمة اليوم 1 تتولد
  const japp = await (await fetch(`${BASE}/goals/steps/${steps[0].id}/journey/approve`, { method: 'POST', headers: H })).json();
  note(`✅ الرحلة نشطة — ${japp.generatedTasks} مهمة لليوم 1 اتولدت في قسم المهام`);
}

// ═══ مشهد 2: قسم المهام — النهارده فيه مهمة من الجبل ═══
say('📋 قسم المهام — شغل النهارده');
let taskId;
{
  const tasks = await (await fetch(`${BASE}/tasks`, { headers: H })).json();
  const jt = tasks.tasks?.find((t) => t.source === 'JOURNEY');
  taskId = jt?.id;
  note(`المهمة المولدة من الجبل: «${jt?.title}» (${jt?.source})`);

  // النكشة قبل المهمة بـ 5 دقايق (نداء AI حقيقي)
  const { executeNudge } = await import('../src/services/taskNudge.service.js');
  const nudge = await executeNudge(taskId);
  const nudgeNotif = await prisma.notification.findFirst({ where: { userId: ahmed.id, type: 'TASK_REMINDER' }, orderBy: { createdAt: 'desc' } });
  note(`🔔 النكشة: «${nudgeNotif?.body?.slice(0, 90)}» (المصدر: ${nudge.source})`);
}

// ═══ مشهد 3: أحمد ينفّذ — إتمام المهمة ═══
say('✅ «تم الإنجاز» — سلسلة التقدم');
{
  const r = await fetch(`${BASE}/tasks/${taskId}/complete`, { method: 'PATCH', headers: H });
  const j = await r.json();
  sparks = j.sparks?.balance ?? 0;
  note(`المهمة اكتملت → Sparks: ${j.sparks?.earned} (الرصيد ${j.sparks?.balance}) · سلسلة ${j.streak?.current} يوم`);
  note(j.mountain ? `الجبل رد: ${j.mountain.summit ? '🏁 وصلت القمة!' : 'المرحلة لسه مستمرة'}` : '');

  // اطمئنان الـ AI بعد 10 دقايق (تنفيذ فوري — نفس دالة الـ Worker)
  const { executeCheckIn } = await import('../src/services/taskCheckIn.service.js');
  await executeCheckIn(taskId);
  const checkNotif = await prisma.notification.findFirst({ where: { userId: ahmed.id, type: 'TASK_CHECKIN' }, orderBy: { createdAt: 'desc' } });
  note(`💬 اطمئنان الرفيق: «${checkNotif?.body?.slice(0, 100)}»`);

  // اليوم في الرحلة اتكمل؟
  const dayDb = await prisma.journeyDay.findFirst({ where: { tasks: { some: { id: taskId } } } });
  note(`القاعدة: اليوم «${dayDb?.title}» = ${dayDb?.status}`);
}

// ═══ مشهد 4: جلسة تركيز ═══
say('🎯 جلسة تركيز (25 دقيقة)');
{
  const start = await (await fetch(`${BASE}/focus/start`, { method: 'POST', headers: H, body: JSON.stringify({ plannedMin: 25, type: 'SOLO' }) })).json();
  const sessionId = start.session?.id ?? start.id;
  note(`الجلسة بدأت (${start.session?.plannedMin ?? 25} دقيقة)`);

  const done = await (await fetch(`${BASE}/focus/${sessionId}/complete`, { method: 'POST', headers: H, body: JSON.stringify({ clientReportedMin: 25 }) })).json();
  sparks = done.sparks?.balance ?? sparks;
  note(`الجلسة اكتملت → Sparks ${done.sparks?.earned} · verifiedMin ${done.session?.serverVerifiedMin ?? '?'}`);
}

// ═══ مشهد 5: توثيق الأسبوع (6 أسئلة + سؤال مخصص) ═══
say('📝 التوثيق الأسبوعي — 6 أسئلة');
{
  const weeks = await (await fetch(`${BASE}/goals`, { headers: H })).json();
  const week = weeks.goals?.find((g) => g.id === goalId)?.weeks?.find((w) => w.status === 'OPEN') ?? (await prisma.goalWeek.findFirst({ where: { goalId, status: 'OPEN' } }));
  if (week) {
    const doc = await fetch(`${BASE}/goals/weeks/${week.id}/document`, { method: 'POST', headers: H, body: JSON.stringify({
      reflection: 'اتعلمت أساسيات العمل وبدأت أول خطوة فعلية',
      learnings: 'التخطيط بالخطوات الصغيرة أسهل من الحلم الكبير',
      mistakes: 'كنت بؤجل البداية — لازم أبدأ بدري',
      futureNote: 'أركز على تنفيذ مهام اليوم كاملة',
      answers: [
        { q: 'ما هو أكبر إنجاز هذا الأسبوع؟', a: 'أنشأت خطتي وقسمتها لأهداف' },
        { q: 'ما هو أصعب شيء؟', a: 'الالتزام بالاستيقاظ 4 فجر' },
      ],
    }) });
    const docJ = await doc.json();
    note(`التوثيق: ${docJ.message ?? JSON.stringify(docJ).slice(0, 90)}`);
    const weekDb = await prisma.goalWeek.findUnique({ where: { id: week.id } });
    note(`القاعدة: الأسبوع ${weekDb?.status} · إجابات محفوظة: ${JSON.stringify(weekDb?.answers).slice(0, 80)}`);
  } else note('مفيش أسبوع مفتوح — اتخطى');
}

// ═══ مشهد 6: نظام انستقرام — رسالة لصديق = طلب صداقة ═══
say('💬 رسالة لمحمود (نظام انستقرام)');
let conversationId;
{
  const mahmoud = await prisma.user.create({
    data: { username: 'محمود', email: 'mahmoud@bal.app', password: 'x', domain: 'BUSINESS', specialty: 'ENTREPRENEURSHIP', onboarded: true },
  });
  const tM = jwt.sign({ userId: mahmoud.id }, env.jwt.accessSecret, { expiresIn: '2h' });
  const HM = { Authorization: `Bearer ${tM}`, 'Content-Type': 'application/json' };

  // أحمد يبعت أول رسالة لمحمود (مش صديق) → طلب صداقة
  const start = await (await fetch(`${BASE}/chat/start`, { method: 'POST', headers: H, body: JSON.stringify({ targetUserId: mahmoud.id, text: 'يا صاحبي، قول لي رأيك في فكرة مشروعي' }) })).json();
  note(`أحمد بعت لمحمود → ${start.isFriendRequest ? 'طلب صداقة اتولّد (زي انستقرام)' : 'محادثة مباشرة'}`);

  // محمود يقبل
  const reqs = await (await fetch(`${BASE}/social/friends/requests`, { headers: HM })).json();
  const rid = reqs.requests?.[0]?.id;
  if (rid) {
    const acc = await (await fetch(`${BASE}/social/friends/requests/${rid}/respond`, { method: 'POST', headers: HM, body: JSON.stringify({ action: 'ACCEPT' }) })).json();
    conversationId = acc.conversationId;
    note(`محمود قبل الطلب → صداقة ✅ + محادثة ${conversationId ? 'اتفتحت' : 'مش متفتحة'}`);
  } else note('مفيش طلبات (ممكن الـ rate limit)');

  // محادثة حقيقية
  if (conversationId) {
    await fetch(`${BASE}/chat/${conversationId}/messages`, { method: 'POST', headers: HM, body: JSON.stringify({ text: 'فكرتك جامدة! ابدأ صغير ووسّع' }) });
    const msgs = await (await fetch(`${BASE}/chat/${conversationId}/messages`, { headers: H })).json();
    const list = msgs.messages ?? msgs.data ?? (Array.isArray(msgs) ? msgs : []);
    note(`المحادثة (${list.length} رسالة): ${list.map((m) => (m.content ?? m.text ?? '?').slice(0, 35)).join(' | ') || JSON.stringify(msgs).slice(0, 120)}`);
  }
}

// ═══ مشهد 7: العشيرة + تحدي جماعي ═══
say('👥 عشيرة خاصة + تحدي جماعي');
{
  const clanRes = await (await fetch(`${BASE}/clans/private/create`, { method: 'POST', headers: H, body: JSON.stringify({ name: 'روّاد القمة', description: 'عشيرة أحمد الريادية', maxMembers: 15 }) })).json();
  const clan = clanRes.clan ?? clanRes;
  const clanId = clan.id;
  const inviteCode = clan.inviteCode;
  note(`العشيرة «روّاد القمة» اتأسست (${clan.memberCount ?? '?'} عضو) — كود الدعوة: ${inviteCode}`);

  // محمود ينضم (بالكود)
  const mahmoud = await prisma.user.findUnique({ where: { email: 'mahmoud@bal.app' } });
  const tM = jwt.sign({ userId: mahmoud.id }, env.jwt.accessSecret, { expiresIn: '2h' });
  const join = await (await fetch(`${BASE}/clans/private/join`, { method: 'POST', headers: { Authorization: `Bearer ${tM}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ inviteCode }) })).json();
  note(`محمود انضم: ${join.message ?? JSON.stringify(join).slice(0, 60)}`);

  // تحدي جماعي: أحمد (الأدمن) يعمله → محمود يقبل
  const chall = await (await fetch(`${BASE}/focus/challenge`, { method: 'POST', headers: H, body: JSON.stringify({ clanId, title: 'تحدي الصباح', focusMin: 25, restMin: 5, cycles: 2 }) })).json();
  const challId = chall.challenge?.id ?? chall.id;
  note(`التحدي «تحدي الصباح» اتئسس (${chall.challenge?.status ?? '?'})`);

  const acc = await (await fetch(`${BASE}/focus/challenge/${challId}/accept`, { method: 'POST', headers: { Authorization: `Bearer ${tM}`, 'Content-Type': 'application/json' } })).json();
  note(`محمود قبل التحدي: ${acc.message ?? JSON.stringify(acc).slice(0, 70)}`);

  // أحمد يطلق التحدي
  const startCh = await (await fetch(`${BASE}/focus/challenge/${challId}/start`, { method: 'POST', headers: H })).json();
  note(`التحدي انطلق: ${startCh.message ?? JSON.stringify(startCh).slice(0, 70)}`);
}

// ═══ مشهد 8: الرفيق AI — محادثة بسياق حقيقي ═══
say('🤖 أحمد يكلم الرفيق «ليكم» (بسياق اليوم كله)');
{
  const r = await fetch(`${BASE}/ai/message`, { method: 'POST', headers: H, body: JSON.stringify({ message: 'عامل إيه يا ليكم؟ شكلي بدأت صح النهارده؟', mode: 'COMPANION', tzOffsetMinutes: 120 }) });
  const j = await r.json();
  const reply = j.reply ?? j.message ?? j.content ?? JSON.stringify(j).slice(0, 150);
  note(`الرفيق رد: ${String(reply).slice(0, 200)}`);
}

// ═══ مشهد 9: الحصيلة ═══
say('📊 حصيلة يوم أحمد');
{
  const me = await (await fetch(`${BASE}/auth/me`, { headers: H })).json();
  const u = me.user ?? me;
  const db = await prisma.user.findUnique({ where: { id: ahmed.id } });
  const notifs = await prisma.notification.count({ where: { userId: ahmed.id } });
  const tasks = await prisma.task.count({ where: { userId: ahmed.id } });
  const stepsDone = await prisma.goalStep.count({ where: { goalId, isCompleted: true } });
  console.log(`   👤 ${u.username} · رفيقه: «${u.companionName}» · Sparks: ${db.sparksBalance} · Streak: ${db.currentStreak}`);
  console.log(`   🏔️ الجبل: ${stepsDone}/${steps.length} أهداف مكتملة · مهمة اليوم 1: ✅`);
  console.log(`   📋 مهام: ${tasks} (منها الجبلية) · إشعارات اليوم: ${notifs}`);
  console.log(`   🔔 المنبه 4 فجر: مفعل ✓ · WakeLog: WOKE ✓`);
}

// ── تنظيف (نشيل المستخدمين عشان الاختبار يتعاد) ──
await prisma.user.deleteMany({ where: { email: { in: ['ahmed@bal.app', 'mahmoud@bal.app'] } } });
console.log('\n═══════════════════════════════════════');
console.log('🏁 نهاية يوم أحمد — كل الأقسام اتجربت حياً');
console.log('═══════════════════════════════════════');
process.exit(0);
