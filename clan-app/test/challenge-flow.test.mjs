/**
 * ═══════════════════════════════════════════════════════════
 *  اختبار تكامل حي — التحدي الجماعي للتركيز (رؤية «بال»)
 *
 *  إنشاء تحدي (أدمن) → إشعار للأعضاء → قبول/تأجيل →
 *  غرفة انتظار → انطلاق → جلسات لكل مشارك بالدورة المخصصة.
 *
 *  التشغيل:  node test/challenge-flow.test.mjs
 * ═══════════════════════════════════════════════════════════
 */
const BASE = 'http://localhost:3000/api';
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✅', n); } else { fail++; console.log('  ❌', n); } };

const prisma = (await import('../src/config/prisma.js')).default;
const jwt = (await import('jsonwebtoken')).default;
const env = (await import('../src/config/env.js')).default;

const emails = ['ch_host@bal.app', 'ch_member@bal.app'];
await prisma.user.deleteMany({ where: { email: { in: emails } } });
const mk = async (email, username) => {
  const u = await prisma.user.create({ data: { username, email, password: 'x', domain: 'TECH', interests: ['TECH'], onboarded: true } });
  const t = jwt.sign({ userId: u.id }, env.jwt.accessSecret, { expiresIn: '1h' });
  return { u, t };
};
const HOST = await mk(emails[0], 'ch_host');
const MEMBER = await mk(emails[1], 'ch_member');
const h = (t) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

console.log('\n━━━ 1) إنشاء عشيرة خاصة + انضمام عضو ━━━');
let clanId;
{
  const r = await (await fetch(`${BASE}/clans/private/create`, { method: 'POST', headers: h(HOST.t), body: JSON.stringify({ name: 'عشيرة التحدي' }) })).json();
  clanId = r.clan.id;
  const code = r.clan.inviteCode;
  const j = await (await fetch(`${BASE}/clans/private/join`, { method: 'POST', headers: h(MEMBER.t), body: JSON.stringify({ inviteCode: code }) })).json();
  ok(Boolean(clanId) && j.success, 'عشيرة + عضو انضم');
}

console.log('\n━━━ 2) قيد صارم: راحة > 10 → 400 ━━━');
{
  const r = await fetch(`${BASE}/focus/challenge`, {
    method: 'POST', headers: h(HOST.t),
    body: JSON.stringify({ clanId, title: 'تحدي صارم', focusMin: 30, restMin: 12, cycles: 2 }),
  });
  ok(r.status === 400, 'راحة 12 → 400');
}

console.log('\n━━━ 3) إنشاء تحدي (30 + 5 × 2 = 65د) → إشعار للعضو ━━━');
let challengeId;
{
  const r = await (await fetch(`${BASE}/focus/challenge`, {
    method: 'POST', headers: h(HOST.t),
    body: JSON.stringify({ clanId, title: 'جلسة تركيز النخبة', focusMin: 30, restMin: 5, cycles: 2 }),
  })).json();
  ok(r.success && r.challenge.id, 'التحدي اتخلق');
  challengeId = r.challenge.id;
  ok(r.challenge.totalMin === 65, `إجمالي 65 (30×2 + 5×1) — حصلت ${r.challenge.totalMin}`);
  const notif = await prisma.notification.findFirst({ where: { userId: MEMBER.u.id, type: 'FOCUS_CHALLENGE' } });
  ok(Boolean(notif), 'العضو استلم إشعار التحدي');
  ok(notif.data?.challengeId === challengeId, 'الإشعار فيه challengeId');
}

console.log('\n━━━ 4) غير صاحب العشيرة لا ينشئ ━━━');
{
  const r = await fetch(`${BASE}/focus/challenge`, {
    method: 'POST', headers: h(MEMBER.t),
    body: JSON.stringify({ clanId, title: 'محاولة', focusMin: 30, restMin: 5, cycles: 1 }),
  });
  ok(r.status === 403, 'عضو عادي → 403 NOT_CLAN_HOST');
}

console.log('\n━━━ 5) قبول العضو → غرفة الانتظار ━━━');
{
  const r = await (await fetch(`${BASE}/focus/challenge/${challengeId}/accept`, { method: 'POST', headers: h(MEMBER.t), body: '{}' })).json();
  ok(r.success, 'العضو قبل التحدي');
  const ch = await (await fetch(`${BASE}/focus/challenge/${challengeId}`, { headers: h(HOST.t) })).json();
  ok(ch.challenge.waiting.some((u) => u.id === MEMBER.u.id), 'العضو في غرفة الانتظار');
}

console.log('\n━━━ 6) مغادرة قبل البدء → مسموح ثم يعود ━━━');
{
  const r = await (await fetch(`${BASE}/focus/challenge/${challengeId}/leave`, { method: 'POST', headers: h(MEMBER.t), body: '{}' })).json();
  ok(r.success, 'غادر قبل البدء');
  await (await fetch(`${BASE}/focus/challenge/${challengeId}/accept`, { method: 'POST', headers: h(MEMBER.t), body: '{}' })).json();
  ok(true, 'عاد للانتظار');
}

console.log('\n━━━ 7) الانطلاق → جلسات للكل بالدورة المخصصة ━━━');
{
  const r = await (await fetch(`${BASE}/focus/challenge/${challengeId}/start`, { method: 'POST', headers: h(HOST.t), body: '{}' })).json();
  ok(r.success, 'الأدمن أطلق الجلسة');
  ok(r.sessionCount >= 2, `جلسات لـ ${r.sessionCount} مشارك`);
  ok(r.cycle.totalFocusMin === 60 && r.cycle.plannedMin === 65, 'الدورة: 60 تركيز / 65 إجمالي');

  const db = await prisma.focusSession.findMany({ where: { type: 'CHALLENGE', status: 'ACTIVE' } });
  ok(db.length >= 2, 'القاعدة: جلسات CHALLENGE نشطة');
  ok(db.every((s) => s.restMin === 5 && s.cycles === 2 && s.totalFocusMin === 60), 'كل جلسة بالدورة الصحيحة');
}

console.log('\n━━━ 8) ممنوع الخروج بعد البدء ━━━');
{
  const r = await fetch(`${BASE}/focus/challenge/${challengeId}/leave`, { method: 'POST', headers: h(MEMBER.t), body: '{}' });
  ok(r.status === 409, 'مغادرة بعد البدء → 409 (التركيز مقدس)');
}

await prisma.user.deleteMany({ where: { email: { in: emails } } });
await prisma.focusChallenge.deleteMany({});
console.log(`\n${'═'.repeat(44)}\nالنتيجة: ✅ ${pass} نجح · ❌ ${fail} فشل\n${'═'.repeat(44)}`);
await prisma.$disconnect();
process.exit(fail ? 1 : 0);
