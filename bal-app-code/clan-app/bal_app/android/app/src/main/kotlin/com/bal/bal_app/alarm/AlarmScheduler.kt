package com.bal.bal_app.alarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import java.util.Calendar

/**
 * ════════════════════════════════════════════════════════════
 *  المجدول — قلب النظام على أندرويد
 * ════════════════════════════════════════════════════════════
 *
 *  نستخدم setAlarmClock() وليس setExactAndAllowWhileIdle().
 *
 *  الفرق ليس تجميلياً:
 *
 *  ┌──────────────────────────┬─────────────┬────────────────┐
 *  │                          │ setExact…   │ setAlarmClock  │
 *  ├──────────────────────────┼─────────────┼────────────────┤
 *  │ يخترق Doze               │ مرة/9 دقائق │ دائماً          │
 *  │ يخترق Battery Saver      │ ❌          │ ✅              │
 *  │ أيقونة ⏰ في شريط الحالة │ ❌          │ ✅              │
 *  │ أولوية عند ضغط الذاكرة   │ عادية       │ الأعلى         │
 *  │ شاومي/هواوي تقتله        │ غالباً       │ نادراً          │
 *  └──────────────────────────┴─────────────┴────────────────┘
 *
 *  setAlarmClock هو نفس ما يستخدمه تطبيق الساعة المدمج.
 *  النظام يعامله كوعد للمستخدم لا يجوز إخلافه.
 *
 *  ملاحظة مهمة: setAlarmClock لا يدعم التكرار.
 *  نجدول أقرب وقوع فقط، ثم نعيد الجدولة لحظة الرنين.
 *  (setRepeating صار غير دقيق منذ أندرويد 4.4 — لا تستخدمه أبداً)
 */
object AlarmScheduler {

    private const val TAG = "ClanAlarmScheduler"

    // ════════════════════════════════════════════════
    //  الصلاحيات
    // ════════════════════════════════════════════════

    /**
     * هل يسمح النظام بمنبهات دقيقة؟
     *
     * على أندرويد 12 (API 31) و13، المستخدم يستطيع منعها.
     * من أندرويد 14 مع إذن USE_EXACT_ALARM تُمنح تلقائياً ولا تُسحب.
     */
    fun canScheduleExact(ctx: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        return am.canScheduleExactAlarms()
    }

    // ════════════════════════════════════════════════
    //  حساب الموعد
    // ════════════════════════════════════════════════

    /**
     * أقرب وقوع قادم لمنبه.
     *
     * يعيد -1 لو المنبه معطّل أو بلا أيام مختارة.
     *
     * ⚠️ نقطة حرجة: نستخدم Calendar لا حسابات يدوية.
     *    السبب هو التوقيت الصيفي — في ليلة تغيير الساعة، الساعة 2:30
     *    قد لا توجد أصلاً أو توجد مرتين. Calendar يتعامل مع هذا،
     *    والحساب اليدوي بالملي ثانية يخطئ بساعة كاملة.
     */
    fun nextOccurrence(alarm: AlarmEntity, fromMillis: Long = System.currentTimeMillis()): Long {
        if (!alarm.enabled) return -1L
        if (alarm.weekdays.isEmpty()) return -1L

        var best = Long.MAX_VALUE

        for (jsDay in alarm.weekdays) {
            // Calendar.SUNDAY = 1 … Calendar.SATURDAY = 7
            // اصطلاح JS: الأحد = 0 … السبت = 6
            val calendarDay = jsDay + 1

            val cal = Calendar.getInstance().apply {
                timeInMillis = fromMillis
                set(Calendar.HOUR_OF_DAY, alarm.hour)
                set(Calendar.MINUTE, alarm.minute)
                set(Calendar.SECOND, 0)
                set(Calendar.MILLISECOND, 0)
            }

            var delta = (calendarDay - cal.get(Calendar.DAY_OF_WEEK) + 7) % 7

            // نفس اليوم لكن الوقت فات → الأسبوع القادم
            if (delta == 0 && cal.timeInMillis <= fromMillis) delta = 7

            cal.add(Calendar.DAY_OF_YEAR, delta)

            if (cal.timeInMillis < best) best = cal.timeInMillis
        }

        return if (best == Long.MAX_VALUE) -1L else best
    }

    // ════════════════════════════════════════════════
    //  PendingIntent
    // ════════════════════════════════════════════════

    /**
     * رمز طلب فريد لكل منبه.
     *
     * لو استخدمنا رمزاً ثابتاً، أندرويد يعتبر كل الـ PendingIntents
     * نفس الشيء ويدوس الجديد على القديم — فيبقى منبه واحد فقط يعمل.
     */
    private fun requestCodeFor(alarmId: String): Int =
        AlarmContract.REQUEST_CODE_BASE + (alarmId.hashCode() and 0x0000FFFF)

