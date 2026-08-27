/**
 * إثبات صريح لوضع التركيز الكامل:
 *   الدعوة → الجلسة → وضع الراحة → اللعبة → نفس اللاعبين
 */
process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/t';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.JWT_ACCESS_SECRET ??= 'harness-access-secret-long-enough-0000';
process.env.JWT_REFRESH_SECRET ??= 'harness-refresh-secret-long-enough-11';
process.env.NODE_ENV ??= 'development';
process.env.LOG_LEVEL ??= 'silent';
process.env.ENABLE_EMAIL_AUTH = 'true';
process.env.PORT = '4102';

const app = (await import('../../src/app.js')).default;
const server = app.listen(4102, '127.0.0.1');
await new Promise((r) => server.once('listening', r));

const API = 'http://127.0.0.1:4102/api';
const c = async (m, p, o = {}) => {
  const r = await fetch(API + p, {
    method: m,
    headers: { 'Content-Type': 'application/json', ...(o.token ? { Authorization: 'Bearer ' + o.token } : {}) },
    ...(o.body ? { body: JSON.stringify(o.body) } : {}),
  });
  return { s: r.status, b: await r.json().catch(() => null) };
};
const u = () => Math.random().toString(36).slice(2, 8);

let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label}${extra ? ' — ' + extra : ''}`); }
};

const mk = async () => {
  const r = await c('POST', '/auth/register', {
    body: { username: 'ف_' + u(), email: `f_${u()}@bal.app`, password: 'Passw0rd!23', domain: 'TECH' },
  });
  await c('POST', '/auth/onboarding', { token: r.b.accessToken, body: { domain: 'TECH', interests: ['TECH'] } });
  return { t: r.b.accessToken, id: r.b.user.id };
};

console.log('\n═══ وضع التركيز الكامل ═══\n');

// ── 1) عشيرة بعضوين ──
const host = await mk();
const member = await mk();
const stranger = await mk();

const clan = await c('POST', '/clans/private/create', { token: host.t, body: { name: 'عشيرة_' + u() } });
const clanId = clan.b?.clan?.id;
const invite = clan.b?.clan?.inviteCode;
ok(!!clanId, 'العشيرة اتعملت');

const joined = await c('POST', '/clans/private/join', { token: member.t, body: { inviteCode: invite } });
ok(joined.s === 200, 'العضو انضم', `HTTP ${joined.s}`);

// ── 2) الدعوة: التحدي بيبعت إشعار للأعضاء ──
console.log('\n── الدعوات ──');
const ch = await c('POST', '/focus/challenge', {
  token: host.t,
  body: { clanId, title: 'نذاكر سوا', focusMin: 25, restMin: 5, cycles: 2 },
});
const chId = ch.b?.challenge?.id;
ok(ch.s === 201, 'التحدي اتطلق', `HTTP ${ch.s}`);
ok(ch.b?.challenge?.notifiedMembers >= 1, `الإشعار وصل لـ ${ch.b?.challenge?.notifiedMembers} عضو`);

const memberNotifs = await c('GET', '/notifications', { token: member.t });
const inviteNotif = (memberNotifs.b?.notifications ?? []).find(
  (n) => n.data?.action === 'FOCUS_CHALLENGE' && n.data?.challengeId === chId,
);
ok(!!inviteNotif, 'الدعوة ظهرت عند العضو كإشعار');
ok(
  !!inviteNotif?.body && /\d+/.test(inviteNotif.body),
  'الدعوة فيها تفاصيل الجلسة',
  inviteNotif?.body?.slice(0, 60),
);

// الغريب مايوصلوش
const strangerNotifs = await c('GET', '/notifications', { token: stranger.t });
const leaked = (strangerNotifs.b?.notifications ?? []).some((n) => n.data?.challengeId === chId);
ok(!leaked, 'الغريب مـاوصلتوش الدعوة');

// ── 3) القبول والانضمام ──
console.log('\n── الانضمام للجلسة ──');
const accept = await c('POST', `/focus/challenge/${chId}/accept`, { token: member.t });
ok(accept.s === 200 || accept.s === 409, 'العضو قبل الدعوة', `HTTP ${accept.s}`);

const state = await c('GET', `/focus/challenge/${chId}`, { token: member.t });
const waiting = state.b?.challenge?.waiting ?? [];
const active = state.b?.challenge?.active ?? [];
ok(
  waiting.length + active.length >= 1,
  `المشاركين في الغرفة: ${waiting.length + active.length}`,
);

// الغريب مايقدرش يقبل
const strangerAccept = await c('POST', `/focus/challenge/${chId}/accept`, { token: stranger.t });
ok(
  strangerAccept.s === 403 || strangerAccept.s === 404,
  'الغريب مايقدرش يدخل التحدي',
  `HTTP ${strangerAccept.s}`,
);

// ── 4) البداية سوا ──
const start = await c('POST', `/focus/challenge/${chId}/start`, { token: host.t });
ok(start.s === 200 || start.s === 409, 'التحدي بدأ', `HTTP ${start.s}`);

const afterStart = await c('GET', `/focus/challenge/${chId}`, { token: member.t });
ok(
  afterStart.b?.challenge?.status === 'ACTIVE',
  `الحالة بقت ACTIVE (${afterStart.b?.challenge?.status})`,
);

// ── 5) وضع الراحة ──
console.log('\n── وضع الراحة ──');
const { getPulseState, isBreakTime } = await import('../../src/services/pulse.service.js');
const pulse = getPulseState();
ok(!!pulse?.phase, `طور النبضة الحالي: ${pulse?.phase} (باقي ${pulse?.remainingInPhase}د)`);
console.log(`     وقت راحة دلوقتي؟ ${isBreakTime() ? 'أيوة' : 'لأ'}`);

const games = await c('GET', '/games', { token: host.t });
ok(games.s === 200, 'قائمة الألعاب بترجع');
ok(
  Array.isArray(games.b?.games) && games.b.games.some((g) => g.type === 'SNAKE'),
  'لعبة الثعبان موجودة في القائمة',
);

// ── 6) اللعبة: مقصورة على العشيرة ──
console.log('\n── لعبة الثعبان ──');
const room = await c('POST', '/games/rooms', { token: host.t, body: { type: 'SNAKE', clanId } });

if (room.s === 403) {
  console.log('     ⏸️  برة وقت الراحة — الغرف مقفولة (سلوك صح)');
  ok(room.b?.code === 'NOT_BREAK_TIME', 'الرفض بسبب وقت التركيز');
} else {
  ok(room.s === 201, 'الغرفة اتعملت', `HTTP ${room.s}`);
  const code = room.b?.room?.code;

  const memberJoin = await c('POST', '/games/rooms/join', { token: member.t, body: { code } });
  ok(memberJoin.s === 200, 'عضو العشيرة دخل اللعبة', `HTTP ${memberJoin.s}`);

  const strangerJoin = await c('POST', '/games/rooms/join', { token: stranger.t, body: { code } });
  ok(
    strangerJoin.s === 403 && strangerJoin.b?.code === 'NOT_CLAN_MEMBER',
    'الغريب مرفوض من اللعبة',
    `HTTP ${strangerJoin.s}`,
  );

  const roomState = await c('GET', `/games/rooms/${room.b.room.id}`, { token: host.t });
  const players = roomState.b?.room?.players ?? [];
  ok(players.length === 2, `اللاعبين في الغرفة: ${players.length} (المضيف + العضو)`);
}

console.log(`\n  ✅ ${pass} نجح   ❌ ${fail} فشل\n`);
server.close();
process.exit(fail ? 1 : 0);
