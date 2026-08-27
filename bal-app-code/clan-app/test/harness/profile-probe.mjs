/**
 * ═══════════════════════════════════════════════════════════
 *  فحص شكل رد الإحصائيات — الحقول اللي الشاشة بتقراها
 *
 *  ️ الباج اللي كشفه الفحص ده وأنا بكتبه:
 *
 *  كتبت في الشاشة:
 *      (_stats?['streak'] as num?)?.toInt() ?? ... ?? 0
 *
 *  و`streak` **مش رقم** — ده كائن:
 *      "streak": { current, longest, activeToday, atRisk }
 *
 *  الكاست بيفشل بهدوء ويرجّع `null`، فالنتيجة صفر. والصفر
 *  **مبيرميش خطأ** — بيتعرض عادي. المستخدم اللي عنده سلسلة
 *  ٣٠ يوم كان هيشوف صفر ويفتكر إنه خسرها.
 *
 *  الدرس: الأخطاء اللي بترمي بتتصلّح. اللي بتعرض رقم غلط
 *  بهدوء بتعيش سنين.
 *
 *  الفحص ده بيثبّت **شكل** الرد: كل حقل بتقراه الشاشة، ونوعه.
 *
 *  التشغيل:
 *    1) npm run harness
 *    2) node test/harness/profile-probe.mjs
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

console.log('\n═══ 1. تجهيز ═══');

const reg = await call('POST', '/auth/register', {
  body: {
    username: `بروفايل_${uniq()}`,
    email: `pf_${uniq()}@bal.app`,
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

console.log('\n═══ 2. شكل رد /auth/me/stats ═══');

const res = await call('GET', '/auth/me/stats', { token });
ok(res.status === 200, 'المسار بيرد', `HTTP ${res.status}`);

const s = res.body ?? {};

/**
 * ️ كل سطر هنا = حقل الشاشة بتقراه فعلاً.
 *    لو السيرفر غيّر الشكل، الفحص ده بيقع **قبل** ما المستخدم
 *    يشوف صفر مكان رقمه.
 */
const shape = [
  ['profile', 'object'],
  ['profile.username', 'string'],
  ['profile.memberSince', 'string'],
  ['sparks.balance', 'number'],
  ['focus.totalHours', 'number'],
  ['focus.totalSessions', 'number'],
  ['tasks.completed', 'number'],
  ['today.focusMin', 'number'],
  ['today.tasksCompleted', 'number'],
  ['achievements.unlocked', 'number'],
  ['achievements.total', 'number'],
  ['clans.count', 'number'],
  //  الحقل اللي وقعت فيه: كائن مش رقم
  ['streak', 'object'],
  ['streak.current', 'number'],
  ['streak.longest', 'number'],
  ['streak.activeToday', 'boolean'],
  ['streak.atRisk', 'boolean'],
];

const dig = (obj, path) =>
  path.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), obj);

for (const [path, type] of shape) {
  const value = dig(s, path);
  const actual = value === null ? 'null' : typeof value;
  ok(actual === type, `${path} نوعه ${type}`, `لقينا ${actual}`);
}

console.log('\n═══ 3. الحارس ضد الباج بالتحديد ═══');

/**
 * ️ الفحص ده بيحاكي الكاست الغلط اللي كتبته:
 *    لو `streak` رجع رقم يوم من الأيام، الشاشة هتشتغل بالكود
 *    الجديد برضه (بتفحص النوع)، بس لو رجع كائن والكود القديم
 *    رجع، الفحص ده هيمسكه.
 */
ok(
  typeof s.streak === 'object' && s.streak !== null,
  'streak كائن — الشاشة لازم تقرا streak.current مش streak',
);

ok(
  typeof s.streak?.current === 'number',
  'streak.current هو الرقم الفعلي',
);

console.log('\n═══ 4. الأوسمة ═══');

const ach = await call('GET', '/achievements', { token });
ok(ach.status === 200, '/achievements بيرد', `HTTP ${ach.status}`);
ok(typeof ach.body?.total === 'number', 'الإجمالي رقم');
ok(typeof ach.body?.unlocked === 'number', 'المفتوح رقم');
ok(Array.isArray(ach.body?.achievements), 'القايمة مصفوفة');
ok(
  ach.body?.unlocked <= ach.body?.total,
  'المفتوح ما يزيدش عن الإجمالي (أرقام متسقة)',
);

console.log(`\n  ✅ ${pass} نجح   ❌ ${fail} فشل\n`);
process.exit(fail === 0 ? 0 : 1);
