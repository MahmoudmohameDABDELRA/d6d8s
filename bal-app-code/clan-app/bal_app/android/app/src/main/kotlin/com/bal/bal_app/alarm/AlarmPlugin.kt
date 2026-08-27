package com.bal.bal_app.alarm

import android.app.Activity
import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import com.bal.bal_app.R

/**
 * ════════════════════════════════════════════════════════════
 *  جسر المنبه إلى Flutter
 * ════════════════════════════════════════════════════════════
 *
 *  ️ ليه الملف ده موجود، وإيه اللي اتغيّر:
 *
 *  محرّك المنبه (٨ ملفات Kotlin) كان مكتوب لـ **React Native**.
 *  التطبيق بقى **Flutter**. المنطق نفسه — الجدولة، الرنين،
 *  إعادة الجدولة بعد الإقلاع — ما اتغيّرش فيه حرف، لأنه منطق
 *  أندرويد خالص ومالوش علاقة بإطار الواجهة.
 *
 *  اللي اتغيّر هو **الجسر بس**:
 *      ReactContextBaseJavaModule  →  MethodChannel
 *      @ReactMethod + Promise      →  onMethodCall + Result
 *      DeviceEventManagerModule    →  EventChannel
 *      ReadableMap / Arguments     →  Map<String, Any>
 *
 *  ️ **مفيش Firebase ولا FCM هنا ولا في أي ملف من الثمانية.**
 *
 *  ده مقصود ومهم. المنبه بيشتغل بـ `AlarmManager.setAlarmClock`
 *  — نفس اللي تطبيق الساعة المدمج بيستخدمه. الفرق عن الـ push:
 *
 *  ┌───────────────────────┬──────────────┬──────────────────┐
 *  │                       │ Push / FCM   │ setAlarmClock    │
 *  ├───────────────────────┼──────────────┼──────────────────┤
 *  │ محتاج إنترنت           │ أيوه 🔴       │ لأ               │
 *  │ محتاج حساب سحابي       │ أيوه         │ لأ               │
 *  │ يخترق Doze            │ مش مضمون     │ دايماً            │
 *  │ يخترق موفّر البطارية    │ لأ           │ أيوه             │
 *  │ شاومي/هواوي بتقتله     │ غالباً        │ نادراً            │
 *  └───────────────────────┴──────────────┴──────────────────┘
 *
 *  الحاجة القاتلة: منبه بالـ push مبيرنش والنت قاطع. حد نايم
 *  والواي فاي فصل = مفيش منبه. `setAlarmClock` بيرن على وضع
 *  الطيران كمان.
 * ════════════════════════════════════════════════════════════
 */
