/**
 * ═══════════════════════════════════════════════════════════
 *  فحص صدق الإشعارات — بالتشغيل مش بالقراية
 *
 *  ️ الباج اللي بيثبت إنه اتصلح:
 *
 *  `dispatchToSingleDevice` كان بيرجّع `success: true` لما
 *  `FIREBASE_SERVICE_ACCOUNT` مش متظبط، ويسجّل «تم إرسال الإشعار
 *  بنجاح في بيئة التطوير». النتيجة إن `dispatchToUserDevices`
 *  كان بيعدّها إرسال ناجح، و`dispatchToFCM` كان بيكتب
 *  `pushSent: true` في قاعدة البيانات.
 *
 *  يعني النظام كان بيكتب في سجلّه إن الإشعار اتبعت، وهو ما
 *  بعتش أي حاجة. ده أسوأ من العطل الصريح: مفيش أي طريقة تعرف
 *  إن المنبه مش هيرنّ غير إن مستخدم حقيقي ينام ويفوته الميعاد.
 *
 *  التشغيل:
 *    node --import ./test/harness/setup.mjs test/harness/push-probe.mjs
 * ═══════════════════════════════════════════════════════════
 */
process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/t';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.JWT_ACCESS_SECRET ??= 'harness-access-secret-long-enough-0000';
process.env.JWT_REFRESH_SECRET ??= 'harness-refresh-secret-long-enough-11';
process.env.LOG_LEVEL ??= 'silent';
process.env.NODE_ENV = 'development';
//  الحالة الافتراضية للمطوّر: مفيش اعتماد Firebase
delete process.env.FIREBASE_SERVICE_ACCOUNT;

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

const push = await import('../../src/services/pushDispatcher.service.js');
const prisma = (await import('../../src/config/prisma.js')).default;

console.log('\n═══ 1. الإعداد الناقص بيتقال بصراحة ═══');

ok(
  push.isPushConfigured() === false,
  'isPushConfigured بيرجّع false بلا اعتماد',
);

const single = await push.dispatchToSingleDevice(
  { fcmToken: 'fake-token-for-probe-0123456789', platform: 'ANDROID' },
  { title: 'اختبار', body: 'جسم', type: 'ALARM' },
);

ok(
  single.success === false,
  'الإرسال بلا اعتماد بيرجّع success: false',
  `رجّع ${JSON.stringify(single)}`,
);
ok(
  single.reason === 'PUSH_NOT_CONFIGURED',
  'السبب صريح: PUSH_NOT_CONFIGURED',
  `رجّع ${single.reason}`,
);
ok(
  single.delivered === false,
  'delivered: false — مفيش ادّعاء بالتسليم',
);

console.log('\n═══ 2. سجلّ قاعدة البيانات ما بيتلوّثش ═══');

/**
 * ️ ده بيت القصيد: النسخة القديمة كانت بتوصل هنا بـ sent > 0
 *    فتكتب pushSent: true على إشعار ما اتبعتش.
 */
const user = await prisma.user.create({
  data: {
    username: `push_probe_${Math.random().toString(36).slice(2, 8)}`,
    email: `push_${Math.random().toString(36).slice(2, 8)}@bal.app`,
    password: 'x',
    domain: 'TECH',
    onboarded: true,
  },
});

await prisma.device.create({
  data: {
    userId: user.id,
    fcmToken: `probe-token-${Math.random().toString(36).slice(2, 10)}`,
    platform: 'ANDROID',
  },
});

const many = await push.dispatchToUserDevices(user.id, {
  title: 'منبه',
  body: 'قوم يا بطل',
  type: 'ALARM',
});

ok(many.totalDevices === 1, 'الجهاز المسجّل اتلقى', `${many.totalDevices}`);
ok(
  many.sent === 0,
  'sent = 0 — مفيش ادّعاء بإرسال حصل',
  `رجّع sent=${many.sent}`,
);
ok(
  many.suppressed === 1,
  'suppressed = 1 — الإرسال اتمنع لنقص الإعداد',
  `رجّع ${many.suppressed}`,
);
ok(
  many.reason === 'PUSH_NOT_CONFIGURED',
  'السبب بيوصل للطبقة اللي فوق',
);
ok(many.configured === false, 'configured: false');

console.log('\n═══ 3. مفيش أجهزة ≠ اتبعت ═══');

const lonely = await prisma.user.create({
  data: {
    username: `nodev_${Math.random().toString(36).slice(2, 8)}`,
    email: `nodev_${Math.random().toString(36).slice(2, 8)}@bal.app`,
    password: 'x',
    domain: 'TECH',
    onboarded: true,
  },
});

const none = await push.dispatchToUserDevices(lonely.id, {
  title: 'ت',
  body: 'ت',
  type: 'ALARM',
});

ok(none.sent === 0 && none.totalDevices === 0, 'مفيش أجهزة → sent = 0');
ok(none.reason === 'NO_DEVICES', 'السبب: NO_DEVICES مش صمت');

console.log('\n═══ 4. الإشعار ما يتعلّمش pushSent ═══');

const notificationService = await import(
  '../../src/services/notification.service.js'
);

const created = await prisma.notification.create({
  data: {
    userId: user.id,
    type: 'ALARM',
    title: 'منبه',
    body: 'قوم',
    data: {},
    pushSent: false,
  },
});

await notificationService.dispatchToFCM({
  notificationId: created.id,
  userId: user.id,
  title: 'منبه',
  body: 'قوم',
  type: 'ALARM',
  data: {},
});

const after = await prisma.notification.findUnique({
  where: { id: created.id },
});

ok(
  after?.pushSent === false,
  'pushSent فضل false — السجلّ صادق',
  `رجّع pushSent=${after?.pushSent}`,
);

console.log(`\n  ✅ ${pass} نجح   ❌ ${fail} فشل\n`);
process.exit(fail === 0 ? 0 : 1);
