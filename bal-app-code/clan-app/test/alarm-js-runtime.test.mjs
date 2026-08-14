/**
 * ════════════════════════════════════════════════════════════
 *  اختبار طبقة JS فعلياً — بوحدات أصلية مزيفة
 * ════════════════════════════════════════════════════════════
 *
 *  لا أستطيع تشغيل Kotlin أو Swift هنا.
 *  لكن أستطيع تشغيل clanAlarm.js نفسه، بمحاكاة كاملة
 *  للوحدة الأصلية، على المنصتين — والتحقق من أن:
 *
 *    · كل نداء يذهب للمنصة الصحيحة
 *    · لا نداء لدالة غير موجودة على تلك المنصة
 *    · التحقق من المدخلات يرفض القيم الفاسدة
 *    · التدهور اللطيف يعمل حين تكون الوحدة غير مبنية
 *
 *  شغّله:  node --test test/alarm-js-runtime.test.mjs
 */

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, '..', 'mobile-alarm', 'js', 'clanAlarm.js');

// ════════════════════════════════════════════════
//  محاكاة react-native
// ════════════════════════════════════════════════

/** سجل كل نداء تم لأي دالة أصلية */
let callLog = [];

/** الدوال الموجودة فعلاً في كل وحدة أصلية — مستخرجة من الكود الحقيقي */
const ANDROID_METHODS = [
  'addListener', 'removeListeners', 'dismissRinging', 'getDiagnostics',
  'getRingingAlarm', 'getScheduledAlarms', 'openBatteryOptimizationSettings',
  'openExactAlarmSettings', 'openFullScreenIntentSettings',
  'openNotificationSettings', 'openOemAutoStartSettings', 'removeAlarm',
  'rescheduleAll', 'setAlarm', 'setVolumeBoost', 'snoozeRinging',
  'syncAlarms', 'testFireIn',
];

const IOS_METHODS = [
  'getCapabilities', 'requestAuthorization', 'getAuthorizationStatus',
  'setAlarm', 'removeAlarm', 'removeAllAlarms', 'consumePendingChallenge',
  'getScheduledAlarms', 'testFireIn',
];

const ANDROID_DIAGNOSTICS = {
  platform: 'android', sdkInt: 34, manufacturer: 'Xiaomi', model: 'Redmi Note 13',
  canScheduleExactAlarms: true, canUseFullScreenIntent: true,
  notificationsEnabled: true, channelNotMuted: true,
  ignoringBatteryOptimizations: false, aggressiveOem: true,
  lastRescheduleAt: 0, scheduledCount: 2, volumeBoost: true, guaranteed: false,
};

const IOS_CAPABILITIES = {
  platform: 'ios', systemVersion: '26.1', strategy: 'ALARMKIT',
  bypassSilent: true, unlimitedSound: true, fullScreen: true,
  survivesRestart: true, maxAlarms: -1,
};

/**
 * تبني وحدة أصلية مزيفة.
 * أي نداء لدالة غير مدرجة = خطأ فوري (هذا هو بيت القصيد).
 */
function makeNativeModule(name, allowedMethods, responses) {
  const mod = {};
  for (const m of allowedMethods) {
    mod[m] = (...args) => {
      callLog.push({ module: name, method: m, args });
      const r = responses[m];
      return Promise.resolve(typeof r === 'function' ? r(...args) : r);
    };
  }
  // فخّ: أي دالة غير موجودة
  return new Proxy(mod, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (typeof prop === 'symbol') return undefined;
      if (['then', 'catch', 'constructor'].includes(prop)) return undefined;
      throw new Error(
        `❌ نداء لدالة غير موجودة: ${name}.${String(prop)}() — ستنهار على الجهاز`,
      );
    },
  });
}

