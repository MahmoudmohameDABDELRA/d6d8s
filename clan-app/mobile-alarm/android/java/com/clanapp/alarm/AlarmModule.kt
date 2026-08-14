package com.clanapp.alarm

import android.app.Activity
import android.app.AlarmManager
import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import androidx.localbroadcastmanager.content.LocalBroadcastManager

// R في حزمة التطبيق الأصل - المثبّت يصحح الاسم
import com.clanapp.R

/**
 * ════════════════════════════════════════════════════════════
 *  الجسر إلى JavaScript
 * ════════════════════════════════════════════════════════════
 *
 *  كل ما يحتاجه الـ JS: جدولة · إلغاء · صلاحيات · تشخيص.
 */
class AlarmModule(private val reactCtx: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactCtx) {

    companion object {
        private const val TAG = "ClanAlarmModule"
        const val NAME = "ClanAlarm"
    }

    override fun getName(): String = NAME

    private var eventReceiver: BroadcastReceiver? = null

    // ════════════════════════════════════════════════
    //  الأحداث → JS
    // ════════════════════════════════════════════════

    override fun initialize() {
        super.initialize()

        eventReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                val event = intent?.getStringExtra("event") ?: return
                val map = Arguments.createMap().apply {
                    putString("event", event)
                    putString("alarmId", intent.getStringExtra(AlarmContract.EXTRA_ALARM_ID))
                    intent.getStringExtra("label")?.let { putString("label", it) }
                    val nextAt = intent.getLongExtra("nextAt", -1L)
                    if (nextAt > 0) putDouble("nextAt", nextAt.toDouble())
                }
                sendEvent("ClanAlarmEvent", map)
            }
        }

        LocalBroadcastManager.getInstance(reactCtx).registerReceiver(
            eventReceiver!!,
            IntentFilter(AlarmContract.ACTION_ALARM_RINGING_EVENT)
        )
    }

    override fun invalidate() {
        eventReceiver?.let {
            try {
                LocalBroadcastManager.getInstance(reactCtx).unregisterReceiver(it)
            } catch (e: Exception) { /* ignore */ }
        }
        super.invalidate()
    }

    private fun sendEvent(name: String, data: WritableMap) {
        try {
            reactCtx
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(name, data)
        } catch (e: Exception) {
            Log.e(TAG, "sendEvent failed", e)
        }
    }

    /** مطلوبان للـ NativeEventEmitter على iOS/الأرشتكتشر الجديد */
    @ReactMethod fun addListener(eventName: String) { /* no-op */ }
    @ReactMethod fun removeListeners(count: Int) { /* no-op */ }

    // ════════════════════════════════════════════════
    //  التشخيص — «هل منبهي مضمون؟»
    // ════════════════════════════════════════════════

    /**
     * فحص شامل لكل ما قد يمنع المنبه من الرنين.
     * الواجهة تعرض هذا للمستخدم كقائمة مراجعة.
     */
    @ReactMethod
    fun getDiagnostics(promise: Promise) {
        try {
            val ctx = reactCtx.applicationContext
            val result = Arguments.createMap()

            result.putString("platform", "android")
            result.putInt("sdkInt", Build.VERSION.SDK_INT)
            result.putString("manufacturer", Build.MANUFACTURER)
            result.putString("model", Build.MODEL)

            // 1) منبهات دقيقة
            result.putBoolean("canScheduleExactAlarms", AlarmScheduler.canScheduleExact(ctx))

            // 2) شاشة كاملة
            val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            val canFullScreen =
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
                    nm.canUseFullScreenIntent()
                else true
            result.putBoolean("canUseFullScreenIntent", canFullScreen)

            // 3) الإشعارات مفعّلة
            result.putBoolean("notificationsEnabled", nm.areNotificationsEnabled())

            // 4) القناة غير مكتومة
            var channelOk = true
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val ch = nm.getNotificationChannel(AlarmContract.CHANNEL_ID)
                channelOk = ch == null || ch.importance >= NotificationManager.IMPORTANCE_DEFAULT
            }
            result.putBoolean("channelNotMuted", channelOk)

            // 5) مستثنى من تحسين البطارية — الأهم على شاومي/أوبو/فيفو
            val pm = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
            val ignoringBattery =
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
                    pm.isIgnoringBatteryOptimizations(ctx.packageName)
                else true
            result.putBoolean("ignoringBatteryOptimizations", ignoringBattery)

            // 6) هل الشركة معروفة بقتل التطبيقات؟
            val aggressive = listOf(
                "xiaomi", "redmi", "poco", "huawei", "honor",
                "oppo", "realme", "oneplus", "vivo", "iqoo",
                "meizu", "asus", "wiko", "lenovo", "blackview",
                "infinix", "tecno", "itel", "nothing"
            )
            val brand = Build.MANUFACTURER.lowercase()
            result.putBoolean("aggressiveOem", aggressive.any { brand.contains(it) })

            // 7) آخر إعادة جدولة
            result.putDouble("lastRescheduleAt", AlarmStore.lastRescheduleAt(ctx).toDouble())
            result.putInt("scheduledCount", AlarmStore.loadAll(ctx).count { it.enabled })
            result.putBoolean("volumeBoost", AlarmStore.isVolumeBoostEnabled(ctx))

            // 8) الدرجة الكلية
            val allGood = AlarmScheduler.canScheduleExact(ctx) &&
                    canFullScreen &&
                    nm.areNotificationsEnabled() &&
                    channelOk &&
                    ignoringBattery
            result.putBoolean("guaranteed", allGood)

            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("DIAGNOSTICS_FAILED", e.message, e)
        }
    }

    // ════════════════════════════════════════════════
    //  فتح شاشات الإعدادات
    // ════════════════════════════════════════════════

    /**
     * ملاحظة توافق:
     * في React Native 0.71+ صار currentActivity خاصية على ReactApplicationContext
     * لا على الوحدة نفسها. نقرؤها من reactCtx مباشرةً ليعمل الكود
     * على النسخ القديمة والجديدة معاً.
     */
    private fun openSettings(intent: Intent, promise: Promise) {
        try {
            val activity: Activity? = reactCtx.currentActivity
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            (activity ?: reactCtx).startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("OPEN_SETTINGS_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun openExactAlarmSettings(promise: Promise) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            promise.resolve(false); return
        }
        openSettings(
            Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM)
                .setData(Uri.parse("package:${reactCtx.packageName}")),
            promise
        )
    }

    @ReactMethod
    fun openFullScreenIntentSettings(promise: Promise) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            promise.resolve(false); return
        }
        openSettings(
            Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT)
                .setData(Uri.parse("package:${reactCtx.packageName}")),
            promise
        )
    }

    @ReactMethod
    fun openBatteryOptimizationSettings(promise: Promise) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            promise.resolve(false); return
        }
        // النية المباشرة تطلب الاستثناء بنافذة واحدة بدل التنقّل اليدوي
        openSettings(
            Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
                .setData(Uri.parse("package:${reactCtx.packageName}")),
            promise
        )
    }

    @ReactMethod
    fun openNotificationSettings(promise: Promise) {
        val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, reactCtx.packageName)
        } else {
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                .setData(Uri.parse("package:${reactCtx.packageName}"))
        }
        openSettings(intent, promise)
    }

    /**
     * شاشة «التشغيل التلقائي» على أجهزة الشركات الصينية.
     * ليست واجهة رسمية — نجرّب النوايا المعروفة واحدة تلو الأخرى.
     */
    @ReactMethod
    fun openOemAutoStartSettings(promise: Promise) {
        val candidates = listOf(
            "com.miui.securitycenter" to "com.miui.permcenter.autostart.AutoStartManagementActivity",
            "com.letv.android.letvsafe" to "com.letv.android.letvsafe.AutobootManageActivity",
            "com.huawei.systemmanager" to "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity",
            "com.huawei.systemmanager" to "com.huawei.systemmanager.optimize.process.ProtectActivity",
            "com.coloros.safecenter" to "com.coloros.safecenter.permission.startup.StartupAppListActivity",
            "com.coloros.safecenter" to "com.coloros.safecenter.startupapp.StartupAppListActivity",
            "com.oppo.safe" to "com.oppo.safe.permission.startup.StartupAppListActivity",
            "com.iqoo.secure" to "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity",
            "com.vivo.permissionmanager" to "com.vivo.permissionmanager.activity.BgStartUpManagerActivity",
            "com.asus.mobilemanager" to "com.asus.mobilemanager.entry.FunctionActivity",
            "com.samsung.android.lool" to "com.samsung.android.sm.ui.battery.BatteryActivity"
        )

        for ((pkg, cls) in candidates) {
            try {
                val intent = Intent().setClassName(pkg, cls)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                if (reactCtx.packageManager.resolveActivity(intent, 0) != null) {
                    (reactCtx.currentActivity ?: reactCtx).startActivity(intent)
                    promise.resolve(true)
                    return
                }
            } catch (e: Exception) { /* جرّب التالي */ }
        }

        // لا شاشة معروفة → افتح إعدادات التطبيق العامة
        try {
            (reactCtx.currentActivity ?: reactCtx).startActivity(
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                    .setData(Uri.parse("package:${reactCtx.packageName}"))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
            promise.resolve(false)
        } catch (e: Exception) {
            promise.reject("NO_OEM_SCREEN", e.message, e)
        }
    }

    // ════════════════════════════════════════════════
    //  الجدولة
    // ════════════════════════════════════════════════

    private fun readAlarm(map: ReadableMap): AlarmEntity {
        val daysArray = map.getArray("weekdays")
        val days = mutableListOf<Int>()
        if (daysArray != null) {
            for (i in 0 until daysArray.size()) days.add(daysArray.getInt(i))
        }

        return AlarmEntity(
            id = map.getString("id") ?: throw IllegalArgumentException("id required"),
            hour = map.getInt("hour"),
            minute = map.getInt("minute"),
            weekdays = days,
            label = if (map.hasKey("label")) {
                map.getString("label")
                    ?: reactCtx.getString(R.string.clan_alarm_default_label)
            } else {
                reactCtx.getString(R.string.clan_alarm_default_label)
            },
            enabled = !map.hasKey("enabled") || map.getBoolean("enabled"),
            snoozeMinutes = if (map.hasKey("snoozeMinutes")) map.getInt("snoozeMinutes") else 0,
            requireChallenge = !map.hasKey("requireChallenge") || map.getBoolean("requireChallenge")
        )
    }

    @ReactMethod
    fun setAlarm(config: ReadableMap, promise: Promise) {
        try {
            val alarm = readAlarm(config)
            AlarmStore.upsert(reactCtx, alarm)

            val at = if (alarm.enabled) {
                AlarmScheduler.schedule(reactCtx, alarm)
            } else {
                AlarmScheduler.cancel(reactCtx, alarm); -1L
            }

            promise.resolve(Arguments.createMap().apply {
                putBoolean("success", at > 0 || !alarm.enabled)
                putDouble("nextTriggerAt", at.toDouble())
                putBoolean("exact", AlarmScheduler.canScheduleExact(reactCtx))
            })
        } catch (e: Exception) {
            promise.reject("SET_ALARM_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun removeAlarm(alarmId: String, promise: Promise) {
        try {
            AlarmScheduler.cancelById(reactCtx, alarmId)
            AlarmStore.remove(reactCtx, alarmId)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("REMOVE_FAILED", e.message, e)
        }
    }

    /** يستبدل كل المنبهات دفعة واحدة — يُستدعى بعد المزامنة مع الخادم */
    @ReactMethod
    fun syncAlarms(list: ReadableArray, promise: Promise) {
        try {
            // ألغِ القديم أولاً وإلا بقيت منبهات يتيمة مجدولة
            AlarmStore.loadAll(reactCtx).forEach { AlarmScheduler.cancel(reactCtx, it) }

            // getMap يرجع ReadableMap? في RN الحديث — نتخطى أي عنصر فارغ
            val alarms = (0 until list.size()).mapNotNull { i ->
                try {
                    val item = list.getMap(i) ?: return@mapNotNull null
                    readAlarm(item)
                } catch (e: Exception) { null }
            }
            AlarmStore.saveAll(reactCtx, alarms)

            val count = AlarmScheduler.rescheduleAll(reactCtx)
            promise.resolve(Arguments.createMap().apply {
                putInt("scheduled", count)
                putInt("total", alarms.size)
            })
        } catch (e: Exception) {
            promise.reject("SYNC_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun rescheduleAll(promise: Promise) {
        try {
            promise.resolve(AlarmScheduler.rescheduleAll(reactCtx))
        } catch (e: Exception) {
            promise.reject("RESCHEDULE_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun getScheduledAlarms(promise: Promise) {
        try {
            val arr = Arguments.createArray()
            AlarmStore.loadAll(reactCtx).forEach { alarm ->
                arr.pushMap(Arguments.createMap().apply {
                    putString("id", alarm.id)
                    putInt("hour", alarm.hour)
                    putInt("minute", alarm.minute)
                    putBoolean("enabled", alarm.enabled)
                    putString("label", alarm.label)
                    putDouble("nextTriggerAt", AlarmScheduler.nextOccurrence(alarm).toDouble())
                })
            }
            promise.resolve(arr)
        } catch (e: Exception) {
            promise.reject("LIST_FAILED", e.message, e)
        }
    }

    // ════════════════════════════════════════════════
    //  التحكم أثناء الرنين
    // ════════════════════════════════════════════════

    @ReactMethod
    fun getRingingAlarm(promise: Promise) {
        promise.resolve(Arguments.createMap().apply {
            putBoolean("isRinging", AlarmRingService.isRinging)
            putString("alarmId", AlarmRingService.currentAlarmId)
        })
    }

    /**
     * يُستدعى فقط بعد حل المسألة بنجاح.
     *
     * يفعل شيئين لا بد منهما معاً:
     *   1. إيقاف الصوت والاهتزاز
     *   2. **إغلاق شاشة المنبه**
     *
     * بدون الثانية تبقى الشاشة معلّقة في المقدمة، فتتجمّد
     * أزرار النظام كلها — وهو ما ظهر في الاختبار الحقيقي.
     */
    @ReactMethod
    fun dismissRinging(alarmId: String, promise: Promise) {
        try {
            AlarmRingService.stopRinging(reactCtx, alarmId, dismissed = true)
            closeAlarmScreenInternal()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("DISMISS_FAILED", e.message, e)
        }
    }

    /** إغلاق شاشة المنبه دون إيقاف الصوت — للحالات الخاصة */
    @ReactMethod
    fun closeAlarmScreen(promise: Promise) {
        try {
            closeAlarmScreenInternal()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("CLOSE_FAILED", e.message, e)
        }
    }

    private fun closeAlarmScreenInternal() {
        LocalBroadcastManager.getInstance(reactCtx)
            .sendBroadcast(Intent(AlarmActivity.EVENT_CLOSE_SCREEN))
    }

    @ReactMethod
    fun snoozeRinging(alarmId: String, promise: Promise) {
        try {
            AlarmRingService.snooze(reactCtx, alarmId)
            closeAlarmScreenInternal()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SNOOZE_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun setVolumeBoost(enabled: Boolean, promise: Promise) {
        AlarmStore.setVolumeBoost(reactCtx, enabled)
        promise.resolve(true)
    }

    /** اختبار فوري: يرن بعد ثوانٍ قليلة للتحقق من الإعداد */
    @ReactMethod
    fun testFireIn(seconds: Int, promise: Promise) {
        try {
            val test = AlarmEntity(
                id = "__test__",
                hour = 0, minute = 0,
                weekdays = emptyList(),
                label = reactCtx.getString(R.string.clan_alarm_test_label),
                enabled = true,
                snoozeMinutes = 0,
                requireChallenge = false
            )
            AlarmStore.upsert(reactCtx, test)
            val at = System.currentTimeMillis() + seconds * 1000L
            AlarmScheduler.scheduleAt(reactCtx, test, at, isSnooze = true)
            promise.resolve(at.toDouble())
        } catch (e: Exception) {
            promise.reject("TEST_FAILED", e.message, e)
        }
    }
}
