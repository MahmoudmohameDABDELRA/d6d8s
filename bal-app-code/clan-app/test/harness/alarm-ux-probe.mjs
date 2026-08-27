/**
 * فحص المنبه + سلاسة التصفح + الكماليات. فحص فقط.
 */
process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/t';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.JWT_ACCESS_SECRET ??= 'harness-access-secret-long-enough-0000';
process.env.JWT_REFRESH_SECRET ??= 'harness-refresh-secret-long-enough-11';
process.env.NODE_ENV ??= 'development';
process.env.LOG_LEVEL ??= 'silent';
process.env.ENABLE_EMAIL_AUTH = 'true';
process.env.PORT = '4104';

const app = (await import('../../src/app.js')).default;
const server = app.listen(4104, '127.0.0.1');
await new Promise((r) => server.once('listening', r));

const API = 'http://127.0.0.1:4104/api';
const c = async (m, p, o = {}) => {
  const r = await fetch(API + p, {
    method: m,
    headers: { 'Content-Type': 'application/json', ...(o.token ? { Authorization: 'Bearer ' + o.token } : {}) },
    ...(o.body ? { body: JSON.stringify(o.body) } : {}),
  });
  return { s: r.status, b: await r.json().catch(() => null) };
};
const u = () => Math.random().toString(36).slice(2, 8);
const note = (i, l, d = '') => console.log(`  ${i} ${l}${d ? ' — ' + d : ''}`);

const reg = await c('POST', '/auth/register', {
  body: { username: 'م_' + u(), email: `a_${u()}@bal.app`, password: 'Passw0rd!23', domain: 'TECH' },
});
const token = reg.b.accessToken;
await c('POST', '/auth/onboarding', { token, body: { domain: 'TECH', interests: ['TECH'] } });

console.log('\n═══ المنبه ═══\n');

// ── إنشاء ──
const create = await c('POST', '/alarms', { token, body: { time: '06:30', days: [0, 1, 2, 3, 4], requireProof: true } });
note(create.s === 201 ? '✅' : '🔴', `إنشاء منبه → ${create.s}`);
const alarmId = create.b?.alarm?.id;

// ── القائمة بتوقيت المستخدم ──
const list = await c('GET', '/alarms', { token });
note(list.s === 200 ? '✅' : '🔴', `القائمة → ${list.s}`, `الوقت المحلي: ${list.b?.localTime}`);
note(
  typeof list.b?.todayWeekday === 'number' ? '✅' : '🔴',
  `اليوم الحالي محسوب (${list.b?.todayWeekday})`,
);

// ── مهمة الصحيان: التوقيع والتحقق ──
const wake = await c('GET', '/alarms/wake-task', { token });
const q = wake.b?.task?.question;
const tok = wake.b?.task?.token;
note(!!q && !!tok ? '✅' : '🔴', `المسألة: ${q}`);
note(!/=\s*\d+/.test(String(tok)) ? '✅' : '🔴', 'الإجابة مش ظاهرة في الـ token');

// إجابة غلط
const wrong = await c('POST', '/alarms/wake-task/solve', {
  token, body: { token: tok, answer: 999999, scheduledTime: '06:30', alarmId },
});
note(wrong.s === 400 ? '✅' : '🔴', `إجابة غلط مرفوضة → ${wrong.s}`);

// إجابة صح
const m = String(q).match(/(\d+)\s*([+\-×*])\s*(\d+)/);
let right = null;
if (m) {
  const [, a, op, b] = m;
  right = op === '+' ? +a + +b : op === '-' ? +a - +b : +a * +b;
}
const solve = await c('POST', '/alarms/wake-task/solve', {
  token, body: { token: tok, answer: right, scheduledTime: '06:30', alarmId },
});
note(solve.s === 200 ? '✅' : '🔴', `إجابة صح مقبولة → ${solve.s}`, JSON.stringify(solve.b).slice(0, 70));

// token معدّل
const tampered = await c('POST', '/alarms/wake-task/solve', {
  token, body: { token: tok + 'x', answer: right, scheduledTime: '06:30', alarmId },
});
note(tampered.s === 400 ? '✅' : '🔴', `token معدّل مرفوض → ${tampered.s}`);

// ── الغفوة ──
const snooze = await c('POST', '/alarms/snooze', { token, body: { alarmId, scheduledTime: '06:30' } });
note(
  [200, 502, 503].includes(snooze.s) ? '✅' : '🔴',
  `الغفوة → ${snooze.s}`,
  snooze.s !== 200 ? 'محتاجة AI (رفض صريح)' : '',
);

// ── الحدود ──
const dup = await c('POST', '/alarms', { token, body: { time: '06:30', days: [0], requireProof: true } });
note(dup.s === 409 ? '✅' : '⚠️', `منبه مكرر → ${dup.s}`);

const badTime = await c('POST', '/alarms', { token, body: { time: '99:99', days: [0] } });
note(badTime.s === 400 ? '✅' : '🔴', `وقت غلط مرفوض → ${badTime.s}`);

const noDays = await c('POST', '/alarms', { token, body: { time: '07:00', days: [] } });
note(noDays.s === 400 ? '✅' : '🔴', `بلا أيام مرفوض → ${noDays.s}`);

// ── التاريخ والتحديات ──
const hist = await c('GET', '/alarms/history', { token });
note(hist.s === 200 ? '✅' : '🔴', `تاريخ الاستيقاظ → ${hist.s}`);
const chal = await c('GET', '/alarms/challenges', { token });
note(chal.s === 200 ? '✅' : '🔴', `تحديات الصحيان → ${chal.s}`);

// ── إيه اللي التطبيق بيستخدمه من دول؟ ──
console.log('\n── الواجهة بتستخدم كام نقطة؟ ──');
const { readFileSync } = await import('node:fs');
const endpoints = readFileSync(new URL('../../bal_app/lib/core/network/api_endpoints.dart', import.meta.url), 'utf8');
const alarmsScreen = readFileSync(new URL('../../bal_app/lib/screens/alarm/alarms_screen.dart', import.meta.url), 'utf8');
const wakeScreen = readFileSync(new URL('../../bal_app/lib/screens/alarm/wake_task_screen.dart', import.meta.url), 'utf8');
const all = alarmsScreen + wakeScreen;

for (const [name, ep] of [
  ['قائمة/إنشاء', 'alarms'], ['مهمة الصحيان', 'wakeTask'], ['حل المهمة', 'wakeTaskSolve'],
  ['الغفوة', 'alarmSnooze'], ['التاريخ', 'alarmHistory'], ['الفوّت', 'alarmMissed'],
]) {
  const used = new RegExp(`ApiEndpoints\\.${ep}\\b`).test(all);
  note(used ? '✅' : '⚠️', `${name} (${ep})`, used ? '' : 'مش مستخدم في الواجهة');
}

/** ️ المنبه بيرن إزاي والتطبيق مقفول؟ */
const push = /firebase|fcm|local_notifications|flutter_local/i.test(
  readFileSync(new URL('../../bal_app/pubspec.yaml', import.meta.url), 'utf8'),
);
note(push ? '✅' : '🔴', 'حزمة إشعارات النظام', push ? '' : 'المنبه مش هيرن والتطبيق مقفول');

console.log('\n');
server.close();
process.exit(0);
