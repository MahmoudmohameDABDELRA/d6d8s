package com.clanapp.alarm

/**
 * ════════════════════════════════════════════════════════════
 *  ثوابت نظام المنبه — مصدر واحد للحقيقة
 * ════════════════════════════════════════════════════════════
 *
 *  أي اسم مفتاح (key) يُستخدم في أكثر من ملف يعيش هنا.
 *  السبب: خطأ حرف واحد في اسم extra = منبه لا يرن، بلا أي رسالة خطأ.
 */
object AlarmContract {

    // ── قناة الإشعارات ─────────────────────────────────────
    const val CHANNEL_ID = "clan_alarm_channel_v2"
    /**
     * اسم القناة احتياطي فقط.
     * الاسم المعروض يأتي من R.string.clan_alarm_channel_name.
     */
    const val CHANNEL_NAME = "Clan Alarm"

    /** معرّف إشعار الخدمة الأمامية — ثابت، فالخدمة واحدة في كل وقت */
    const val FOREGROUND_NOTIFICATION_ID = 7701

    // ── أوامر Intent ───────────────────────────────────────
    const val ACTION_ALARM_FIRE = "com.clanapp.alarm.ACTION_FIRE"
    const val ACTION_ALARM_DISMISS = "com.clanapp.alarm.ACTION_DISMISS"
    const val ACTION_ALARM_SNOOZE = "com.clanapp.alarm.ACTION_SNOOZE"

    /** يُبثّ داخلياً ليعرف الـ JS أن المنبه رنّ */
    const val ACTION_ALARM_RINGING_EVENT = "com.clanapp.alarm.EVENT_RINGING"

    // ── مفاتيح الـ extras ──────────────────────────────────
    const val EXTRA_ALARM_ID = "alarmId"
    const val EXTRA_OCCURRENCE_AT = "occurrenceAt"
    const val EXTRA_LABEL = "label"
    const val EXTRA_WEEKDAY = "weekday"
    const val EXTRA_IS_SNOOZE = "isSnooze"

    // ── التخزين ────────────────────────────────────────────
    const val PREFS_NAME = "clan_alarm_store"
    const val KEY_ALARMS_JSON = "alarms_json"
    const val KEY_VOLUME_BOOST = "volume_boost"
    const val KEY_LAST_RESCHEDULE = "last_reschedule_at"

    // ── حدود زمنية ─────────────────────────────────────────
    /**
     * أقصى مدة رنين قبل استسلام الخدمة (بالملي ثانية).
     * 10 دقائق — بعدها يُسجَّل «فاتك المنبه» وتتوقف.
     * السبب: منبه يرن للأبد يستنزف البطارية ويغضب المستخدم.
     */
    const val MAX_RING_DURATION_MS = 10 * 60 * 1000L

    /** تدرّج الصوت: من 30% إلى 100% خلال هذه المدة */
    const val VOLUME_RAMP_MS = 25 * 1000L

    /** كل كم ملي ثانية نرفع الصوت درجة أثناء التدرّج */
    const val VOLUME_RAMP_STEP_MS = 800L

    /**
     * رمز الطلب الأساسي للـ PendingIntent.
     * نضيف عليه هاش المنبه ليكون لكل منبه رمز فريد،
     * وإلا داس منبه على منبه (النظام يوحّد الـ PendingIntents المتطابقة).
     */
    const val REQUEST_CODE_BASE = 90_000

    /** نافذة التسامح: منبه تأخّر أكثر من كده يُعتبر فائتاً لا يُرَنّ */
    const val STALE_THRESHOLD_MS = 5 * 60 * 1000L
}