/** يحمّل clanAlarm.js بمنصة محددة */
function loadModule(platform) {
  callLog = [];

  const androidNative = makeNativeModule('ClanAlarm', ANDROID_METHODS, {
    getDiagnostics: () => ({ ...ANDROID_DIAGNOSTICS }),
    setAlarm: () => ({ success: true, nextTriggerAt: Date.now() + 3600e3, exact: true }),
    syncAlarms: (list) => ({ scheduled: list.length, total: list.length }),
    rescheduleAll: () => 3,
    removeAlarm: () => true,
    getScheduledAlarms: () => [],
    getRingingAlarm: () => ({ isRinging: false, alarmId: null }),
    dismissRinging: () => true,
    snoozeRinging: () => true,
    setVolumeBoost: () => true,
    testFireIn: (s) => Date.now() + s * 1000,
    openExactAlarmSettings: () => true,
    openFullScreenIntentSettings: () => true,
    openBatteryOptimizationSettings: () => true,
    openNotificationSettings: () => true,
    openOemAutoStartSettings: () => true,
  });

  const iosNative = makeNativeModule('ClanAlarmBridge', IOS_METHODS, {
    getCapabilities: () => ({ ...IOS_CAPABILITIES }),
    requestAuthorization: () => ({ granted: true, status: 'authorized', strategy: 'ALARMKIT' }),
    getAuthorizationStatus: () => ({ status: 'authorized', strategy: 'ALARMKIT' }),
    setAlarm: () => ({ success: true, strategy: 'ALARMKIT', nativeIds: ['uuid-1'] }),
    removeAlarm: () => true,
    removeAllAlarms: () => true,
    consumePendingChallenge: () => null,
    getScheduledAlarms: () => [],
    testFireIn: () => true,
  });

  const rnMock = {
    Platform: { OS: platform, Version: platform === 'android' ? 34 : '26.1' },
    NativeModules: { ClanAlarm: androidNative, ClanAlarmBridge: iosNative },
    NativeEventEmitter: class {
      constructor() {}
      addListener() { return { remove() {} }; }
    },
    PermissionsAndroid: {
      PERMISSIONS: { POST_NOTIFICATIONS: 'android.permission.POST_NOTIFICATIONS' },
      RESULTS: { GRANTED: 'granted' },
      request: async () => 'granted',
    },
  };

  // نحوّل ESM إلى CJS بأبسط شكل ونحقن react-native
  let src = fs.readFileSync(SRC, 'utf8');
  src = src.replace(
    /import\s*\{([^}]+)\}\s*from\s*'react-native';/,
    'const {$1} = __RN__;',
  );
  src = src.replace(/export const (\w+)/g, 'const $1 = __exports__.$1');
  src = src.replace(/export default \{[\s\S]*?\};?\s*$/, '');
  src = src.replace(/__DEV__/g, 'false');

  const __exports__ = {};
  const fn = new Function('__RN__', '__exports__', 'require', src);
  fn(rnMock, __exports__, (name) => {
    if (name === 'react-native') return rnMock;
    throw new Error(`require غير متوقع: ${name}`);
  });

  return __exports__;
}

const calls = (method) => callLog.filter((c) => c.method === method);
const lastCall = () => callLog[callLog.length - 1];

// ════════════════════════════════════════════════
//  1. أندرويد
// ════════════════════════════════════════════════

test('[أندرويد] setAlarm يستدعي الوحدة الصحيحة', async () => {
  const m = loadModule('android');

  const r = await m.setAlarm({
    id: 'a1', hour: 6, minute: 30, weekdays: [0, 1, 2, 3, 4], label: 'الفجر',
  });

  assert.equal(r.success, true);
  const c = calls('setAlarm');
  assert.equal(c.length, 1);
  assert.equal(c[0].module, 'ClanAlarm');
  // أندرويد يستقبل كائناً واحداً
  assert.equal(typeof c[0].args[0], 'object');
  assert.equal(c[0].args[0].id, 'a1');
  assert.equal(c[0].args[0].hour, 6);
});

test('[أندرويد] القيم الافتراضية تُملأ', async () => {
  const m = loadModule('android');
  await m.setAlarm({ id: 'a2', hour: 7, minute: 0, weekdays: [1] });

  const arg = calls('setAlarm')[0].args[0];
  assert.equal(arg.label, 'منبه العشيرة');
  assert.equal(arg.enabled, true);
  assert.equal(arg.snoozeMinutes, 0);
  assert.equal(arg.requireChallenge, true);
});

test('[أندرويد] getIssues يقرأ التشخيص ويرتّب بالخطورة', async () => {
  const m = loadModule('android');
  const issues = await m.getIssues();

  // بيئتنا المزيفة: البطارية غير مستثناة + جهاز شاومي
  const keys = issues.map((i) => i.key);
  assert.ok(keys.includes('battery'), 'لم يكتشف مشكلة البطارية');
  assert.ok(keys.includes('oem_autostart'), 'لم يكتشف جهاز شاومي');

  // الترتيب: high قبل medium
  const sev = issues.map((i) => i.severity);
  const order = { fatal: 0, high: 1, medium: 2, low: 3 };
  for (let i = 1; i < sev.length; i++) {
    assert.ok(order[sev[i - 1]] <= order[sev[i]], 'الترتيب بالخطورة مكسور');
  }
});

