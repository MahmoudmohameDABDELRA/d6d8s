import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// ⏰ المنبه الأصلي — الجسر لمحرّك أندرويد
///
/// ═══════════════════════════════════════════════════════════
/// ️ **مفيش Firebase. مفيش push. مفيش إنترنت.**
///
/// المنبه بيشتغل بـ `AlarmManager.setAlarmClock` — نفس اللي
/// تطبيق الساعة المدمج في أندرويد بيستخدمه. النظام بيعامله
/// كوعد للمستخدم مينفعش يخلفه.
///
/// ليه ده أهم من الـ push:
///
///   · **مبيحتاجش نت.** حد نايم والواي فاي فصل، المنبه بيرن.
///     منبه بالـ push في الحالة دي = مفيش منبه.
///   · **بيخترق Doze وموفّر البطارية** — الـ push مش مضمون.
///   · **شاومي وهواوي مبيقتلوهوش** — بيقتلوا الـ push غالباً.
///   · **مبيحتاجش حساب سحابي** ولا مفتاح ولا إعداد خارجي.
///
/// السيرفر لسه مصدر الحقيقة في **قايمة** المنبهات (عشان
/// تتزامن بين الأجهزة)، لكن **الجدولة والرنين محليين**.
///
/// ═══════════════════════════════════════════════════════════
/// ️ على iOS والويب: كل الدوال بترجع قيم آمنة بدل ما ترمي.
///    الجزء الأصلي لسه أندرويد بس (كود iOS موجود في
///    `mobile-alarm/ios/` ولسه محتاج ربط).
library;

class AlarmDiagnostics {
  /// كل حاجة مظبوطة؟ المنبه مضمون؟
  final bool guaranteed;

  final bool canScheduleExactAlarms;
  final bool canUseFullScreenIntent;
  final bool notificationsEnabled;
  final bool channelNotMuted;
  final bool ignoringBatteryOptimizations;

  /// الشركة معروفة بقتل التطبيقات (شاومي، هواوي، أوبو…)
  final bool aggressiveOem;

  final String manufacturer;
  final String model;
  final int sdkInt;
  final int scheduledCount;

  const AlarmDiagnostics({
    required this.guaranteed,
    required this.canScheduleExactAlarms,
    required this.canUseFullScreenIntent,
    required this.notificationsEnabled,
    required this.channelNotMuted,
    required this.ignoringBatteryOptimizations,
    required this.aggressiveOem,
    required this.manufacturer,
    required this.model,
    required this.sdkInt,
    required this.scheduledCount,
  });

  /// حالة «مش مدعوم» — iOS والويب
  static const unsupported = AlarmDiagnostics(
    guaranteed: false,
    canScheduleExactAlarms: false,
    canUseFullScreenIntent: false,
    notificationsEnabled: false,
    channelNotMuted: false,
    ignoringBatteryOptimizations: false,
    aggressiveOem: false,
    manufacturer: '',
    model: '',
    sdkInt: 0,
    scheduledCount: 0,
  );

  factory AlarmDiagnostics.fromMap(Map<Object?, Object?> m) => AlarmDiagnostics(
        guaranteed: m['guaranteed'] == true,
        canScheduleExactAlarms: m['canScheduleExactAlarms'] == true,
        canUseFullScreenIntent: m['canUseFullScreenIntent'] == true,
        notificationsEnabled: m['notificationsEnabled'] == true,
        channelNotMuted: m['channelNotMuted'] == true,
        ignoringBatteryOptimizations: m['ignoringBatteryOptimizations'] == true,
        aggressiveOem: m['aggressiveOem'] == true,
        manufacturer: (m['manufacturer'] ?? '').toString(),
        model: (m['model'] ?? '').toString(),
        sdkInt: (m['sdkInt'] as num?)?.toInt() ?? 0,
        scheduledCount: (m['scheduledCount'] as num?)?.toInt() ?? 0,
      );

