package com.bal.bal_app.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

/**
 * ════════════════════════════════════════════════════════════
 *  المستقبِل — يُستيقظ لحظة الرنين
 * ════════════════════════════════════════════════════════════
 *
 *  ⚠️ قاعدة ذهبية: onReceive عنده ~10 ثوانٍ فقط.
 *     بعدها يقتله النظام. ممنوع أي عمل ثقيل هنا.
 *
 *  الدور الوحيد: تشغيل الخدمة الأمامية فوراً، والانصراف.
 *  الخدمة الأمامية هي التي تعيش وتُشغّل الصوت.
 */
class AlarmReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "ClanAlarmReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        Log.i(TAG, "received: $action")

        when (action) {

            // ── الجهاز أعاد الإقلاع أو التطبيق تحدّث ──
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_LOCKED_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED,
            "android.intent.action.QUICKBOOT_POWERON",
            // شاومي تبثّ نيّة خاصة بها بدل القياسية
            "com.htc.intent.action.QUICKBOOT_POWERON" -> {
                Log.i(TAG, "boot/update - rescheduling")
                AlarmScheduler.rescheduleAll(context)
            }

            // ── المنطقة الزمنية أو الوقت تغيّر ──
            // بدون هذا: مسافر من القاهرة للرياض، منبهه يرن الساعة الغلط
            Intent.ACTION_TIMEZONE_CHANGED,
            Intent.ACTION_TIME_CHANGED,
            Intent.ACTION_DATE_CHANGED -> {
                Log.i(TAG, "time changed - rescheduling")
                AlarmScheduler.rescheduleAll(context)
            }

            // ── حان وقت الرنين ──
            AlarmContract.ACTION_ALARM_FIRE -> handleFire(context, intent)

            // ── أزرار الإشعار ──
            AlarmContract.ACTION_ALARM_DISMISS -> {
                val id = intent.getStringExtra(AlarmContract.EXTRA_ALARM_ID) ?: return
                AlarmRingService.stopRinging(context, id, dismissed = true)
            }

            AlarmContract.ACTION_ALARM_SNOOZE -> {
                val id = intent.getStringExtra(AlarmContract.EXTRA_ALARM_ID) ?: return
                AlarmRingService.snooze(context, id)
            }
        }
    }

    private fun handleFire(context: Context, intent: Intent) {
        val alarmId = intent.getStringExtra(AlarmContract.EXTRA_ALARM_ID) ?: run {
            Log.e(TAG, "fire without alarmId")
            return
        }
        val occurrenceAt = intent.getLongExtra(AlarmContract.EXTRA_OCCURRENCE_AT, 0L)
        val isSnooze = intent.getBooleanExtra(AlarmContract.EXTRA_IS_SNOOZE, false)

        val alarm = AlarmStore.findById(context, alarmId)
        if (alarm == null) {
            Log.w(TAG, "alarm $alarmId no longer exists")
            return
        }

        /**
         * فحص التقادُم.
         *
         * السيناريو: الهاتف كان مطفياً وقت الرنين، واشتغل بعد ساعتين.
         * النظام أحياناً يسلّم المنبه المتأخر فوراً.
         * منبه الساعة 6 صباحاً يرن الساعة 8 = إزعاج بلا فائدة.
         *
         * الحل: لو تأخر أكثر من 5 دقائق، نتجاهله ونجدول القادم.
         */
        val lateness = System.currentTimeMillis() - occurrenceAt
        if (occurrenceAt > 0 && lateness > AlarmContract.STALE_THRESHOLD_MS) {
            Log.w(TAG, "stale alarm $alarmId (late by ${lateness / 1000}s) - skip")
            if (!isSnooze) AlarmScheduler.schedule(context, alarm)
            return
        }

        // ── تشغيل خدمة الرنين ──
        val serviceIntent = Intent(context, AlarmRingService::class.java).apply {
            action = AlarmContract.ACTION_ALARM_FIRE
            putExtra(AlarmContract.EXTRA_ALARM_ID, alarmId)
            putExtra(AlarmContract.EXTRA_LABEL, alarm.label)
            putExtra(AlarmContract.EXTRA_OCCURRENCE_AT, occurrenceAt)
            putExtra(AlarmContract.EXTRA_IS_SNOOZE, isSnooze)
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                /**
                 * startForegroundService يعطينا 5 ثوانٍ لاستدعاء startForeground()
                 * وإلا رمى النظام ForegroundServiceDidNotStartInTimeException وقتل التطبيق.
                 *
                 * لهذا AlarmRingService.onStartCommand يستدعي startForeground()
                 * في أول سطر — قبل أي شيء آخر.
                 *
                 * ملاحظة: قيود أندرويد 12 على بدء الخدمات من الخلفية
                 * لا تنطبق على منبه أطلقه setAlarmClock — هذا استثناء صريح.
                 */
                context.startForegroundService(serviceIntent)
            } else {
                context.startService(serviceIntent)
            }
        } catch (e: Exception) {
            Log.e(TAG, "failed to start ring service", e)
        }

        // ── جدولة الأسبوع القادم فوراً ──
        // لا ننتظر المستخدم — لو أوقف المنبه وقفل التطبيق، تظل السلسلة حية
        if (!isSnooze) {
            AlarmScheduler.schedule(context, alarm)
        }
    }
}
