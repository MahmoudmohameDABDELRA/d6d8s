/**
 * ═══════════════════════════════════════════════════════════
 *  فحص حي لسجل الاستيقاظ — الرقم الصادق
 *
 *  ️ المشكلة اللي بيغطيها:
 *
 *  `alarmSnooze` و`alarmHistory` و`alarmMissed` كانوا معرّفين
 *  في `ApiEndpoints` و**مش مستخدمين** ولا مرة. الأثر مش مجرد
 *  «فيتشر ناقص»:
 *
 *   · المنبه اللي المستخدم تجاهله مكانش بيتسجّل خالص، فسلسلة
 *     الاستيقاظ كانت بتعدّ النجاحات بس. الرقم كان بيبان أحسن
 *     من الحقيقة.
 *   · مكانش فيه زرار غفوة أصلاً، فاللي مش قادر يقوم كان بيقفل
 *     التطبيق — وساعتها مفيش تسجيل، والإحصائية تقول إنه صحي.
 *
 *  الرقم اللي بيجامل المستخدم بيفقد قيمته أول ما يلاحظ. الفحص
 *  ده بيتأكد إن الفوات بيوصل للسجل ويغيّر الإحصائية فعلاً.
 *
 *  التشغيل:
 *    1) npm run harness
 *    2) node test/harness/alarm-history-probe.mjs
 * ═══════════════════════════════════════════════════════════
 */
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

const call = async (method, path, { token, body, query } = {}) => {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(query ?? {})) {
    url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, {
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

// ════════════════════════════════════════════════
console.log('\n═══ 1. تجهيز ═══');

const reg = await call('POST', '/auth/register', {
  body: {
    username: `منبه_${uniq()}`,
    email: `alarm_${uniq()}@bal.app`,
    password: 'Passw0rd!23',
    domain: 'TECH',
  },
});
const token = reg.body?.accessToken;
ok(!!token, 'المستخدم اتعمل');

await call('POST', '/auth/onboarding', {
  token,
  body: { domain: 'TECH', interests: ['TECH'] },
});

const created = await call('POST', '/alarms', {
  token,
  body: { time: '06:30', days: [0, 1, 2, 3, 4, 5, 6] },
});
const alarmId = created.body?.alarm?.id;
ok(created.status === 201 && !!alarmId, 'المنبه اتعمل');

// ════════════════════════════════════════════════
console.log('\n═══ 2. السجل فاضي في الأول ═══');

const before = await call('GET', '/alarms/history', {
  token,
  query: { limit: 30 },
});

ok(before.status === 200, '/alarms/history بيرد');

const s0 = before.body?.stats;
ok(!!s0, 'الرد فيه stats');

/** الحقول اللي الشاشة بتقراها — أي واحد ناقص = رقم فاضي */
for (const key of [
  'total',
  'woke',
  'missed',
  'successRate',
  'currentStreak',
  'longestStreak',
]) {
  ok(key in (s0 ?? {}), `الحقل «${key}» موجود`);
}

ok(s0?.total === 0, 'مفيش سجل قبل أي حاجة', `total=${s0?.total}`);

// ════════════════════════════════════════════════
console.log('\n═══ 3. الفوات بيتسجّل — بيت القصيد ═══');

const missed = await call('POST', '/alarms/missed', {
  token,
  body: { alarmId, scheduledTime: '06:30' },
});

ok(missed.status === 200, '/alarms/missed بيرد', `HTTP ${missed.status}`);
ok(missed.body?.recorded === true, 'السيرفر بيقول اتسجّل');

const after = await call('GET', '/alarms/history', {
  token,
  query: { limit: 30 },
});
const s1 = after.body?.stats;

/**
 * ️ دي النقطة كلها: قبل الوصل ده، الفوات مكانش بيوصل للسجل
 *    إطلاقاً و`total` كان بيفضل صفر للأبد.
 */
ok(s1?.total === 1, 'السجل شاف المنبه', `total=${s1?.total}`);
ok(s1?.missed === 1, 'اتحسب كـ«فات»', `missed=${s1?.missed}`);
ok(s1?.woke === 0, 'مش محسوب كصحيان');
ok(s1?.successRate === 0, 'نسبة النجاح 0%', `${s1?.successRate}`);

// ════════════════════════════════════════════════
console.log('\n═══ 4. الغفوة ═══');

const snooze = await call('POST', '/alarms/snooze', {
  token,
  body: { count: 1, alarmId },
});

/**
 * ️ الغفوة بتنده Gemini حقيقي. من غير مفتاح، السيرفر بيرجّع
 *    502 مع `AI_UNAVAILABLE` — وده **سلوك صح**: بيقول الحقيقة
 *    بدل ما يخترع جملة.
 *
 *    الواجهة بتعالج الحالة دي كنجاح صامت (الغفوة نفسها اتسجّلت،
 *    اللي فشل هو الجملة التحفيزية بس)، فالمستخدم ما يشوفش
 *    «فشل» على حاجة نجحت.
 */
const okStatus = snooze.status === 200 || snooze.status === 502;
ok(okStatus, 'الغفوة بترد بحالة معروفة', `HTTP ${snooze.status}`);

if (snooze.status === 502) {
  ok(
    snooze.body?.code === 'AI_UNAVAILABLE',
    'بلا مفتاح AI: بيقول السبب صراحة مش بيخترع جملة',
  );
  ok(
    !!snooze.body?.offlineFallback,
    'وبيقترح البديل (المسألة الحسابية)',
  );
} else {
  ok(
    typeof (snooze.body?.message ?? snooze.body?.text) === 'string',
    'الرد فيه جملة تحفيزية',
  );
}

// ════════════════════════════════════════════════
console.log('\n═══ 5. الحقول اللي الواجهة بتعرضها ═══');

/**
 * ️ الشاشة بتعرض صف: منبه / صحيت / فاتك / نجاح.
 *    لو أي حقل رجع `undefined` هيتعرض «null» في وش المستخدم.
 */
const displayed = {
  total: s1?.total,
  woke: s1?.woke,
  missed: s1?.missed,
  successRate: s1?.successRate,
  currentStreak: s1?.currentStreak,
  longestStreak: s1?.longestStreak,
};

for (const [key, value] of Object.entries(displayed)) {
  ok(typeof value === 'number', `«${key}» رقم صحيح`);
}

ok(
  (s1?.woke ?? 0) + (s1?.missed ?? 0) === s1?.total,
  'صحيت + فاتك = الإجمالي (الأرقام متسقة)',
);

console.log(`\n  ✅ ${pass} نجح   ❌ ${fail} فشل\n`);
process.exit(fail === 0 ? 0 : 1);