  /// المشاكل اللي محتاجة تدخّل المستخدم، مرتّبة بالأهمية.
  ///
  /// ️ الترتيب مقصود: أول واحدة هي اللي لو مظبطتش المنبه
  ///    **مش هيرن خالص**. اللي بعدها بتقلّل الاحتمال بس.
  List<AlarmIssue> get issues {
    final out = <AlarmIssue>[];

    if (!canScheduleExactAlarms) {
      out.add(const AlarmIssue(
        key: 'exact',
        title: 'المنبهات الدقيقة مقفولة',
        why: 'من غيرها المنبه ممكن يتأخر ٩ دقايق أو ما يرنش خالص',
        action: 'افتح الإعداد',
        critical: true,
      ));
    }

    if (!notificationsEnabled) {
      out.add(const AlarmIssue(
        key: 'notifications',
        title: 'الإشعارات مقفولة',
        why: 'المنبه بيرن من خلال إشعار — من غيره مفيش صوت',
        action: 'فعّل الإشعارات',
        critical: true,
      ));
    }

    if (!canUseFullScreenIntent) {
      out.add(const AlarmIssue(
        key: 'fullscreen',
        title: 'الشاشة الكاملة مقفولة',
        why: 'المنبه هيبان إشعار صغير بدل ما يفتح على طول',
        action: 'افتح الإعداد',
        critical: false,
      ));
    }

    if (!channelNotMuted) {
      out.add(const AlarmIssue(
        key: 'channel',
        title: 'قناة المنبه مكتومة',
        why: 'الصوت مقفول من إعدادات الإشعارات',
        action: 'شيل الكتم',
        critical: true,
      ));
    }

    if (!ignoringBatteryOptimizations) {
      out.add(const AlarmIssue(
        key: 'battery',
        title: 'موفّر البطارية شغّال على التطبيق',
        why: 'النظام ممكن يوقّف المنبه وانت نايم',
        action: 'استثنِ التطبيق',
        critical: false,
      ));
    }

    if (aggressiveOem) {
      out.add(AlarmIssue(
        key: 'oem',
        title: 'جهاز $manufacturer بيقفل التطبيقات',
        why: 'لازم تضيف «بال» لقايمة التشغيل التلقائي يدوياً',
        action: 'افتح القايمة',
        critical: false,
      ));
    }

    return out;
  }
}

class AlarmIssue {
  final String key;
  final String title;
  final String why;
  final String action;

  /// لو `true` المنبه غالباً **مش هيرن** من غير ما تتظبط
  final bool critical;

  const AlarmIssue({
    required this.key,
    required this.title,
    required this.why,
    required this.action,
    required this.critical,
  });
}

/// حدث: المنبه بيرن دلوقتي
class AlarmRinging {
  final String alarmId;
  final String label;
  final DateTime occurrenceAt;
  final bool isSnooze;

  const AlarmRinging({
    required this.alarmId,
    required this.label,
    required this.occurrenceAt,
    required this.isSnooze,
  });
}

abstract final class NativeAlarm {
  static const _method = MethodChannel('bal/alarm');
  static const _events = EventChannel('bal/alarm/events');

  /// الجزء الأصلي متاح؟ (أندرويد بس دلوقتي)
  static bool get isSupported =>
      !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  /// 🔔 المنبه رنّ — بيوصل حتى لو التطبيق كان مقفول والنظام فتحه
  static Stream<AlarmRinging> get onRinging {
    if (!isSupported) return const Stream.empty();

    return _events.receiveBroadcastStream().map((raw) {
      final m = (raw as Map).cast<Object?, Object?>();
      return AlarmRinging(
        alarmId: (m['alarmId'] ?? '').toString(),
        label: (m['label'] ?? '').toString(),
        occurrenceAt: DateTime.fromMillisecondsSinceEpoch(
          (m['occurrenceAt'] as num?)?.toInt() ?? 0,
        ),
        isSnooze: m['isSnooze'] == true,
      );
    });
  }

  /// 🩺 فحص شامل: هل المنبه هيرن فعلاً على الجهاز ده؟
  static Future<AlarmDiagnostics> diagnostics() async {
    if (!isSupported) return AlarmDiagnostics.unsupported;
    try {
      final res = await _method.invokeMethod<Map<Object?, Object?>>(
        'getDiagnostics',
      );
      return res == null
          ? AlarmDiagnostics.unsupported
          : AlarmDiagnostics.fromMap(res);
    } catch (e) {
      debugPrint('⏰ فحص المنبه فشل: $e');
      return AlarmDiagnostics.unsupported;
    }
  }

  /// جدولة منبه واحد
  static Future<bool> setAlarm({
    required String id,
    required int hour,
    required int minute,
    required List<int> weekdays,
    String label = 'منبه بال',
    bool enabled = true,
    int snoozeMinutes = 5,
    bool requireChallenge = true,
  }) async {
    if (!isSupported) return false;
    try {
      final res = await _method.invokeMethod<Map<Object?, Object?>>(
        'setAlarm',
        {
          'id': id,
          'hour': hour,
          'minute': minute,
          'weekdays': weekdays,
          'label': label,
          'enabled': enabled,
          'snoozeMinutes': snoozeMinutes,
          'requireChallenge': requireChallenge,
        },
      );
      return res?['success'] == true;
    } catch (e) {
      debugPrint('⏰ جدولة المنبه فشلت: $e');
      return false;
    }
  }