    private fun firePendingIntent(
        ctx: Context,
        alarm: AlarmEntity,
        occurrenceAt: Long,
        isSnooze: Boolean
    ): PendingIntent {
        val intent = Intent(ctx, AlarmReceiver::class.java).apply {
            action = AlarmContract.ACTION_ALARM_FIRE
            putExtra(AlarmContract.EXTRA_ALARM_ID, alarm.id)
            putExtra(AlarmContract.EXTRA_OCCURRENCE_AT, occurrenceAt)
            putExtra(AlarmContract.EXTRA_LABEL, alarm.label)
            putExtra(AlarmContract.EXTRA_IS_SNOOZE, isSnooze)
        }

        // FLAG_IMMUTABLE إجباري من أندرويد 12 — بدونه يرفض النظام الـ PendingIntent
        return PendingIntent.getBroadcast(
            ctx,
            requestCodeFor(alarm.id),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    /**
     * النية التي تُفتح عند الضغط على أيقونة ⏰ في شريط الحالة.
     * تأخذ المستخدم لشاشة المنبهات في التطبيق.
     */
    private fun showIntent(ctx: Context): PendingIntent {
        val launch = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)
            ?: Intent()
        launch.putExtra("screen", "alarms")

        return PendingIntent.getActivity(
            ctx,
            AlarmContract.REQUEST_CODE_BASE - 1,
            launch,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    // ════════════════════════════════════════════════
    //  الجدولة
    // ════════════════════════════════════════════════

    /**
     * جدولة منبه واحد لأقرب وقوع.
     * @return وقت الرنين بالملي ثانية، أو -1 لو لم تتم الجدولة
     */
    fun schedule(ctx: Context, alarm: AlarmEntity): Long {
        val at = nextOccurrence(alarm)
        if (at <= 0) return -1L
        return scheduleAt(ctx, alarm, at, isSnooze = false)
    }

    /** جدولة على وقت محدد — يُستخدم للغفوة أيضاً */
    fun scheduleAt(ctx: Context, alarm: AlarmEntity, at: Long, isSnooze: Boolean): Long {
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val fire = firePendingIntent(ctx, alarm, at, isSnooze)

        try {
            if (canScheduleExact(ctx)) {
                // ── المسار الأمثل ──
                // setAlarmClock: أعلى أولوية في النظام،
                // يخترق Doze و Battery Saver، ويعرض أيقونة ⏰
                am.setAlarmClock(
                    AlarmManager.AlarmClockInfo(at, showIntent(ctx)),
                    fire
                )
                Log.i(TAG, "setAlarmClock ${alarm.id} @ $at")
            } else {
                // ── المسار الاحتياطي ──
                // المستخدم منع المنبهات الدقيقة.
                // setAndAllowWhileIdle يخترق Doze لكن بتأخير قد يصل 9 دقائق.
                // أفضل من لا شيء — والواجهة تحذّر المستخدم.
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, fire)
                Log.w(TAG, "fallback inexact ${alarm.id} @ $at")
            }
        } catch (e: SecurityException) {
            // يحدث لو سُحب الإذن بين الفحص والاستدعاء
            Log.e(TAG, "SecurityException scheduling ${alarm.id}", e)
            try {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, fire)
            } catch (e2: Exception) {
                Log.e(TAG, "fallback also failed", e2)
                return -1L
            }
        }

        return at
    }

    fun cancel(ctx: Context, alarm: AlarmEntity) {
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        am.cancel(firePendingIntent(ctx, alarm, 0L, false))
        Log.i(TAG, "cancelled ${alarm.id}")
    }

    fun cancelById(ctx: Context, alarmId: String) {
        val alarm = AlarmStore.findById(ctx, alarmId) ?: return
        cancel(ctx, alarm)
    }

    /**
     * إعادة جدولة كل المنبهات المفعّلة.
     *
     * تُستدعى في خمس حالات — كل واحدة تسدّ ثغرة حقيقية:
     *   1. بعد إعادة تشغيل الهاتف   (النظام مسح كل شيء)
     *   2. بعد تحديث التطبيق        (نفس المشكلة)
     *   3. بعد تغيير المنطقة الزمنية (المواعيد المحسوبة صارت خاطئة)
     *   4. عند فتح التطبيق          (شبكة أمان أخيرة)
     *   5. بعد رنين أي منبه          (لجدولة الأسبوع القادم)
     */
    fun rescheduleAll(ctx: Context): Int {
        val alarms = AlarmStore.loadAll(ctx)
        var count = 0

        alarms.forEach { alarm ->
            if (alarm.enabled) {
                if (schedule(ctx, alarm) > 0) count++
            } else {
                cancel(ctx, alarm)
            }
        }

        AlarmStore.markRescheduled(ctx)
        Log.i(TAG, "rescheduled $count / ${alarms.size}")
        return count
    }
}
