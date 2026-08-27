/**
 * ═══════════════════════════════════════════════════════════
 *  فحص حي للعبة الثعبان — البروتوكول اللي الواجهة اتبنت عليه
 *
 *  ️ ليه الفحص ده مهم بالذات:
 *
 *  السيرفر فيه محرّك لعبة كامل (٦٦٣ سطر) و**عمره ما اتنفّذ من
 *  عميل حقيقي**. مفيش ولا ملف في التطبيق كان بينده عليه. يعني
 *  البروتوكول كله (أسماء الأحداث، شكل الحزم، الحقول المضغوطة)
 *  كان **افتراض** مش حقيقة متأكَّد منها.
 *
 *  الواجهة الجديدة بتفكّ حزمة مضغوطة بمفاتيح حرف واحد
 *  (`i`, `x`, `y`, `a`, `s`, `l`, `d`, `b`) والزاوية مضروبة
 *  في ١٠٠. أي اختلاف بسيط = شاشة سودا. الفحص ده بيتصل
 *  بالسوكيت زي التطبيق بالظبط ويتأكد من كل حقل.
 *
 *  التشغيل:
 *    1) npm run harness
 *    2) node test/harness/snake-probe.mjs
 * ═══════════════════════════════════════════════════════════
 */
import { io } from 'socket.io-client';

const B = process.env.HARNESS_URL ?? 'http://127.0.0.1:3999';
const API = `${B}/api`;

let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) {
    pass += 1;
    console.log(`  ✅ ${label}`);
  } else {
    fail += 1;
    console.log(`  ❌ ${label}${extra ? ` — ${extra}` : ''}`);
  }
};

const call = async (method, path, { token, body } = {}) => {
  const res = await fetch(API + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* بلا جسم */
  }
  return { status: res.status, body: json };
};

const uniq = () => Math.random().toString(36).slice(2, 8);

const makeUser = async (label) => {
  const reg = await call('POST', '/auth/register', {
    body: {
      username: `${label}_${uniq()}`,
      email: `${label}_${uniq()}@bal.app`,
      password: 'Passw0rd!23',
      domain: 'TECH',
    },
  });
  const token = reg.body?.accessToken;
  await call('POST', '/auth/onboarding', {
    token,
    body: { domain: 'TECH', interests: ['TECH'] },
  });
  return { token, id: reg.body?.user?.id };
};

// ════════════════════════════════════════════════
console.log('\n═══ 1. الألعاب مقفولة برّه وقت الراحة ═══');

const host = await makeUser('host');

const listed = await call('GET', '/games', { token: host.token });
ok(listed.status === 200, 'قائمة الألعاب بترجع');
ok(
  typeof listed.body?.isBreakTime === 'boolean',
  'الرد بيقول إحنا في راحة ولا لأ',
);
ok(
  Array.isArray(listed.body?.games) && listed.body.games.length > 0,
  'فيه ألعاب معرّفة',
);
ok(
  listed.body.games.some((g) => g.type === 'SNAKE'),
  'الثعبان في القايمة',
);

const onBreak = listed.body.isBreakTime === true;
console.log(`     (إحنا ${onBreak ? 'في راحة' : 'في وقت تركيز'} دلوقتي)`);

if (!onBreak) {
  /**
   * ️ السلوك ده **مقصود**: `requireBreak()` بيرفض إنشاء غرفة
   *    أثناء التركيز. مش باج — دي قاعدة المنتج. اللعبة اللي
   *    متاحة طول الوقت بتبقى وسيلة تهرّب من المهام.
   */
  const denied = await call('POST', '/games/rooms', {
    token: host.token,
    body: { type: 'SNAKE' },
  });
  ok(
    denied.status === 403,
    'إنشاء غرفة وقت التركيز مرفوض (قاعدة مقصودة)',
    `HTTP ${denied.status}`,
  );
  ok(
    listed.body.openRooms?.length === 0,
    'مفيش غرف معروضة وقت التركيز',
  );

  console.log(`\n  ✅ ${pass} نجح   ❌ ${fail} فشل`);
  console.log('  ️ باقي الفحص محتاج وقت راحة — البروتوكول اتفحص جزئياً\n');
  process.exit(fail === 0 ? 0 : 1);
}

// ════════════════════════════════════════════════
console.log('\n═══ 2. غرفة مربوطة بعشيرة ═══');

const clan = await call('POST', '/clans/private/create', {
  token: host.token,
  body: { name: `عشيرة_${uniq()}`, domain: 'TECH' },
});
const clanId = clan.body?.clan?.id;
ok(!!clanId, 'العشيرة اتعملت', `HTTP ${clan.status}`);

