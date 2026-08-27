/**
 * إثبات صريح لأمان غرفة اللعبة.
 *
 * السيناريو الكامل:
 *   · «أ» و«ب» في نفس العشيرة الخاصة
 *   · «غريب» برة العشيرة تماماً
 *   · «أ» يعمل غرفة مربوطة بالعشيرة
 *   → «ب» لازم يدخل · «غريب» لازم يترفض
 */
const B = 'http://127.0.0.1:3999', API = B + '/api';
const c = async (m, p, o = {}) => {
  const r = await fetch(API + p, {
    method: m,
    headers: { 'Content-Type': 'application/json', ...(o.token ? { Authorization: 'Bearer ' + o.token } : {}) },
    ...(o.body ? { body: JSON.stringify(o.body) } : {}),
  });
  return { s: r.status, b: await r.json().catch(() => null) };
};
const u = () => Math.random().toString(36).slice(2, 8);

const mk = async () => {
  const r = await c('POST', '/auth/register', {
    body: { username: 'س_' + u(), email: `g_${u()}@bal.app`, password: 'Passw0rd!23', domain: 'TECH' },
  });
  await c('POST', '/auth/onboarding', { token: r.b.accessToken, body: { domain: 'TECH', interests: ['TECH'] } });
  return { t: r.b.accessToken, id: r.b.user.id };
};

let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label}${extra ? ' — ' + extra : ''}`); }
};

console.log('\n═══ أمان غرفة اللعبة ═══\n');

const A = await mk();
const member = await mk();
const stranger = await mk();

// عشيرة خاصة + عضو
const clan = await c('POST', '/clans/private/create', { token: A.t, body: { name: 'عشيرة_' + u() } });
const clanId = clan.b?.clan?.id;
const inviteCode = clan.b?.clan?.inviteCode;
ok(!!clanId, 'العشيرة الخاصة اتعملت');

if (inviteCode) {
  const j = await c('POST', '/clans/private/join', { token: member.t, body: { inviteCode } });
  ok(j.s === 200, 'العضو التاني انضم للعشيرة', `HTTP ${j.s}`);
}

// غرفة مربوطة بالعشيرة
const room = await c('POST', '/games/rooms', { token: A.t, body: { type: 'SNAKE', clanId } });
ok(room.s === 201, 'الغرفة اتعملت وقت الراحة', `HTTP ${room.s}`);

if (room.s === 201) {
  const code = room.b.room.code;

  // العضو لازم يدخل
  const asMember = await c('POST', '/games/rooms/join', { token: member.t, body: { code } });
  ok(asMember.s === 200, 'عضو العشيرة دخل', `HTTP ${asMember.s}`);

  // الغريب لازم يترفض
  const asStranger = await c('POST', '/games/rooms/join', { token: stranger.t, body: { code } });
  ok(
    asStranger.s === 403 && asStranger.b?.code === 'NOT_CLAN_MEMBER',
    'الغريب مرفوض',
    `HTTP ${asStranger.s} ${JSON.stringify(asStranger.b).slice(0, 80)}`,
  );

  // غير عضو مايقدرش يعمل غرفة للعشيرة
  const fake = await c('POST', '/games/rooms', { token: stranger.t, body: { type: 'SNAKE', clanId } });
  ok(fake.s === 403, 'غير العضو مايعملش غرفة للعشيرة', `HTTP ${fake.s}`);
}

console.log(`\n  ✅ ${pass} نجح   ❌ ${fail} فشل\n`);
process.exit(fail ? 1 : 0);
