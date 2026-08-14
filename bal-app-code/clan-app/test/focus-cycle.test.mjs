/**
 * ═══════════════════════════════════════════════════════════
 *  اختبار تكامل حي — القسم 4: الدورة المخصصة للتركيز (رؤية «بال»)
 *
 *  تركيز + راحة (1-10 صارم) + تكرار · آخر دورة = لوبي ·
 *  الشرارات من التركيز الفعلي فقط · الطور الحالي (FOCUS/REST).
 *
 *  التشغيل:  node test/focus-cycle.test.mjs
 * ═══════════════════════════════════════════════════════════
 */
const BASE = 'http://localhost:3000/api';
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✅', n); } else { fail++; console.log('  ❌', n); } };

const prisma = (await import('../src/config/prisma.js')).default;
const jwt = (await import('jsonwebtoken')).default;
const env = (await import('../src/config/env.js')).default;

await prisma.user.deleteMany({ where: { email: 'focus_cycle@bal.app' } });
const u = await prisma.user.create({
  data: { username: 'focus_cycle', email: 'focus_cycle@bal.app', password: 'x', domain: 'TECH', interests: ['TECH'], onboarded: true },
});
const token = jwt.sign({ userId: u.id }, env.jwt.accessSecret, { expiresIn: '1h' });
const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

console.log('\n━━━ 1) قيد صارم: راحة > 10 → مرفوض ━━━');
{
  const r = await fetch(`${BASE}/focus/start`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ focusMin: 30, restMin: 15, cycles: 2 }),
  });
  const j = await r.json();
  ok(r.status === 400 && /1 إلى 10/.test(j.message), `راحة 15 → 400 (${j.message})`);
}

console.log('\n━━━ 2) راحة 0 أو سالبة → مرفوض ━━━');
{
  const r = await fetch(`${BASE}/focus/start`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ focusMin: 30, restMin: 0, cycles: 2 }),
  });
  ok(r.status === 400, 'راحة 0 → 400');
}

console.log('\n━━━ 3) دورة مخصصة صحيحة (30 تركيز + 5 راحة × 3) ━━━');
{
  const r = await fetch(`${BASE}/focus/start`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ focusMin: 30, restMin: 5, cycles: 3 }),
  });
  const j = await r.json();
  ok(r.status === 201, 'بدء → 201');

  // 30*3 تركيز + 5*2 راحة = 100 دقيقة (آخر دورة بلا راحة)
  ok(j.session.plannedMin === 100, `plannedMin = 100 (حصلت ${j.session.plannedMin})`);
  ok(j.cycle && j.cycle.totalFocusMin === 90, `totalFocusMin = 90 (التركيز الفعلي — حصلت ${j.cycle?.totalFocusMin})`);
  ok(j.cycle.restMin === 5 && j.cycle.cycles === 3, 'راحة 5 × 3 دورات');
  ok(j.cycle.table.length === 3, 'جدول 3 دورات');
  ok(j.cycle.table[0].restMin === 5, 'الدورة 1 فيها راحة 5');
  ok(j.cycle.table[2].restMin === 0 && j.cycle.table[2].phase === 'FOCUS_END_LOBBY', 'آخر دورة = لوبي بلا راحة');
  const sid = j.session.id;

  // الطور الحالي = FOCUS (دورة 1)
  const active = await (await fetch(`${BASE}/focus/active`, { headers: H })).json();
  ok(active.session.cycle.phase === 'FOCUS', 'الطور الحالي = FOCUS');
  ok(active.session.cycle.cycleNumber === 1, 'الدورة رقم 1');

  // إنهاء الجلسة (محاكاة 100 دقيقة = 90 تركيز فعلي)
  await prisma.focusSession.update({
    where: { id: sid },
    data: { startedAt: new Date(Date.now() - 100 * 60_000) },
  });
  const done = await (await fetch(`${BASE}/focus/${sid}/complete`, { method: 'POST', headers: H, body: JSON.stringify({}) })).json();
  ok(done.success === true, 'الإنهاء → نجاح');
  ok(done.session.totalFocusMin === 90, 'totalFocusMin = 90 في الرد');
  // الشرارات = 90 × 0.45 = 40.5 → 41 (مقرب لأعلى)
  ok(done.session.earnedSparks === 41, `شرارات = 41 (90×0.45) — حصلت ${done.session.earnedSparks}`);
  const db = await prisma.focusSession.findUnique({ where: { id: sid } });
  ok(db.serverVerifiedMin === 90, 'القاعدة: serverVerifiedMin = 90');
}

console.log('\n━━━ 4) دورة قصيرة (10 تركيز + 2 راحة × 2 = 22د) ━━━');
{
  const r = await fetch(`${BASE}/focus/start`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ focusMin: 10, restMin: 2, cycles: 2 }),
  });
  const j = await r.json();
  ok(r.status === 201 && j.session.plannedMin === 22, `plannedMin = 22 (حصلت ${j.session?.plannedMin})`);
  const sid = j.session.id;
  await prisma.focusSession.update({
    where: { id: sid },
    data: { startedAt: new Date(Date.now() - 22 * 60_000) },
  });
  const done = await (await fetch(`${BASE}/focus/${sid}/complete`, { method: 'POST', headers: H, body: JSON.stringify({}) })).json();
  ok(done.success && done.session.earnedSparks === 9, `شرارات = 9 (20×0.45) — حصلت ${done.session?.earnedSparks}`);
}

console.log('\n━━━ 5) جلسة عادية (بلا دورة) — السلوك القديم محفوظ ━━━');
{
  const r = await fetch(`${BASE}/focus/start`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ plannedMin: 30 }),
  });
  const j = await r.json();
  ok(r.status === 201 && j.session.plannedMin === 30, 'عادية 30 → 201');
  ok(!j.cycle, 'مفيش cycle (سلوك قديم)');
  const sid = j.session.id;
  await prisma.focusSession.update({
    where: { id: sid },
    data: { startedAt: new Date(Date.now() - 30 * 60_000) },
  });
  const done = await (await fetch(`${BASE}/focus/${sid}/complete`, { method: 'POST', headers: H, body: JSON.stringify({}) })).json();
  ok(done.success && done.session.earnedSparks === 14, `شرارات = 14 (30×0.45) — حصلت ${done.session?.earnedSparks}`);
}

await prisma.user.deleteMany({ where: { email: 'focus_cycle@bal.app' } });
console.log(`\n${'═'.repeat(44)}\nالنتيجة: ✅ ${pass} نجح · ❌ ${fail} فشل\n${'═'.repeat(44)}`);
await prisma.$disconnect();
process.exit(fail ? 1 : 0);
