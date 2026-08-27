package com.bal.bal_app

import com.bal.bal_app.alarm.AlarmPlugin
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodChannel

/**
 * ️ تسجيل جسر المنبه.
 *
 *    محرّك المنبه بيشتغل على مستوى النظام (AlarmManager + خدمة
 *    أمامية)، لكن Flutter محتاج قناتين عشان يكلّمه:
 *
 *      · MethodChannel — أوامر (جدول، ألغِ، شخّص)
 *      · EventChannel  — أحداث (المنبه بيرن دلوقتي)
 *
 *    ️ `activityProvider` بيرجّع الـ Activity الحالية لأن فتح
 *      شاشات إعدادات النظام محتاج Activity مش Context عادي.
 *      استخدام `applicationContext` بيشتغل بس بيفتح الشاشة في
 *      مهمة منفصلة، والمستخدم بيتوه لما يرجع.
 */
class MainActivity : FlutterActivity() {

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        val plugin = AlarmPlugin(
            context = applicationContext,
            activityProvider = { this },
        )

        MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            AlarmPlugin.METHOD_CHANNEL,
        ).setMethodCallHandler(plugin)

        EventChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            AlarmPlugin.EVENT_CHANNEL,
        ).setStreamHandler(plugin)
    }
}
