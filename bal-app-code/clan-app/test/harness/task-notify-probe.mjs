/**
 * إثبات صريح: المهمة المجدولة → الإشعار → الرد → رد الـ AI
 *
 * بيعمل مهمة بوقت محدد (من كذا لكذا)، بيشغّل جوب الاطمئنان
 * **فعلياً** (نفس الدالة اللي الوركر بيناديها)، وبيتأكد إن:
 *   1. الإشعار اتولّد بالنص الصح
 *   2. المستخدم يقدر يرد عليه
 *   3. الرد بيرجع من السيرفر
 *   4. مافيش تكرار لو الجوب اشتغل مرتين
 */
/** ️ لازم قبل أي استيراد يلمس config/env.js */
process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/t';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.JWT_ACCESS_SECRET ??= 'harness-access-secret-long-enough-0000';
process.env.JWT_REFRESH_SECRET ??= 'harness-refresh-secret-long-enough-11';
process.env.NODE_ENV ??= 'development';
process.env.LOG_LEVEL ??= 'silent';
process.env.ENABLE_EMAIL_AUTH = 'true';

const { resolveTaskEnd, localHourToUtc } = await import('../../src/utils/taskTiming.js');

/**
 * ️ بنشغّل السيرفر **جوه العملية دي**.
 *
 *    المحاكاة بتخزّن في ذاكرة العملية، فلو ضربنا سيرفر برة
 *    هنكون بنكتب في ذاكرة ونقرا من تانية — والجوب هيقول
 *    TASK_NOT_FOUND عن مهمة اتعملت فعلاً. قِسناها.
 */
process.env.PORT = '4101';
const app = (await import('../../src/app.js')).default;
const server = app.listen(4101, '127.0.0.1');
await new Promise((r) => server.once('listening', r));

const B = 'http://127.0.0.1:4101', API = B + '/api';
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

console.log('\n═══ المهمة المجدولة والإشعار ═══\n');

const reg = await c('POST', '/auth/register', {
  body: { username: 'ن_' + u(), email: `n_${u()}@bal.app`, password: 'Passw0rd!23', domain: 'TECH' },
});
const token = reg.b.accessToken;
await c('POST', '/auth/onboarding', { token, body: { domain: 'TECH', interests: ['TECH'] } });

// ── 1) مهمة مجدولة: من 15:00 لـ 17:00 النهاردة ──
const today = new Date();
const day = today.toISOString().slice(0, 10);

const task = await c('POST', '/tasks', {
  token,
  body: {
    title: 'مذاكرة من 3 لـ 5',
    priority: 'GROWTH',
    dueDate: `${day}T17:00:00.000Z`,
  },
});
const taskId = task.b?.task?.id;
ok(!!taskId, 'المهمة المجدولة اتعملت', `HTTP ${task.s}`);

// ── 2) حساب معاد الاطمئنان — نفس منطق التطبيق ──
const end = resolveTaskEnd({
  slotDate: new Date(`${day}T00:00:00.000Z`),
  startTime: '15:00',
  endTime: '17:00',
});
ok(
  end?.toISOString() === `${day}T17:00:00.000Z`,
  `معاد الاطمئنان = نهاية المهمة (${end?.toISOString().slice(11, 16)})`,
);

const cairo9pm = localHourToUtc(day, 'Africa/Cairo', 21);
ok(
  cairo9pm.toISOString().slice(11, 16) === '18:00',
  'مهمة الجبل بتتسأل 9م بتوقيت القاهرة (18:00 UTC)',
  cairo9pm.toISOString(),
);

// ── 3) تشغيل جوب الاطمئنان فعلياً ──
const { executeCheckIn, CHECKIN_REASONS } = await import('../../src/services/taskCheckIn.service.js');

const run = await executeCheckIn(taskId, CHECKIN_REASONS.SCHEDULE_END);
ok(!!run?.notificationId, 'الجوب ولّد إشعار', JSON.stringify(run).slice(0, 80));
ok(
  run?.source === 'AI' || run?.source === 'SYSTEM',
  `مصدر السؤال واضح (${run?.source})`,
);

// ── 4) الإشعار وصل للمستخدم؟ ──
const notifs = await c('GET', '/notifications', { token });
const mine = (notifs.b?.notifications ?? []).find((n) => n.id === run?.notificationId);
ok(!!mine, 'الإشعار ظهر في قائمة المستخدم');
ok(mine?.data?.canReply === true, 'الإشعار بيقبل رد (بوب-أب)');
ok(
  typeof mine?.body === 'string' && mine.body.length > 10,
  'السؤال فيه نص حقيقي',
  mine?.body?.slice(0, 60),
);

// ── 5) منع التكرار ──
const again = await executeCheckIn(taskId, CHECKIN_REASONS.SCHEDULE_END);
ok(again?.skipped === 'ALREADY_CHECKED', 'تشغيل تاني → مفيش تكرار', JSON.stringify(again));

// ── 6) المستخدم يرد → الـ AI يرد ──
if (run?.notificationId) {
  const reply = await c('POST', `/notifications/${run.notificationId}/reply`, {
    token, body: { text: 'خلصت المذاكرة بس اتشتت في الآخر' },
  });
  ok(reply.s === 200, 'الرد اتقبل', `HTTP ${reply.s}`);
  ok(!!reply.b?.reply, 'السيرفر رجّع رد');
  ok(
    reply.b?.source === 'AI' || reply.b?.source === 'SYSTEM',
    `مصدر الرد معلن (${reply.b?.source})`,
  );

  // الخيط اتحفظ؟
  const thread = await c('GET', `/notifications/${run.notificationId}/thread`, { token });
  const msgs = thread.b?.messages ?? [];
  ok(msgs.length >= 2, `المحادثة اتحفظت (${msgs.length} رسالة)`);
  ok(
    msgs.some((m) => m.sender === 'user' && m.text.includes('اتشتت')),
    'كلام المستخدم محفوظ بالنص',
  );
}

console.log(`\n  ✅ ${pass} نجح   ❌ ${fail} فشل\n`);
server.close();
process.exit(fail ? 1 : 0);