test('[أندرويد] كل مشكلة لها زر إصلاح يعمل', async () => {
  const m = loadModule('android');
  const issues = await m.getIssues();

  for (const issue of issues) {
    if (!issue.fix) continue;
    // لو نادى دالة غير موجودة، الـ Proxy سيرمي
    await assert.doesNotReject(
      async () => issue.fix(),
      `زر إصلاح "${issue.key}" ينادي دالة غير موجودة`,
    );
  }
});

test('[أندرويد] syncAlarms يمرّر قائمة موثّقة', async () => {
  const m = loadModule('android');

  await m.syncAlarms([
    { id: 'x', hour: 5, minute: 0, weekdays: [0] },
    { id: 'y', hour: 6, minute: 0, weekdays: [1, 2] },
  ]);

  const c = calls('syncAlarms')[0];
  assert.equal(c.args[0].length, 2);
  assert.equal(c.args[0][0].id, 'x');
});

test('[أندرويد] rescheduleAll يصل للوحدة', async () => {
  const m = loadModule('android');
  const n = await m.rescheduleAll();
  assert.equal(n, 3);
  assert.equal(calls('rescheduleAll').length, 1);
});

test('[أندرويد] getPendingChallenge يسأل عن الحالة', async () => {
  const m = loadModule('android');
  const p = await m.getPendingChallenge();
  assert.equal(p, null);
  assert.equal(calls('getRingingAlarm').length, 1);
});

test('[أندرويد] dismissAlarm يمرّر المعرّف كنص', async () => {
  const m = loadModule('android');
  await m.dismissAlarm(12345);
  assert.equal(calls('dismissRinging')[0].args[0], '12345');
});

test('[أندرويد] لا نداء لأي دالة iOS', async () => {
  const m = loadModule('android');

  await m.setAlarm({ id: 'a', hour: 6, minute: 0, weekdays: [1] });
  await m.getIssues();
  await m.getCapabilities();
  await m.getPendingChallenge();
  await m.rescheduleAll();
  await m.dismissAlarm('a');
  await m.snoozeAlarm('a');
  await m.removeAlarm('a');
  await m.getScheduledAlarms();
  await m.setVolumeBoost(true);
  await m.testAlarm(5);

  const iosOnly = ['consumePendingChallenge', 'removeAllAlarms', 'getCapabilities'];
  for (const c of callLog) {
    assert.ok(
      !(c.module === 'ClanAlarmBridge'),
      `نودي على وحدة iOS من أندرويد: ${c.method}`,
    );
    assert.ok(
      !iosOnly.includes(c.method) || c.module === 'ClanAlarmBridge',
      `دالة iOS نوديت على أندرويد: ${c.method}`,
    );
  }
});

// ════════════════════════════════════════════════
//  2. iOS
// ════════════════════════════════════════════════

test('[iOS] setAlarm يمرّر وسائط منفصلة بالترتيب الصحيح', async () => {
  const m = loadModule('ios');

  await m.setAlarm({
    id: 'i1', hour: 6, minute: 30, weekdays: [0, 1], label: 'صباح', snoozeMinutes: 9,
  });

  const c = calls('setAlarm')[0];
  assert.equal(c.module, 'ClanAlarmBridge');

  // الترتيب يجب أن يطابق RCT_EXTERN_METHOD حرفياً:
  // alarmId, hour, minute, weekdays, label, snoozeMinutes
  assert.equal(c.args[0], 'i1');
  assert.equal(c.args[1], 6);
  assert.equal(c.args[2], 30);
  assert.deepEqual(c.args[3], [0, 1]);
  assert.equal(c.args[4], 'صباح');
  assert.equal(c.args[5], 9);
  assert.equal(c.args.length, 6, 'عدد الوسائط لا يطابق الجسر');
});

test('[iOS] منبه معطّل يُحذف بدل جدولته', async () => {
  const m = loadModule('ios');

  const r = await m.setAlarm({
    id: 'i2', hour: 6, minute: 0, weekdays: [1], enabled: false,
  });

  assert.equal(r.disabled, true);
  assert.equal(calls('removeAlarm').length, 1);
  assert.equal(calls('setAlarm').length, 0, 'جدول منبهاً معطّلاً!');
});

