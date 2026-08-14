import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

/**
 * ════════════════════════════════════════════════════════════
 *  واجهة المنبه الموحّدة
 * ════════════════════════════════════════════════════════════
 *
 *  دالة واحدة لكل عملية — تختار المسار الصحيح تلقائياً.
 *
 *    Android  →  ClanAlarm       (AlarmManager.setAlarmClock)
 *    iOS 26+  →  ClanAlarmBridge (AlarmKit)
 *    iOS <26  →  ClanAlarmBridge (UserNotifications)
 *
 *  ⚠️ لا مكتبات خارجية. Notifee اتأرشف في أبريل 2026،
 *     و expo-notifications لا يدعم الخدمات الأمامية.
 */

const { ClanAlarm, ClanAlarmBridge } = NativeModules;

const isAndroid = Platform.OS === 'android';
const native = isAndroid ? ClanAlarm : ClanAlarmBridge;

/** الوحدة الأصلية غير مبنية بعد — نفشل بلطف بدل الانهيار */
const NOT_LINKED = !native;

if (NOT_LINKED && __DEV__) {
  console.warn(
    '[ClanAlarm] الوحدة الأصلية غير موجودة. ' +
      'شغّل:  cd android && ./gradlew clean   ثم أعد البناء. ' +
      'على iOS:  cd ios && pod install',
  );
}

// ════════════════════════════════════════════════
//  الأحداث
// ════════════════════════════════════════════════

const emitter = native ? new NativeEventEmitter(native) : null;

/**
 * الاستماع لأحداث المنبه.
 *
 * الأحداث: ringing · dismissed · snoozed · missed
 *
 * ⚠️ أندرويد فقط. على iOS الحدث يصل عبر
 *    consumePendingChallenge() عند فتح التطبيق.
 */
export const addAlarmListener = (callback) => {
  if (!emitter || !isAndroid) return { remove: () => {} };
  return emitter.addListener('ClanAlarmEvent', callback);
};

// ════════════════════════════════════════════════
//  القدرات والصلاحيات
// ════════════════════════════════════════════════

let cachedCapabilities = null;

/**
 * ماذا يستطيع هذا الجهاز بالضبط؟
 * تُعرض في شاشة الإعدادات — الشفافية تبني الثقة في المنبه.
 */
export const getCapabilities = async () => {
  if (cachedCapabilities) return cachedCapabilities;
  if (NOT_LINKED) return { strategy: 'UNAVAILABLE', guaranteed: false };

  if (isAndroid) {
    const d = await native.getDiagnostics();
    cachedCapabilities = {
      strategy: d.canScheduleExactAlarms ? 'ANDROID_ALARM_CLOCK' : 'ANDROID_INEXACT',
      bypassSilent: true,
      unlimitedSound: true,
      fullScreen: d.canUseFullScreenIntent,
      survivesRestart: true,
      guaranteed: d.guaranteed,
      ...d,
    };
  } else {
    cachedCapabilities = await native.getCapabilities();
  }

  return cachedCapabilities;
};

/** يمسح الكاش — استدعِها بعد رجوع المستخدم من شاشة الإعدادات */
export const refreshCapabilities = () => {
  cachedCapabilities = null;
};

export const requestPermissions = async () => {
  if (NOT_LINKED) return { granted: false, reason: 'not_linked' };

  if (isAndroid) {
    // إذن الإشعارات على أندرويد 13+ يُطلب من طبقة RN القياسية
    const { PermissionsAndroid } = require('react-native');
    let notificationsGranted = true;

    if (Platform.Version >= 33) {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      );
      notificationsGranted = result === PermissionsAndroid.RESULTS.GRANTED;
    }

    const d = await native.getDiagnostics();
    return {
      granted: notificationsGranted && d.canScheduleExactAlarms,
      notifications: notificationsGranted,
      exactAlarms: d.canScheduleExactAlarms,
      fullScreen: d.canUseFullScreenIntent,
      battery: d.ignoringBatteryOptimizations,
    };
  }

  return native.requestAuthorization();
};

// ════════════════════════════════════════════════
//  التشخيص — «هل منبهي مضمون؟»
// ════════════════════════════════════════════════

/**
 * قائمة المشاكل التي تمنع المنبه من الرنين، مرتّبة بالخطورة.
 * كل عنصر يحمل `fix` — دالة تفتح الشاشة الصحيحة مباشرة.
 */
