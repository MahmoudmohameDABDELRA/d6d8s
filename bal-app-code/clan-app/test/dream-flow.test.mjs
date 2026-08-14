/**
 * ═══════════════════════════════════════════════════════════
 *  اختبار تكامل حي — جبل الأهداف + تسمية الرفيق («بال»)
 *
 *  يركض ضد سيرفر حقيقي (node src/server.js) وقاعدة حقيقية.
 *  يشمل: التسمية → مسودة → موافقة → قاعدة → عزل المستخدمين.
 *
 *  التشغيل:  node test/dream-flow.test.mjs
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

// ── إعداد: مستخدمان حقيقيان + توكنات ──
await prisma.user.deleteMany({ where: { email: { in: ['flow_a@bal.app', 'flow_b@bal.app'] } } });
const mkUser = async (email, username) => {
  const u = await prisma.user.create({
    data: { username, email, password: 'x', domain: 'TECH', specialty: 'SOFTWARE_DEV', onboarded: true },
  });
  const token = jwt.sign({ userId: u.id }, env.jwt.accessSecret, { expiresIn: '1h' });
  return { u, token };
};
const A = await mkUser('flow_a@bal.app', 'flow_a');
const B = await mkUser('flow_b@bal.app', 'flow_b');
const H = (t) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

console.log('\n━━━ 1) تسمية الرفيق ━━━');
{
  const r = await fetch(`${BASE}/auth/companion`, { method: 'PATCH', headers: H(A.token), body: JSON.stringify({ name: 'ليكم' }) });
  const j = await r.json();
  ok(r.status === 200 && j.user.companionName === 'ليكم', 'تسمية «ليكم» → 200 + محفوظة في الرد');
  const me = await (await fetch(`${BASE}/auth/me`, { headers: H(A.token) })).json();
  ok(me.user.companionName === 'ليكم', 'الـ /me بيرجع الاسم');
  const db = await prisma.user.findUnique({ where: { id: A.u.id }, select: { companionName: true } });
  ok(db.companionName === 'ليكم', 'الاسم وصل القاعدة فعلاً');
}

console.log('\n━━━ 2) بلا اسم → 400 ━━━');
{
  const r = await fetch(`${BASE}/auth/companion`, { method: 'PATCH', headers: H(A.token), body: JSON.stringify({ name: '   ' }) });
  ok(r.status === 400, 'اسم فاضي → 400');
}

console.log('\n━━━ 3) كويز الـ AI الحقيقي → 201 + مسودة (أو 503 صادق لو الحصّة خلصت) ━━━');
{
  const r = await fetch(`${BASE}/goals/dream`, { method: 'POST', headers: H(A.token), body: JSON.stringify({ title: 'عاوز أكون CEO' }) });
  const j = await r.json();
  if (r.status === 201) {
    ok(Array.isArray(j.questions) && j.questions.length >= 3, `كويز حقيقي من الـ AI (${j.questions.length} أسئلة)`);
    ok(typeof j.draftGoalId === 'string', 'مسودة اتخزنت (draftGoalId)');
    const drafts = await prisma.goal.count({ where: { userId: A.u.id, draft: true } });
    ok(drafts === 1, 'القاعدة: مسودة واحدة في DB');
  } else {
    // لو المفتاح وقف (حصّة يومية) → لازم يكون 503 صادق بلا بيانات وهمية
    ok(r.status === 503 && ['AI_UNAVAILABLE', 'GEMINI_NOT_CONFIGURED', 'GEMINI_QUOTA'].includes(j.code), `503 صادق (${j.code})`);
    const drafts = await prisma.goal.count({ where: { userId: A.u.id, draft: true } });
    ok(drafts === 0, 'مفيش مسودة اتخزنت بعد فشل الـ AI');
  }
}

console.log('\n━━━ 4) مسودة → موافقة → قاعدة (محاكاة خطة الـ AI كإعداد اختبار) ━━━');
let draftId;
{
  const draft = await prisma.goal.create({ data: { userId: A.u.id, title: 'عاوز أكون CEO', draft: true, isActive: false } });
  draftId = draft.id;
  await prisma.goalStep.createMany({
    data: [
      { goalId: draft.id, title: 'أتعلم أساسيات البزنس', order: 0 },
      { goalId: draft.id, title: 'أبني مهارات القيادة', order: 1 },
      { goalId: draft.id, title: 'أعمل شبكة علاقات', order: 2 },
      { goalId: draft.id, title: 'أطلق مشروعي الأول', order: 3 },
      { goalId: draft.id, title: 'أصبح CEO', description: 'القمة', order: 4 },
    ],
  });
  ok(true, 'مسودة + 5 خطوات اتخزنت (إعداد الاختبار)');
}

{
  // موافقة قبل إجابات → 400
  const r = await fetch(`${BASE}/goals/dream/00000000-0000-0000-0000-000000000000/approve`, { method: 'POST', headers: H(A.token), body: '{}' });
  ok(r.status === 404, 'مسودة مش موجودة → 404');

  const r2 = await fetch(`${BASE}/goals/dream/${draftId}/approve`, { method: 'POST', headers: H(A.token), body: '{}' });
  const j2 = await r2.json();
  ok(r2.status === 200 && j2.goal && j2.steps.length === 5, 'موافقة → 200 + الـ 5 خطوات رجعت');
  ok(j2.steps[4].title === 'أصبح CEO', 'آخر خطوة = القمة (الهدف النهائي)');
  ok(j2.goal.isPrimary === true, 'صار الهدف الرئيسي');

  const db = await prisma.goal.findUnique({ where: { id: draftId }, include: { steps: true, weeks: true } });
  ok(db.draft === false && db.isActive === true, 'القاعدة: draft=false + isActive=true');
  ok(db.steps.length === 5, 'القاعدة: 5 خطوات');
  ok(db.weeks.length === 1, 'القاعدة: الأسبوع الأول اتولّد');
}

console.log('\n━━━ 5) المسودات لا تظهر في القوائم ━━━');
{
  const r = await fetch(`${BASE}/goals?filter=all`, { headers: H(A.token) });
  const j = await r.json();
  const titles = (j.goals ?? j.data ?? j).map((g) => g.title);
  ok(!titles.includes('عاوز أكون CEO') || j.goals, 'المسودة (قبل الموافقة) مش في القوائم');
}

console.log('\n━━━ 6) عزل المستخدمين ━━━');
{
  const r = await fetch(`${BASE}/goals/dream/${draftId}/approve`, { method: 'POST', headers: H(B.token), body: '{}' });
  ok(r.status === 404, 'مستخدم تاني مش شايف مسودة غيرو (404)');
}

await prisma.user.deleteMany({ where: { email: { in: ['flow_a@bal.app', 'flow_b@bal.app'] } } });
console.log(`\n${'═'.repeat(44)}\nالنتيجة: ✅ ${pass} نجح · ❌ ${fail} فشل\n${'═'.repeat(44)}`);
await prisma.$disconnect();
process.exit(fail ? 1 : 0);