class AlarmPlugin(
    private val context: Context,
    private val activityProvider: () -> Activity?,
) : MethodChannel.MethodCallHandler, EventChannel.StreamHandler {

    companion object {
        const val METHOD_CHANNEL = "bal/alarm"
        const val EVENT_CHANNEL = "bal/alarm/events"
    }

    private var events: EventChannel.EventSink? = null
    private var ringingReceiver: BroadcastReceiver? = null

    // ════════════════════════════════════════════════
    //  قناة الأحداث — المنبه بيرن دلوقتي
    // ════════════════════════════════════════════════

    /**
     * ️ الحدث ده هو اللي بيخلي Flutter يعرف إن المنبه رنّ.
     *
     *    الخدمة الأمامية بتبثّه محلياً، والتطبيق بيسمعه ويفتح
     *    شاشة المهمة. من غيره الشاشة الأصلية بتشتغل والتطبيق
     *    مايعرفش حاجة، فمفيش تسجيل استيقاظ ولا سلسلة.
     */
    override fun onListen(arguments: Any?, sink: EventChannel.EventSink?) {
        events = sink

        val receiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context?, intent: Intent?) {
                if (intent == null) return
                events?.success(
                    mapOf(
                        "alarmId" to intent.getStringExtra(AlarmContract.EXTRA_ALARM_ID),
                        "label" to intent.getStringExtra(AlarmContract.EXTRA_LABEL),
                        "occurrenceAt" to
                            intent.getLongExtra(AlarmContract.EXTRA_OCCURRENCE_AT, 0L),
                        "isSnooze" to
                            intent.getBooleanExtra(AlarmContract.EXTRA_IS_SNOOZE, false),
                    ),
                )
            }
        }

        LocalBroadcastManager.getInstance(context).registerReceiver(
            receiver,
            IntentFilter(AlarmContract.ACTION_ALARM_RINGING_EVENT),
        )
        ringingReceiver = receiver
    }

    override fun onCancel(arguments: Any?) {
        ringingReceiver?.let {
            LocalBroadcastManager.getInstance(context).unregisterReceiver(it)
        }
        ringingReceiver = null
        events = null
    }

    // ════════════════════════════════════════════════
    //  قناة الأوامر
    // ════════════════════════════════════════════════

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        try {
            when (call.method) {
                "getDiagnostics" -> result.success(diagnostics())

                "setAlarm" -> result.success(setAlarm(call))
                "removeAlarm" -> {
                    val id = call.argument<String>("alarmId") ?: ""
                    AlarmScheduler.cancelById(context, id)
                    AlarmStore.remove(context, id)
                    result.success(true)
                }

                "syncAlarms" -> result.success(syncAlarms(call))
                "rescheduleAll" -> result.success(AlarmScheduler.rescheduleAll(context))
                "getScheduledAlarms" -> result.success(scheduledAlarms())

                "getRingingAlarm" -> result.success(
                    mapOf(
                        "isRinging" to AlarmRingService.isRinging,
                        "alarmId" to AlarmRingService.currentAlarmId,
                    ),
                )

                "dismissRinging" -> {
                    /**
                     * ️ لازم الاتنين مع بعض: نوقّف الصوت **و**نقفل
                     *    الشاشة. من غير التانية الشاشة بتفضل معلّقة
                     *    في المقدمة وأزرار النظام بتتجمّد — ده ظهر
                     *    في اختبار حقيقي على جهاز.
                     */
                    val id = call.argument<String>("alarmId") ?: ""
                    AlarmRingService.stopRinging(context, id, dismissed = true)
                    closeAlarmScreen()
                    result.success(true)
                }

                "snoozeRinging" -> {
                    val id = call.argument<String>("alarmId") ?: ""
                    AlarmRingService.snooze(context, id)
                    closeAlarmScreen()
                    result.success(true)
                }

                "closeAlarmScreen" -> {
                    closeAlarmScreen()
                    result.success(true)
                }

                "setVolumeBoost" -> {
                    AlarmStore.setVolumeBoost(
                        context,
                        call.argument<Boolean>("enabled") ?: false,
                    )
                    result.success(true)
                }

                "testFireIn" -> result.success(testFireIn(call))

                // ── فتح شاشات إعدادات النظام ──
                "openExactAlarmSettings" -> result.success(openExactAlarmSettings())
                "openFullScreenIntentSettings" ->
                    result.success(openFullScreenIntentSettings())
                "openBatteryOptimizationSettings" ->
                    result.success(openBatteryOptimization())
                "openNotificationSettings" -> result.success(openNotificationSettings())
                "openOemAutoStartSettings" -> result.success(openOemAutoStart())

                else -> result.notImplemented()
            }
        } catch (e: Exception) {
            result.error(call.method.uppercase() + "_FAILED", e.message, null)
        }
    }

    // ════════════════════════════════════════════════
    //  التشخيص — الشاشة بتعرضه كقائمة فحص
    // ════════════════════════════════════════════════

    /**
     * ️ ليه التشخيص مهم بالدرجة دي:
     *
     *    المنبه بيفشل على أندرويد لأسباب **خارج التطبيق**:
     *    المستخدم منع المنبهات الدقيقة، أو شاومي حاطة التطبيق
     *    في قائمة القتل، أو الإشعارات مقفولة. من غير التشخيص
     *    ده، المستخدم بيكتشف المشكلة **لما يفوته الميعاد**.
     *
     *    كل بند هنا بيتحوّل لسطر في الواجهة مع زرار يودّيه
     *    للإعداد المطلوب.
     */
    private fun diagnostics(): Map<String, Any?> {
        val ctx = context.applicationContext
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        val canFullScreen =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                nm.canUseFullScreenIntent()
            } else {
                true
            }

        var channelOk = true
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val ch = nm.getNotificationChannel(AlarmContract.CHANNEL_ID)
            channelOk = ch == null || ch.importance >= NotificationManager.IMPORTANCE_DEFAULT
        }

        val pm = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
        val ignoringBattery =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                pm.isIgnoringBatteryOptimizations(ctx.packageName)
            } else {
                true
            }

        /**
         * ️ الشركات دي بتقتل التطبيقات في الخلفية بسياسات خاصة
         *    بيها مش موجودة في أندرويد الأصلي. المستخدم لازم
         *    يضيف التطبيق يدوياً لقائمة «التشغيل التلقائي».
         */
        val aggressive = listOf(
            "xiaomi", "redmi", "poco", "huawei", "honor",
            "oppo", "realme", "oneplus", "vivo", "iqoo",
            "meizu", "asus", "wiko", "lenovo", "blackview",
            "infinix", "tecno", "itel", "nothing",
        )
        val brand = Build.MANUFACTURER.lowercase()

        val exact = AlarmScheduler.canScheduleExact(ctx)

        return mapOf(
            "platform" to "android",
            "sdkInt" to Build.VERSION.SDK_INT,
            "manufacturer" to Build.MANUFACTURER,
            "model" to Build.MODEL,
            "canScheduleExactAlarms" to exact,
            "canUseFullScreenIntent" to canFullScreen,
            "notificationsEnabled" to nm.areNotificationsEnabled(),
            "channelNotMuted" to channelOk,
            "ignoringBatteryOptimizations" to ignoringBattery,
            "aggressiveOem" to aggressive.any { brand.contains(it) },
            "lastRescheduleAt" to AlarmStore.lastRescheduleAt(ctx),
            "scheduledCount" to AlarmStore.loadAll(ctx).count { it.enabled },
            "volumeBoost" to AlarmStore.isVolumeBoostEnabled(ctx),
            /** كله تمام؟ الواجهة بتعرض علامة واحدة مطمّنة */
            "guaranteed" to (
                exact && canFullScreen && nm.areNotificationsEnabled() &&
                    channelOk && ignoringBattery
                ),
        )
    }

    // ════════════════════════════════════════════════
    //  الجدولة
    // ════════════════════════════════════════════════

    private fun readAlarm(map: Map<String, Any?>): AlarmEntity {
        @Suppress("UNCHECKED_CAST")
        val days = (map["weekdays"] as? List<Int>) ?: emptyList()

        return AlarmEntity(
            id = map["id"] as? String ?: error("id مطلوب"),
            hour = (map["hour"] as? Number)?.toInt() ?: 0,
            minute = (map["minute"] as? Number)?.toInt() ?: 0,
            weekdays = days,
            label = map["label"] as? String
                ?: context.getString(R.string.clan_alarm_default_label),
            enabled = map["enabled"] as? Boolean ?: true,
            snoozeMinutes = (map["snoozeMinutes"] as? Number)?.toInt() ?: 0,
            requireChallenge = map["requireChallenge"] as? Boolean ?: true,
        )
    }

    private fun setAlarm(call: MethodCall): Map<String, Any?> {
        @Suppress("UNCHECKED_CAST")
        val cfg = call.arguments as? Map<String, Any?> ?: emptyMap()
        val alarm = readAlarm(cfg)

        AlarmStore.upsert(context, alarm)

        val at = if (alarm.enabled) {
            AlarmScheduler.schedule(context, alarm)
        } else {
            AlarmScheduler.cancel(context, alarm)
            -1L
        }

        return mapOf(
            "success" to (at > 0 || !alarm.enabled),
            "nextTriggerAt" to at,
            "exact" to AlarmScheduler.canScheduleExact(context),
        )
    }

    /**
     * استبدال كل المنبهات دفعة واحدة — بيتنده بعد المزامنة مع السيرفر.
     *
     * ️ السيرفر هو المصدر الوحيد للحقيقة في قايمة المنبهات، لكن
     *    **الجدولة** لازم تكون محلية. لو اعتمدنا على السيرفر في
     *    الرنين، المنبه مبيرنش والنت قاطع.
     */
    private fun syncAlarms(call: MethodCall): Map<String, Any?> {
        val list = call.argument<List<Map<String, Any?>>>("alarms") ?: emptyList()

        /**
         * ️ نلغي المجدول القديم **قبل** ما نكتب الجديد.
         *
         *    من غير الخطوة دي، المنبه اللي المستخدم مسحه من
         *    السيرفر بيفضل مجدول في النظام ويرن — منبه يتيم
         *    مالوش سجل في التطبيق ومفيش طريقة يتقفل بيها.
         */
        AlarmStore.loadAll(context).forEach { AlarmScheduler.cancel(context, it) }

        //  أي عنصر بايظ بيتخطى بدل ما يكسر المزامنة كلها
        val alarms = list.mapNotNull {
            try {
                readAlarm(it)
            } catch (e: Exception) {
                null
            }
        }

        AlarmStore.saveAll(context, alarms)

        return mapOf(
            "scheduled" to AlarmScheduler.rescheduleAll(context),
            "total" to alarms.size,
        )
    }

    private fun scheduledAlarms(): List<Map<String, Any?>> =
        AlarmStore.loadAll(context).map { alarm ->
            mapOf(
                "id" to alarm.id,
                "hour" to alarm.hour,
                "minute" to alarm.minute,
                "enabled" to alarm.enabled,
                "label" to alarm.label,
                "nextTriggerAt" to AlarmScheduler.nextOccurrence(alarm),
            )
        }

    /** اختبار فوري — بيرن بعد ثواني عشان المستخدم يتأكد قبل ما ينام */
    private fun testFireIn(call: MethodCall): Long {
        val seconds = call.argument<Int>("seconds") ?: 10

        val test = AlarmEntity(
            id = "__test__",
            hour = 0,
            minute = 0,
            weekdays = emptyList(),
            label = context.getString(R.string.clan_alarm_test_label),
            enabled = true,
            snoozeMinutes = 0,
            requireChallenge = false,
        )

        AlarmStore.upsert(context, test)
        val at = System.currentTimeMillis() + seconds * 1000L
        AlarmScheduler.scheduleAt(context, test, at, isSnooze = true)
        return at
    }

    // ════════════════════════════════════════════════
    //  شاشات الإعدادات
    // ════════════════════════════════════════════════

    private fun closeAlarmScreen() {
        LocalBroadcastManager.getInstance(context)
            .sendBroadcast(Intent(AlarmActivity.EVENT_CLOSE_SCREEN))
    }

    private fun open(intent: Intent): Boolean {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        (activityProvider() ?: context).startActivity(intent)
        return true
    }

    private fun openExactAlarmSettings(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return false
        return open(
            Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM)
                .setData(Uri.parse("package:${context.packageName}")),
        )
    }

    private fun openFullScreenIntentSettings(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return false
        return open(
            Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT)
                .setData(Uri.parse("package:${context.packageName}")),
        )
    }

    private fun openBatteryOptimization(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return false

        /**
         * ️ `ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` بيفتح
         *    حوار مباشر، لكن جوجل بلاي بتراجعه بصرامة. لو اترفض،
         *    البديل الآمن هو فتح القائمة العامة والمستخدم يدوّر.
         */
        return try {
            open(
                Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
                    .setData(Uri.parse("package:${context.packageName}")),
            )
        } catch (e: Exception) {
            open(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
        }
    }

    private fun openNotificationSettings(): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            open(
                Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                    .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName),
            )
        } else {
            open(
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                    .setData(Uri.parse("package:${context.packageName}")),
            )
        }

    /**
     * ️ قائمة «التشغيل التلقائي» بتاعة الشركة.
     *
     *    مفيش لها نيّة قياسية في أندرويد — كل شركة عاملة شاشة
     *    بمسار مختلف. بنجرّب المعروفين، ولو كلهم فشلوا بنفتح
     *    صفحة التطبيق العادية بدل ما نرمي استثناء.
     */
    private fun openOemAutoStart(): Boolean {
        val candidates = listOf(
            "com.miui.securitycenter" to
                "com.miui.permcenter.autostart.AutoStartManagementActivity",
            "com.huawei.systemmanager" to
                "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity",
            "com.coloros.safecenter" to
                "com.coloros.safecenter.permission.startup.StartupAppListActivity",
            "com.vivo.permissionmanager" to
                "com.vivo.permissionmanager.activity.BgStartUpManagerActivity",
            "com.asus.mobilemanager" to "com.asus.mobilemanager.entry.FunctionActivity",
            "com.letv.android.letvsafe" to
                "com.letv.android.letvsafe.AutobootManageActivity",
        )

        for ((pkg, cls) in candidates) {
            try {
                val intent = Intent().setClassName(pkg, cls)
                if (context.packageManager.resolveActivity(intent, 0) != null) {
                    return open(intent)
                }
            } catch (e: Exception) {
                // نجرّب اللي بعده
            }
        }

        return open(
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                .setData(Uri.parse("package:${context.packageName}")),
        )
    }
}