  static Future<void> removeAlarm(String alarmId) async {
    if (!isSupported) return;
    try {
      await _method.invokeMethod('removeAlarm', {'alarmId': alarmId});
    } catch (e) {
      debugPrint('⏰ مسح المنبه فشل: $e');
    }
  }

  /// 🔄 مزامنة كل المنبهات من السيرفر للنظام.
  ///
  /// ️ دي أهم دالة في الملف. السيرفر بيحتفظ بالقايمة (عشان
  ///    تتزامن بين الأجهزة)، لكن **الرنين محلي**. الدالة دي هي
  ///    الوصلة: بتاخد قايمة السيرفر وتجدولها في النظام.
  ///
  ///    من غيرها المنبه موجود في قاعدة البيانات ومش موجود في
  ///    الجهاز — يعني مش هيرن.
  static Future<int> sync(List<Map<String, dynamic>> alarms) async {
    if (!isSupported) return 0;
    try {
      final res = await _method.invokeMethod<Map<Object?, Object?>>(
        'syncAlarms',
        {'alarms': alarms},
      );
      return (res?['scheduled'] as num?)?.toInt() ?? 0;
    } catch (e) {
      debugPrint('⏰ مزامنة المنبهات فشلت: $e');
      return 0;
    }
  }

  /// إعادة جدولة الكل — شبكة أمان بتتنده عند فتح التطبيق
  static Future<int> rescheduleAll() async {
    if (!isSupported) return 0;
    try {
      return await _method.invokeMethod<int>('rescheduleAll') ?? 0;
    } catch (_) {
      return 0;
    }
  }

  /// المنبه بيرن دلوقتي؟ (بيتسأل عند فتح التطبيق)
  static Future<String?> ringingAlarmId() async {
    if (!isSupported) return null;
    try {
      final res =
          await _method.invokeMethod<Map<Object?, Object?>>('getRingingAlarm');
      if (res?['isRinging'] != true) return null;
      return res?['alarmId']?.toString();
    } catch (_) {
      return null;
    }
  }

  /// ✅ إيقاف الرنين — بيتنده **بعد** حل المهمة بس
  static Future<void> dismiss(String alarmId) async {
    if (!isSupported) return;
    try {
      await _method.invokeMethod('dismissRinging', {'alarmId': alarmId});
    } catch (e) {
      debugPrint('⏰ إيقاف الرنين فشل: $e');
    }
  }

  /// 😴 غفوة
  static Future<void> snooze(String alarmId) async {
    if (!isSupported) return;
    try {
      await _method.invokeMethod('snoozeRinging', {'alarmId': alarmId});
    } catch (e) {
      debugPrint('⏰ الغفوة فشلت: $e');
    }
  }

  /// 🧪 اختبار: يرن بعد ثواني قليلة.
  ///
  /// ️ ده مش رفاهية. المستخدم لازم يقدر يتأكد إن المنبه شغّال
  ///    **قبل** ما يعتمد عليه وينام. اكتشاف إن المنبه مش شغّال
  ///    الصبح = وصلت متأخر.
  static Future<DateTime?> testFireIn(int seconds) async {
    if (!isSupported) return null;
    try {
      final at = await _method.invokeMethod<int>('testFireIn', {
        'seconds': seconds,
      });
      return at == null ? null : DateTime.fromMillisecondsSinceEpoch(at);
    } catch (e) {
      debugPrint('⏰ الاختبار فشل: $e');
      return null;
    }
  }

  // ── فتح شاشات إعدادات النظام ──

  static Future<void> openSettingsFor(String issueKey) async {
    if (!isSupported) return;
    final method = switch (issueKey) {
      'exact' => 'openExactAlarmSettings',
      'fullscreen' => 'openFullScreenIntentSettings',
      'battery' => 'openBatteryOptimizationSettings',
      'oem' => 'openOemAutoStartSettings',
      _ => 'openNotificationSettings',
    };
    try {
      await _method.invokeMethod(method);
    } catch (e) {
      debugPrint('⏰ فتح الإعدادات فشل: $e');
    }
  }
}
