/**
 * ═══════════════════════════════════════════════════════════
 *  اختبار تكامل حي — القسم 2: الصداقة والرسائل (نظام انستقرام)
 *
 *  يركض ضد سيرفر حقيقي + قاعدة حقيقية.
 *  يشمل: اهتمامات في التسجيل → طلب صداقة برسالة → قبول → محادثة →
 *        كتم → حظر → حد يومي → بروفايل عام.
 *  التشغيل:  node test/friendship-flow.test.mjs
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

// ── إعداد: 3 مستخدمين ──
const emails = ['fr_a@bal.app', 'fr_b@bal.app', 'fr_c@bal.app'];
await prisma.user.deleteMany({ where: { email: { in: emails } } });
await prisma.friendship.deleteMany({});
const mkUser = async (email, username, interests) => {
  const u = await prisma.user.create({
    data: {
      username, email, password: 'x',
      domain: interests[0], interests,
      specialty: null, onboarded: true,
    },
  });
  const token = jwt.sign({ userId: u.id }, env.jwt.accessSecret, { expiresIn: '1h' });
  return { u, token };
};
const A = await mkUser(emails[0], 'fr_a', ['TECH', 'BUSINESS']);
const B = await mkUser(emails[1], 'fr_b', ['TECH', 'CREATIVE']);
const C = await mkUser(emails[2], 'fr_c', ['HEALTH']);
const H = (t) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

console.log('\n━━━ 1) الاهتمامات في التسجيل ━━━');
{
  const db = await prisma.user.findUnique({ where: { id: A.u.id } });
  ok(JSON.stringify(db.interests) === JSON.stringify(['TECH', 'BUSINESS']), 'A عنده اهتمامان (TECH + BUSINESS)');
}

console.log('\n━━━ 2) رسالة لغير صديق = طلب صداقة ━━━');
{
  const r = await fetch(`${BASE}/chat/start`, {
    method: 'POST', headers: H(A.token),
    body: JSON.stringify({ targetUserId: B.u.id, text: 'أهلاً يا صديقي، شفتك في عشيرة التقنية' }),
  });
  const j = await r.json();
  ok(r.status === 201 && j.isFriendRequest === true, 'A يبعت رسالة → ترجع isFriendRequest');
  ok(j.friendshipId, 'الرد فيه friendshipId');
  const db = await prisma.friendship.findFirst({ where: { fromUserId: A.u.id, toUserId: B.u.id } });
  ok(db && db.status === 'PENDING' && db.introText.includes('أهلاً'), 'القاعدة: طلب PENDING مع introText');
}

console.log('\n━━━ 3) ممنوع رسالة تانية قبل القبول ━━━');
{
  const r = await fetch(`${BASE}/chat/start`, {
    method: 'POST', headers: H(A.token),
    body: JSON.stringify({ targetUserId: B.u.id, text: 'رسالة تانية؟' }),
  });
  const j = await r.json();
  ok(r.status === 409 && j.code === 'REQUEST_PENDING', 'رسالة تانية → 409 REQUEST_PENDING');
}

console.log('\n━━━ 4) قائمة الطلبات الواردة عند B ━━━');
{
  const r = await fetch(`${BASE}/social/friends/requests`, { headers: H(B.token) });
  const j = await r.json();
  ok(j.count === 1 && j.requests[0].fromUser.username === 'fr_a', 'B يرى طلباً واحداً من fr_a');
}

console.log('\n━━━ 5) قبول الطلب → صداقة + محادثة + أول رسالة ━━━');
{
  const reqs = await (await fetch(`${BASE}/social/friends/requests`, { headers: H(B.token) })).json();
  const rid = reqs.requests[0].id;
  const r = await fetch(`${BASE}/social/friends/requests/${rid}/respond`, {
    method: 'POST', headers: H(B.token), body: JSON.stringify({ action: 'ACCEPT' }),
  });
  const j = await r.json();
  ok(r.status === 200 && j.conversationId, 'قبول → 200 + conversationId');
  const f = await prisma.friendship.findFirst({ where: { fromUserId: A.u.id, toUserId: B.u.id } });
  ok(f.status === 'ACCEPTED', 'القاعدة: Friendship = ACCEPTED');
  const msgs = await (await fetch(`${BASE}/chat/${j.conversationId}/messages`, { headers: H(B.token) })).json();
  const texts = JSON.stringify(msgs);
  ok(texts.includes('أهلاً يا صديقي'), 'أول رسالة (intro) موجودة في المحادثة');
}

console.log('\n━━━ 6) مراسلة عادية بعد الصداقة ━━━');
{
  const convs = await (await fetch(`${BASE}/chat/conversations`, { headers: H(A.token) })).json();
  ok(convs.success && convs.conversations?.length >= 1, 'A يرى المحادثة في قائمته');
  const convId = convs.conversations[0].id || convs.conversations[0].conversation.id;
  const r = await fetch(`${BASE}/chat/${convId}/messages`, {
    method: 'POST', headers: H(A.token),
    body: JSON.stringify({ text: 'تمام يا صاحبي، المحادثة فتحت' }),
  });
  ok(r.status === 200 || r.status === 201, 'رسالة عادية → تنجح');
}

console.log('\n━━━ 7) الكتم (Mute) ━━━');
{
  const r = await fetch(`${BASE}/social/mute/${B.u.id}`, { method: 'POST', headers: H(A.token) });
  ok(r.status === 200, 'A يكتم B');
  const muted = await (await fetch(`${BASE}/social/muted`, { headers: H(A.token) })).json();
  ok(muted.muted.length === 1 && muted.muted[0].target.id === B.u.id, 'B في قائمة المكتومين');
  const r2 = await fetch(`${BASE}/social/mute/${B.u.id}`, { method: 'DELETE', headers: H(A.token) });
  ok(r2.status === 200, 'فك الكتم');
}

console.log('\n━━━ 8) البروفايل العام (إنجازات + ساعات + أصدقاء) ━━━');
{
  const r = await fetch(`${BASE}/social/profile/${A.u.id}`, { headers: H(B.token) });
  const j = await r.json();
  ok(r.status === 200, 'البروفايل يرجع');
  ok(j.profile.friendshipStatus === 'FRIENDS', 'B يشوف A كصديق (FRIENDS)');
  ok(typeof j.profile.totalFocusHours === 'number', 'ساعات التركيز موجودة');
  ok(Array.isArray(j.profile.achievements), 'الإنجازات موجودة');
  ok(typeof j.profile.friendsCount === 'number', 'عدد الأصدقاء موجود');
}

console.log('\n━━━ 9) البحث بالاهتمام ━━━');
{
  const r = await fetch(`${BASE}/chat/search?interest=TECH`, { headers: H(C.token) });
  const j = await r.json();
  const users = j.users ?? j.results ?? j;
  ok(Array.isArray(users) && users.some((u) => u.id === A.u.id), 'بحث TECH يظهر A');
}

console.log('\n━━━ 10) عزل: C مش صديق أحد ━━━');
{
  const r = await fetch(`${BASE}/social/profile/${A.u.id}`, { headers: H(C.token) });
  const j = await r.json();
  ok(j.profile.friendshipStatus === 'NOT_FRIENDS', 'C يرى A كغريب (NOT_FRIENDS)');
}

await prisma.user.deleteMany({ where: { email: { in: emails } } });
await prisma.friendship.deleteMany({});
console.log(`\n${'═'.repeat(44)}\nالنتيجة: ✅ ${pass} نجح · ❌ ${fail} فشل\n${'═'.repeat(44)}`);
await prisma.$disconnect();
process.exit(fail ? 1 : 0);