export const getIssues = async () => {
  if (NOT_LINKED) {
    return [{
      key: 'not_linked',
      severity: 'fatal',
      title: 'وحدة المنبه غير مثبتة',
      body: 'أعد بناء التطبيق.',
      fix: null,
    }];
  }

  const issues = [];

  if (isAndroid) {
    const d = await native.getDiagnostics();

    if (!d.canScheduleExactAlarms) {
      issues.push({
        key: 'exact_alarms',
        severity: 'fatal',
        title: 'المنبهات الدقيقة ممنوعة',
        body: 'بدونها قد يتأخر المنبه حتى ٩ دقائق أو لا يرن.',
        fix: () => native.openExactAlarmSettings(),
      });
    }

    if (!d.notificationsEnabled) {
      issues.push({
        key: 'notifications',
        severity: 'fatal',
        title: 'الإشعارات مغلقة',
        body: 'المنبه لن يظهر إطلاقاً.',
        fix: () => native.openNotificationSettings(),
      });
    }

    if (!d.channelNotMuted) {
      issues.push({
        key: 'channel_muted',
        severity: 'fatal',
        title: 'قناة المنبه مكتومة',
        body: 'افتح إعدادات الإشعارات وارفع أهمية «منبه العشيرة».',
        fix: () => native.openNotificationSettings(),
      });
    }

    if (!d.canUseFullScreenIntent) {
      issues.push({
        key: 'full_screen',
        severity: 'high',
        title: 'شاشة المنبه الكاملة معطّلة',
        body: 'سيظهر إشعار صغير بدل الشاشة الكاملة.',
        fix: () => native.openFullScreenIntentSettings(),
      });
    }

    if (!d.ignoringBatteryOptimizations) {
      issues.push({
        key: 'battery',
        severity: 'high',
        title: 'تحسين البطارية مفعّل',
        body: 'النظام قد يوقف التطبيق أثناء النوم فلا يرن المنبه.',
        fix: () => native.openBatteryOptimizationSettings(),
      });
    }

    if (d.aggressiveOem) {
      issues.push({
        key: 'oem_autostart',
        severity: 'medium',
        title: `جهاز ${d.manufacturer} يحتاج إذناً إضافياً`,
        body: 'فعّل «التشغيل التلقائي» وثبّت التطبيق في قائمة المهام الأخيرة.',
        fix: () => native.openOemAutoStartSettings(),
      });
    }
  } else {
    const caps = await native.getCapabilities();
    const auth = await native.getAuthorizationStatus();

    if (auth.status !== 'authorized') {
      issues.push({
        key: 'ios_auth',
        severity: 'fatal',
        title: 'إذن المنبه غير ممنوح',
        body: 'اسمح للتطبيق بالمنبهات من الإعدادات.',
        fix: () => native.requestAuthorization(),
      });
    }

    if (caps.strategy === 'NOTIFICATIONS') {
      issues.push({
        key: 'ios_old',
        severity: 'high',
        title: 'نظامك أقدم من iOS 26',
        body: 'الصوت سيتوقف بعد ٣٠ ثانية ولن يخترق الوضع الصامت. حدّث النظام لمنبه كامل.',
        fix: null,
      });
    }
  }

  const order = { fatal: 0, high: 1, medium: 2, low: 3 };
  return issues.sort((a, b) => order[a.severity] - order[b.severity]);
};

/** true فقط إذا لم توجد أي مشكلة */
export const isGuaranteed = async () => (await getIssues()).length === 0;

// ════════════════════════════════════════════════
//  الجدولة
// ════════════════════════════════════════════════

/**
 * التحقق من صحة المنبه قبل إرساله للطبقة الأصلية.
 *
 * السبب: خطأ في JS يعطي رسالة واضحة،
 * وخطأ في Kotlin/Swift يعطي انهياراً غامضاً.
 */
const validate = (alarm) => {
  if (!alarm || typeof alarm !== 'object') throw new Error('المنبه يجب أن يكون كائناً');
  if (!alarm.id) throw new Error('المنبه يحتاج id');

  const h = Number(alarm.hour);
  const m = Number(alarm.minute);
  if (!Number.isInteger(h) || h < 0 || h > 23) throw new Error(`ساعة غير صالحة: ${alarm.hour}`);
  if (!Number.isInteger(m) || m < 0 || m > 59) throw new Error(`دقيقة غير صالحة: ${alarm.minute}`);

  const days = Array.isArray(alarm.weekdays) ? alarm.weekdays : [];
  if (days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
    throw new Error('أيام الأسبوع يجب أن تكون أرقاماً من 0 (الأحد) إلى 6 (السبت)');
  }

  return {
    id: String(alarm.id),
    hour: h,
    minute: m,
    weekdays: days,
    label: alarm.label || 'منبه العشيرة',
    enabled: alarm.enabled !== false,
    snoozeMinutes: Number(alarm.snoozeMinutes) || 0,
    requireChallenge: alarm.requireChallenge !== false,
  };
};

/** إضافة أو تعديل منبه */
export const setAlarm = async (alarm) => {
  if (NOT_LINKED) throw new Error('وحدة المنبه غير مثبتة');
  const a = validate(alarm);

  if (isAndroid) return native.setAlarm(a);

  if (!a.enabled) {
    await native.removeAlarm(a.id);
    return { success: true, disabled: true };
  }

  return native.setAlarm(
    a.id, a.hour, a.minute, a.weekdays, a.label, a.snoozeMinutes,
  );
};