test('[iOS] syncAlarms يمسح ثم يجدول', async () => {
  const m = loadModule('ios');

  const r = await m.syncAlarms([
    { id: 'a', hour: 5, minute: 0, weekdays: [0] },
    { id: 'b', hour: 6, minute: 0, weekdays: [1] },
    { id: 'c', hour: 7, minute: 0, weekdays: [2], enabled: false },
  ]);

  // المسح أولاً — وإلا تراكمت المنبهات القديمة
  assert.equal(callLog[0].method, 'removeAllAlarms');
  assert.equal(r.scheduled, 2, 'جدول المنبه المعطّل');
  assert.equal(r.total, 3);
});

test('[iOS] rescheduleAll لا ينادي شيئاً (النظام يتولّاه)', async () => {
  const m = loadModule('ios');
  const r = await m.rescheduleAll();
  assert.equal(r, -1);
  assert.equal(callLog.length, 0, 'نادى دالة لا لزوم لها على iOS');
});

test('[iOS] getPendingChallenge يستهلك المسألة المعلّقة', async () => {
  const m = loadModule('ios');
  await m.getPendingChallenge();
  assert.equal(calls('consumePendingChallenge').length, 1);
  assert.equal(calls('getRingingAlarm').length, 0);
});

test('[iOS] getCapabilities يرجع استراتيجية AlarmKit', async () => {
  const m = loadModule('ios');
  const caps = await m.getCapabilities();
  assert.equal(caps.strategy, 'ALARMKIT');
  assert.equal(caps.bypassSilent, true);
});

test('[iOS] لا نداء لأي دالة أندرويد', async () => {
  const m = loadModule('ios');

  await m.setAlarm({ id: 'a', hour: 6, minute: 0, weekdays: [1] });
  await m.getIssues();
  await m.getCapabilities();
  await m.getPendingChallenge();
  await m.rescheduleAll();
  await m.dismissAlarm('a');
  await m.snoozeAlarm('a');
  await m.removeAlarm('a');
  await m.getScheduledAlarms();
  await m.setVolumeBoost(true);
  await m.testAlarm(5);
  await m.syncAlarms([{ id: 'z', hour: 8, minute: 0, weekdays: [3] }]);

  for (const c of callLog) {
    assert.notEqual(c.module, 'ClanAlarm', `نودي على وحدة أندرويد من iOS: ${c.method}`);
  }
});

test('[iOS] getIssues يحذّر على النظام القديم', async () => {
  // نحمّل بنسخة iOS قديمة
  callLog = [];
  const m = loadModule('ios');

  // نعدّل الرد ليحاكي iOS 18
  IOS_CAPABILITIES.strategy = 'NOTIFICATIONS';
  const m2 = loadModule('ios');
  const issues = await m2.getIssues();
  IOS_CAPABILITIES.strategy = 'ALARMKIT'; // أعِد كما كان

  assert.ok(
    issues.some((i) => i.key === 'ios_old'),
    'لم يحذّر مستخدم iOS القديم من قصور المنبه',
  );
});

// ════════════════════════════════════════════════
//  3. التحقق من المدخلات
// ════════════════════════════════════════════════

const BAD_INPUTS = [
  [{ hour: 6, minute: 0, weekdays: [1] }, 'بلا id'],
  [{ id: 'a', hour: 24, minute: 0, weekdays: [1] }, 'ساعة 24'],
  [{ id: 'a', hour: -1, minute: 0, weekdays: [1] }, 'ساعة سالبة'],
  [{ id: 'a', hour: 6, minute: 60, weekdays: [1] }, 'دقيقة 60'],
  [{ id: 'a', hour: 6, minute: -5, weekdays: [1] }, 'دقيقة سالبة'],
  [{ id: 'a', hour: 6, minute: 0, weekdays: [7] }, 'يوم 7'],
  [{ id: 'a', hour: 6, minute: 0, weekdays: [-1] }, 'يوم -1'],
  [{ id: 'a', hour: 6.5, minute: 0, weekdays: [1] }, 'ساعة عشرية'],
  [{ id: 'a', hour: 'six', minute: 0, weekdays: [1] }, 'ساعة نصية'],
  [null, 'null'],
  [undefined, 'undefined'],
  ['string', 'نص'],
];

for (const [input, name] of BAD_INPUTS) {
  test(`[تحقق] يرفض: ${name}`, async () => {
    for (const platform of ['android', 'ios']) {
      const m = loadModule(platform);
      await assert.rejects(
        async () => m.setAlarm(input),
        `${platform}: قبل مدخلاً فاسداً (${name})`,
      );
      assert.equal(
        calls('setAlarm').length, 0,
        `${platform}: مرّر مدخلاً فاسداً للطبقة الأصلية!`,
      );
    }
  });
}

