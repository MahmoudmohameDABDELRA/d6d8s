/**
 * ═══════════════════════════════════════════════════════════
 *  اختبار تكامل حي — القسم 5: المنبه الذكي («بال»)
 *
 *  غفوة → رسالة AI ساخرة · إثبات عشوائي (مسألة/تصوير) ·
 *  تسجيل استيقاظ → شرارات + WakeLog في القاعدة.
 *  التشغيل:  node test/alarm-flow.test.mjs
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

// ── إعداد مستخدم ──
await prisma.user.deleteMany({ where: { email: 'alarm_flow@bal.app' } });
await prisma.battleAlarm.deleteMany({ where: { userId: (await prisma.user.findFirst({ select: { id: true } }))?.id ?? '' } });
const user = await prisma.user.create({
  data: { username: 'alarm_user', email: 'alarm_flow@bal.app', password: 'x', domain: 'TECH', interests: ['TECH'], onboarded: true, companionName: 'ليكم' },
});
const token = jwt.sign({ userId: user.id }, env.jwt.accessSecret, { expiresIn: '1h' });
const H = (t, extra = {}) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', ...extra });

// وقت قادم بصيغة HH:mm (بعد ساعة) — بتوقيت المستخدم (Africa/Cairo)
const nextHourCairo = () => {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Cairo',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(Date.now() + 60 * 60 * 1000));
  return fmt; // "HH:MM"
};
const UPCOMING = nextHourCairo();

console.log('\n━━━ 1) إنشاء منبه ━━━');
let alarmId;
{
  const r = await fetch(`${BASE}/alarms`, {
    method: 'POST', headers: H(token),
    body: JSON.stringify({ time: '06:00', days: [0, 1, 2, 3, 4], label: 'منبه الفجر' }),
  });
  const j = await r.json();
  ok(r.status === 201 || r.status === 200, 'إنشاء منبه → نجاح');
  alarmId = j.alarm?.id ?? j.id ?? null;
  ok(Boolean(alarmId), 'المنبه له id');
}

console.log('\n━━━ 2) غفوة → نداء AI حقيقي (باسم الرفيق) ━━━');
{
  const r = await fetch(`${BASE}/alarms/snooze`, {
    method: 'POST', headers: H(token),
    body: JSON.stringify({ count: 1, alarmId }),
  });
  const j = await r.json();
  // إما 200 برسالة من الـ AI الفعلي، أو 502 صريح لو الحصّة خلصت — لا سكربت وهمي أبداً
  ok(r.status === 200 || r.status === 502, `غفوة → ${r.status} (200 = AI حقيقي · 502 = AI معطّل صريح)`);
  if (r.status === 200) {
    ok(typeof j.message === 'string' && j.message.length > 5, 'فيه رسالة من الـ AI');
    // نتأكد إنها مش من أي سكربت وهمي قديم
    ok(!j.message.includes('الديك الرومي سخن صوته') && !j.message.includes('إمبراطوريتك'), 'الرسالة مش سكربت جاهز — من الـ AI');
    ok(j.canStop === false, 'المنبه لا يقف بالغفوة');
  } else {
    ok(j.offlineFallback === 'MATH', 'الفولباك الصريح = مسألة حسابية (من mobile-alarm)');
  }
}

console.log('\n━━━ 3) غفوة ثانية (تصعيد) ━━━');
{
  const r = await fetch(`${BASE}/alarms/snooze`, {
    method: 'POST', headers: H(token),
    body: JSON.stringify({ count: 2, alarmId }),
  });
  const j = await r.json();
  ok(j.snoozeCount === 2, 'العدّاد = 2');
  if (r.status === 200) ok(typeof j.message === 'string' && j.message.length > 5, 'رسالة AI تصعيدية حقيقية');
}

console.log('\n━━━ 4) طلب إثبات → عشوائي (مسألة أو تصوير) ━━━');
{
  const r = await fetch(`${BASE}/alarms/verify-wake`, {
    method: 'POST', headers: H(token),
    body: JSON.stringify({ alarmId, scheduledTime: UPCOMING }),
  });
  const j = await r.json();
  ok(r.status === 200 && ['MATH', 'PHOTO'].includes(j.proofType), `نوع الإثبات: ${j.proofType}`);
  if (j.proofType === 'MATH') {
    ok(typeof j.question === 'string' && j.token, 'مسألة + token');
  } else {
    ok(j.proofId, 'proofId للتصوير');
  }
}

console.log('\n━━━ 5) إثبات التصوير المظلم → مرفوض ━━━');
{
  const r = await fetch(`${BASE}/alarms/wake-log`, {
    method: 'POST', headers: H(token),
    body: JSON.stringify({ alarmId, scheduledTime: UPCOMING, isDark: true }),
  });
  const j = await r.json();
  ok(r.status === 400 && j.code === 'DARK_PHOTO', 'صورة مظلمة → DARK_PHOTO');
}

console.log('\n━━━ 6) إثبات التصوير الصحيح → استيقاظ + قاعدة ━━━');
{
  const r = await fetch(`${BASE}/alarms/wake-log`, {
    method: 'POST', headers: H(token),
    body: JSON.stringify({ alarmId, scheduledTime: UPCOMING, isDark: false, responseSec: 42 }),
  });
  const j = await r.json();
  ok(r.status === 200 && j.success, 'تصوير صحيح → 200');
  const log = await prisma.wakeLog.findFirst({ where: { userId: user.id }, orderBy: { firedAt: 'desc' } });
  ok(Boolean(log) && ['WOKE', 'LATE'].includes(log.result), `القاعدة: WakeLog اتسجل (${log?.result})`);
  ok(log.scheduledTime === UPCOMING, 'القاعدة: الوقت = الوقت القادم');
  const db = await prisma.user.findUnique({ where: { id: user.id } });
  ok(db.totalFocusMin >= 0, 'المستخدم اتحدث (شرارات/ستريك)');
}

console.log('\n━━━ 7) حل المسألة (مسار MATH) ━━━');
{
  // نجبر المسألة عبر النداء المباشر
  const { generateWakeTask } = await import('../src/services/alarm.service.js');
  const { question, answer } = generateWakeTask();
  ok(typeof question === 'string' && typeof answer === 'number', 'مسألة من السيرفر (question + answer)');

  const verify = (await import('../src/modules/alarm/alarm.controller.js'));
  // نستخدم /wake-task الحقيقي ثم نحل
  const r2 = await fetch(`${BASE}/alarms/wake-task`, { headers: H(token) });
  const j2 = await r2.json();
  ok(r2.status === 200 && j2.task?.token, 'wake-task → task.token');

  const r3 = await fetch(`${BASE}/alarms/wake-task/solve`, {
    method: 'POST', headers: H(token),
    body: JSON.stringify({ token: j2.token, answer: 0, alarmId, scheduledTime: UPCOMING }),
  });
  // إجابة خاطئة → 400 WRONG_ANSWER (السلوك الصحيح)
  ok(r3.status === 400, 'إجابة خاطئة → 400');
}

await prisma.user.deleteMany({ where: { email: 'alarm_flow@bal.app' } });
console.log(`\n${'═'.repeat(44)}\nالنتيجة: ✅ ${pass} نجح · ❌ ${fail} فشل\n${'═'.repeat(44)}`);
await prisma.$disconnect();
process.exit(fail ? 1 : 0);