export const removeAlarm = async (alarmId) => {
  if (NOT_LINKED) return false;
  return native.removeAlarm(String(alarmId));
};

/**
 * مزامنة كاملة مع الخادم.
 *
 * استدعِها عند: فتح التطبيق · بعد أي تعديل · بعد تسجيل الدخول.
 * تمسح كل الجدولة القديمة وتعيد البناء من الصفر —
 * فلا تبقى منبهات يتيمة من جلسة سابقة.
 */
export const syncAlarms = async (alarms) => {
  if (NOT_LINKED) return { scheduled: 0, total: 0 };
  const list = (alarms || []).map(validate);

  if (isAndroid) return native.syncAlarms(list);

  await native.removeAllAlarms();
  let scheduled = 0;
  for (const a of list) {
    if (!a.enabled) continue;
    try {
      await native.setAlarm(a.id, a.hour, a.minute, a.weekdays, a.label, a.snoozeMinutes);
      scheduled += 1;
    } catch (e) {
      if (__DEV__) console.warn(`[ClanAlarm] فشل جدولة ${a.id}:`, e.message);
    }
  }
  return { scheduled, total: list.length };
};

/** شبكة أمان — استدعِها كل مرة يفتح فيها التطبيق */
export const rescheduleAll = async () => {
  if (NOT_LINKED) return 0;
  if (isAndroid) return native.rescheduleAll();
  return -1; // iOS يتولّى التكرار بنفسه
};

export const getScheduledAlarms = async () => {
  if (NOT_LINKED) return [];
  return native.getScheduledAlarms();
};

// ════════════════════════════════════════════════
//  أثناء الرنين
// ════════════════════════════════════════════════

/**
 * هل هناك منبه ينتظر حل مسألة الآن؟
 *
 * أندرويد: الخدمة ترن فعلاً → نسأل عن حالتها.
 * iOS: المستخدم ضغط «حلّ المسألة» وفُتح التطبيق → نقرأ ما تركته النية.
 *
 * استدعِها في أول render وعند كل عودة للتطبيق من الخلفية.
 */
export const getPendingChallenge = async () => {
  if (NOT_LINKED) return null;

  if (isAndroid) {
    const state = await native.getRingingAlarm();
    return state.isRinging ? { alarmId: state.alarmId, ringing: true } : null;
  }

  const pending = await native.consumePendingChallenge();
  return pending ? { alarmId: pending.alarmId, ringing: false } : null;
};

/**
 * إيقاف المنبه.
 *
 * ⚠️ لا تستدعِها إلا بعد التحقق من حل المسألة على الخادم.
 * أي مسار آخر يهدم الفكرة كلها.
 */
export const dismissAlarm = async (alarmId) => {
  if (NOT_LINKED) return false;
  if (isAndroid) return native.dismissRinging(String(alarmId));
  return true; // iOS: AlarmKit أوقفه بالفعل عبر stopIntent
};

export const snoozeAlarm = async (alarmId) => {
  if (NOT_LINKED) return false;
  if (isAndroid) return native.snoozeRinging(String(alarmId));
  return false;
};

/**
 * إغلاق شاشة المنبه.
 *
 * أندرويد: الشاشة Activity منفصلة — لو لم تُغلق تبقى في المقدمة
 * وتتجمّد أزرار النظام. `dismissAlarm` يستدعيها تلقائياً،
 * لكنها متاحة هنا للحالات الاستثنائية.
 *
 * iOS: لا شيء — النظام يتولّى الإغلاق.
 */
export const closeScreen = async () => {
  if (NOT_LINKED || !isAndroid) return false;
  try {
    return await native.closeAlarmScreen();
  } catch (e) {
    return false;
  }
};

// ════════════════════════════════════════════════
//  الاختبار
// ════════════════════════════════════════════════

/**
 * منبه تجريبي بعد ثوانٍ قليلة.
 *
 * ضعه في شاشة الإعدادات كزر «جرّب المنبه الآن».
 * المستخدم الذي يجرّب ويسمع، يثق. والثقة هي المنتج.
 */
export const testAlarm = async (seconds = 10) => {
  if (NOT_LINKED) throw new Error('وحدة المنبه غير مثبتة');
  return native.testFireIn(seconds);
};

export const setVolumeBoost = async (enabled) => {
  if (NOT_LINKED || !isAndroid) return false;
  return native.setVolumeBoost(!!enabled);
};

export default {
  getCapabilities,
  refreshCapabilities,
  requestPermissions,
  getIssues,
  isGuaranteed,
  setAlarm,
  removeAlarm,
  syncAlarms,
  rescheduleAll,
  getScheduledAlarms,
  getPendingChallenge,
  dismissAlarm,
  snoozeAlarm,
  closeScreen,
  addAlarmListener,
  testAlarm,
  setVolumeBoost,
};