test('[تحقق] يقبل الحدود الصحيحة', async () => {
  const valid = [
    { id: 'a', hour: 0, minute: 0, weekdays: [0] },
    { id: 'b', hour: 23, minute: 59, weekdays: [6] },
    { id: 'c', hour: 12, minute: 30, weekdays: [0, 1, 2, 3, 4, 5, 6] },
    { id: 'd', hour: 6, minute: 0, weekdays: [] },  // بلا أيام = مسموح، لن يُجدول
  ];

  for (const platform of ['android', 'ios']) {
    for (const v of valid) {
      const m = loadModule(platform);
      await assert.doesNotReject(
        async () => m.setAlarm(v),
        `${platform}: رفض مدخلاً صحيحاً ${JSON.stringify(v)}`,
      );
    }
  }
});

test('[تحقق] id رقمي يتحوّل لنص', async () => {
  const m = loadModule('android');
  await m.setAlarm({ id: 999, hour: 6, minute: 0, weekdays: [1] });
  assert.equal(typeof calls('setAlarm')[0].args[0].id, 'string');
});

// ════════════════════════════════════════════════
//  4. التدهور اللطيف
// ════════════════════════════════════════════════

test('[تدهور] الوحدة غير مبنية → لا انهيار', async () => {
  // نحمّل بوحدات فارغة
  let src = fs.readFileSync(SRC, 'utf8');
  src = src.replace(
    /import\s*\{([^}]+)\}\s*from\s*'react-native';/,
    'const {$1} = __RN__;',
  );
  src = src.replace(/export const (\w+)/g, 'const $1 = __exports__.$1');
  src = src.replace(/export default \{[\s\S]*?\};?\s*$/, '');
  src = src.replace(/__DEV__/g, 'false');

  const __exports__ = {};
  const rnMock = {
    Platform: { OS: 'android', Version: 34 },
    NativeModules: {},               // ← لا وحدات
    NativeEventEmitter: class { addListener() { return { remove() {} }; } },
    PermissionsAndroid: { PERMISSIONS: {}, RESULTS: {}, request: async () => 'denied' },
  };
  new Function('__RN__', '__exports__', 'require', src)(
    rnMock, __exports__, () => rnMock,
  );

  const m = __exports__;

  // كل هذه يجب ألا تنهار
  assert.deepEqual(await m.getCapabilities(), { strategy: 'UNAVAILABLE', guaranteed: false });
  assert.equal(await m.removeAlarm('x'), false);
  assert.equal(await m.rescheduleAll(), 0);
  assert.deepEqual(await m.getScheduledAlarms(), []);
  assert.equal(await m.getPendingChallenge(), null);
  assert.equal(await m.dismissAlarm('x'), false);
  assert.equal(await m.snoozeAlarm('x'), false);
  assert.deepEqual(await m.syncAlarms([]), { scheduled: 0, total: 0 });

  const issues = await m.getIssues();
  assert.equal(issues.length, 1);
  assert.equal(issues[0].key, 'not_linked');
  assert.equal(issues[0].severity, 'fatal');

  // هاتان يجب أن ترفضا بوضوح
  await assert.rejects(async () => m.setAlarm({ id: 'a', hour: 6, minute: 0, weekdays: [1] }));
  await assert.rejects(async () => m.testAlarm(5));

  const perms = await m.requestPermissions();
  assert.equal(perms.granted, false);
  assert.equal(perms.reason, 'not_linked');
});

test('[تدهور] addAlarmListener آمن دائماً', async () => {
  for (const platform of ['android', 'ios']) {
    const m = loadModule(platform);
    const sub = m.addAlarmListener(() => {});
    assert.equal(typeof sub.remove, 'function');
    sub.remove(); // لا يجب أن ينهار
  }
});

// ════════════════════════════════════════════════
//  5. كاش القدرات
// ════════════════════════════════════════════════

test('[كاش] getCapabilities لا يستدعي الوحدة مرتين', async () => {
  const m = loadModule('android');

  await m.getCapabilities();
  await m.getCapabilities();
  await m.getCapabilities();

  assert.equal(
    calls('getDiagnostics').length, 1,
    'الكاش لا يعمل — استدعاء زائد في كل مرة',
  );
});

test('[كاش] refreshCapabilities يمسح الكاش', async () => {
  const m = loadModule('android');

  await m.getCapabilities();
  m.refreshCapabilities();
  await m.getCapabilities();

  assert.equal(calls('getDiagnostics').length, 2);
});