const created = await call('POST', '/games/rooms', {
  token: host.token,
  body: { type: 'SNAKE', clanId },
});
const room = created.body?.room;
ok(created.status === 201, 'الغرفة اتعملت', `HTTP ${created.status}`);
ok(!!room?.id && !!room?.code, 'الغرفة ليها معرّف وكود');
ok(
  typeof room?.expiresInSec === 'number',
  'الغرفة بتنتهي بانتهاء الراحة',
);

// ════════════════════════════════════════════════
console.log('\n═══ 3. الغريب مايدخلش ═══');

const stranger = await makeUser('stranger');
const strangerJoin = await call('POST', '/games/rooms/join', {
  token: stranger.token,
  body: { code: room.code },
});
ok(
  strangerJoin.status === 403,
  'اللي مش في العشيرة مرفوض حتى بالكود',
  `HTTP ${strangerJoin.status}`,
);

// ════════════════════════════════════════════════
console.log('\n═══ 4. بروتوكول السوكيت — اللي الواجهة اتبنت عليه ═══');

const connect = (token) =>
  new Promise((resolve, reject) => {
    const s = io(`${B}/game`, {
      transports: ['websocket'],
      auth: { token },
      reconnection: false,
    });
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
    setTimeout(() => reject(new Error('TIMEOUT')), 5000);
  });

try {
  const sock = await connect(host.token);
  ok(true, 'الاتصال بقناة /game');

  const joined = await new Promise((resolve) => {
    sock.on('player_joined', resolve);
    sock.on('error_message', (d) => resolve({ __error: d }));
    sock.emit('join_room', { roomId: room.id });
    setTimeout(() => resolve(null), 5000);
  });

  ok(joined !== null, 'الرد على join_room وصل');
  ok(!joined?.__error, 'مفيش خطأ في الدخول', JSON.stringify(joined?.__error));

  //  الحقول اللي الواجهة بتعتمد عليها في اللقطة الأولى
  ok(!!joined?.playerId, 'playerId موجود — بيه بنعرف ثعباني');
  ok(
    typeof joined?.arenaConfig?.width === 'number' &&
      typeof joined?.arenaConfig?.height === 'number',
    'أبعاد الساحة موجودة',
  );
  ok(Array.isArray(joined?.roster), 'roster موجود');

  /**
   * ️ الثوابت (اسم، لون، أجزاء) بتتبعت **هنا بس**. الحزمة
   *    الدورية مضغوطة بلا الحاجات دي. لو مجاتش هنا، اللاعبين
   *    هيظهروا بلا أسماء ولا ألوان.
   */
  const me = joined.roster.find((p) => p.id === joined.playerId);
  ok(!!me, 'أنا في الـ roster');
  ok(typeof me?.nickname === 'string', 'الاسم في اللقطة الأولى');
  ok(
    typeof me?.color === 'string' && me.color.startsWith('#'),
    'اللون بصيغة #RRGGBB — الواجهة بتفكّها كده',
    `رجّع ${me?.color}`,
  );

  //  الحزمة الدورية
  const tick = await new Promise((resolve) => {
    sock.on('game_state_update', resolve);
    setTimeout(() => resolve(null), 4000);
  });

  ok(tick !== null, 'حزمة الحالة الدورية بتوصل');

  if (tick) {
    ok(Array.isArray(tick.players), 'players مصفوفة');
    ok(Array.isArray(tick.food), 'food مصفوفة');
    ok(
      typeof tick.expiresInSec === 'number',
      'العدّاد التنازلي في كل حزمة',
    );

    const p = tick.players[0];
    ok(!!p, 'فيه لاعب واحد على الأقل');

    /**
     * ️ المفاتيح دي بحرف واحد عشان توفير النطاق (٣٠ حزمة/ثانية).
     *    أي اختلاف في اسم مفتاح = شاشة سودا في الواجهة.
     */
    for (const key of ['i', 'x', 'y', 'a', 's', 'l', 'd', 'b']) {
      ok(key in (p ?? {}), `الحقل «${key}» في حزمة اللاعب`);
    }

    ok(
      Number.isInteger(p?.a),
      'الزاوية عدد صحيح (مضروبة ×100) — الواجهة بتقسمها',
      `رجّع ${p?.a}`,
    );
    ok(p?.d === 0 || p?.d === 1, 'الموت 0 أو 1 مش true/false');
  }

  //  التحكّم
  sock.emit('change_direction', { angle: 1.57 });
  sock.emit('boost');

  const after = await new Promise((resolve) => {
    sock.on('game_state_update', resolve);
    setTimeout(() => resolve(null), 3000);
  });

  ok(after !== null, 'اللعبة كملت شغل بعد أوامر التحكّم');

  sock.close();
} catch (e) {
  ok(false, 'السوكيت', e.message);
}

console.log(`\n  ✅ ${pass} نجح   ❌ ${fail} فشل\n`);
process.exit(fail === 0 ? 0 : 1);
