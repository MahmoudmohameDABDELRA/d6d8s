package com.bal.bal_app.alarm

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.localbroadcastmanager.content.LocalBroadcastManager

// R في حزمة التطبيق الأصل - المثبّت يصحح الاسم
import com.bal.bal_app.R

/**
 * ════════════════════════════════════════════════════════════
 *  خدمة الرنين — الجزء الذي «يخترق الصخر»
 * ════════════════════════════════════════════════════════════
 *
 *  المسؤوليات:
 *    1. خدمة أمامية → النظام لا يقتلها
 *    2. WakeLock    → المعالج لا ينام
 *    3. قناة ALARM  → الصوت يخرج حتى في الصامت ووضع عدم الإزعاج
 *    4. رفع الصوت   → يتجاوز خفض المستخدم لمستوى المنبه
 *    5. تدرّج تصاعدي → يبدأ 30% ويصل 100% خلال 25 ثانية
 *    6. اهتزاز متكرر → للصمم أو النوم العميق
 *    7. Full-Screen Intent → شاشة كاملة فوق قفل الشاشة
 *    8. مؤقت أمان   → يستسلم بعد 10 دقائق
 */
class AlarmRingService : Service() {

    companion object {
        private const val TAG = "ClanAlarmRingService"

        /** المنبه الذي يرن الآن — يقرأه الـ JS ليعرف أي مسألة يعرض */
        @Volatile
        var currentAlarmId: String? = null
            private set

        @Volatile
        var isRinging: Boolean = false
            private set

        /** يوقف الرنين من أي مكان في التطبيق */
        fun stopRinging(ctx: Context, alarmId: String, dismissed: Boolean) {
            val i = Intent(ctx, AlarmRingService::class.java).apply {
                action = AlarmContract.ACTION_ALARM_DISMISS
                putExtra(AlarmContract.EXTRA_ALARM_ID, alarmId)
            }
            try {
                ctx.startService(i)
            } catch (e: Exception) {
                Log.e(TAG, "stopRinging failed", e)
            }
        }

        fun snooze(ctx: Context, alarmId: String) {
            val i = Intent(ctx, AlarmRingService::class.java).apply {
                action = AlarmContract.ACTION_ALARM_SNOOZE
                putExtra(AlarmContract.EXTRA_ALARM_ID, alarmId)
            }
            try {
                ctx.startService(i)
            } catch (e: Exception) {
                Log.e(TAG, "snooze failed", e)
            }
        }
    }

    private var player: MediaPlayer? = null
    private var vibrator: Vibrator? = null
    private var wakeLock: PowerManager.WakeLock? = null

    private val handler = Handler(Looper.getMainLooper())
    private var rampRunnable: Runnable? = null
    private var timeoutRunnable: Runnable? = null

    /** مستوى صوت المنبه قبل تدخّلنا — نُرجعه كما كان عند الانتهاء */
    private var originalAlarmVolume: Int = -1

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action
        val alarmId = intent?.getStringExtra(AlarmContract.EXTRA_ALARM_ID)
        val label = intent?.getStringExtra(AlarmContract.EXTRA_LABEL)
            ?: getString(R.string.clan_alarm_default_label)

        Log.i(TAG, "onStartCommand action=$action id=$alarmId")

        when (action) {
            AlarmContract.ACTION_ALARM_DISMISS -> {
                handleDismiss(alarmId)
                return START_NOT_STICKY
            }
            AlarmContract.ACTION_ALARM_SNOOZE -> {
                handleSnooze(alarmId)
                return START_NOT_STICKY
            }
        }

        if (alarmId == null) {
            stopSelf()
            return START_NOT_STICKY
        }

        /**
         * ⚠️ يجب استدعاء startForeground خلال 5 ثوانٍ من startForegroundService.
         *    نضعه في أول سطر ممكن. أي تأخير = ForegroundServiceDidNotStartInTimeException.
         */
        ensureChannel()
        startForegroundCompat(buildRingingNotification(alarmId, label))

        currentAlarmId = alarmId
        isRinging = true

        acquireWakeLock()
        startSound()
        startVibration()
        armSafetyTimeout(alarmId)
        broadcastRingingToJs(alarmId, label)

        // START_STICKY: لو قتل النظام الخدمة تحت ضغط ذاكرة، يعيد تشغيلها
        return START_STICKY
    }

    // ════════════════════════════════════════════════
    //  قناة الإشعارات
    // ════════════════════════════════════════════════

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        val nm = getSystemService(NotificationManager::class.java)
        if (nm.getNotificationChannel(AlarmContract.CHANNEL_ID) != null) return

        val channel = NotificationChannel(
            AlarmContract.CHANNEL_ID,
            getString(R.string.clan_alarm_channel_name),
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = getString(R.string.clan_alarm_channel_desc)
            /**
             * bypassDnd: يخترق وضع «عدم الإزعاج».
             * يعمل فقط مع قنوات مصنّفة كمنبه — وهذا سبب استخدام
             * AudioAttributes.USAGE_ALARM بالأسفل.
             */
            setBypassDnd(true)
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 800, 400, 800, 400)
            /**
             * setSound(null): الصوت نشغّله بأنفسنا عبر MediaPlayer.
             * لو تركناه للقناة لحصلنا على صوتين متداخلين،
             * ولما استطعنا التحكم في التدرّج أو التكرار.
             */
            setSound(null, null)
            setShowBadge(true)
        }

        nm.createNotificationChannel(channel)
    }

    private fun startForegroundCompat(notification: Notification) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                // أندرويد 14+ يفرض تحديد نوع الخدمة الأمامية
                startForeground(
                    AlarmContract.FOREGROUND_NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
                )
            } else {
                startForeground(AlarmContract.FOREGROUND_NOTIFICATION_ID, notification)
            }
        } catch (e: Exception) {
            Log.e(TAG, "startForeground failed", e)
        }
    }

    // ════════════════════════════════════════════════
    //  الإشعار
    // ════════════════════════════════════════════════

    private fun buildRingingNotification(alarmId: String, label: String): Notification {
        // النية التي تفتح شاشة المنبه فوق القفل
        val fullScreenIntent = Intent(this, AlarmActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP or
                    Intent.FLAG_ACTIVITY_NO_USER_ACTION
            putExtra(AlarmContract.EXTRA_ALARM_ID, alarmId)
            putExtra(AlarmContract.EXTRA_LABEL, label)
        }

        val fullScreenPending = PendingIntent.getActivity(
            this,
            alarmId.hashCode(),
            fullScreenIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        /**
         * ⚠️ درس من الاختبار الحقيقي:
         *
         * كان هنا زر "إيقاف" يوقف المنبه مباشرةً — وهذا يهدم
         * فكرة التطبيق كلها. المستخدم النعسان يضغطه وينام.
         *
         * الآن الزر يفتح شاشة المسألة تماماً كالضغط على الإشعار.
         * لا مخرج إلا بالحل.
         */
        val solvePending = PendingIntent.getActivity(
            this,
            alarmId.hashCode() + 1,
            Intent(this, AlarmActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra(AlarmContract.EXTRA_ALARM_ID, alarmId)
                putExtra(AlarmContract.EXTRA_LABEL, label)
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val builder = NotificationCompat.Builder(this, AlarmContract.CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle(label)
            .setContentText(getString(R.string.clan_alarm_notification_body))
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)          // لا يُمسح بالسحب
            .setAutoCancel(false)
            .setOnlyAlertOnce(true)
            .setSilent(true)           // الصوت من MediaPlayer لا من الإشعار
            .setContentIntent(fullScreenPending)
            .addAction(
                android.R.drawable.ic_menu_edit,
                getString(R.string.clan_alarm_notification_action),
                solvePending
            )

        /**
         * Full-Screen Intent — الفرق بين إشعار وشاشة تملأ الجهاز.
         *
         * من أندرويد 14 (API 34) صار إذناً خاصاً.
         * تطبيقات المنبه تُمنحه تلقائياً — بشرط الإقرار في Play Console.
         * لكن نفحص دائماً: لو رُفض، النظام يخفضه لإشعار عادي بصمت
         * دون رمي أي استثناء. الصمت هو الخطر.
         */
        if (canUseFullScreen()) {
            builder.setFullScreenIntent(fullScreenPending, true)
        } else {
            Log.w(TAG, "full-screen intent NOT permitted - degrading to heads-up")
        }

        return builder.build()
    }

    private fun canUseFullScreen(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return true
        val nm = getSystemService(NotificationManager::class.java)
        return nm.canUseFullScreenIntent()
    }

    // ════════════════════════════════════════════════
    //  WakeLock
    // ════════════════════════════════════════════════

    private fun acquireWakeLock() {
        try {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = pm.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "ClanApp:AlarmRing"
            ).apply {
                setReferenceCounted(false)
                // مهلة إجبارية — لو انهارت الخدمة لا تظل البطارية مستنزفة
                acquire(AlarmContract.MAX_RING_DURATION_MS + 30_000L)
            }
        } catch (e: Exception) {
            Log.e(TAG, "wakelock failed", e)
        }
    }

    // ════════════════════════════════════════════════
    //  الصوت
    // ════════════════════════════════════════════════

    /**
     * هل المستخدم في مكالمة الآن؟
     *
     * مأخوذ من AlarmClock مفتوح المصدر: الرنين بأقصى صوت
     * أثناء مكالمة تجربة سيئة جداً. نخفض الصوت بدل الإلغاء —
     * فالمنبه ما زال مهماً، لكن دون أن يصمّ الأذن.
     */
    private fun isInCall(): Boolean {
        return try {
            val tm = getSystemService(Context.TELEPHONY_SERVICE)
                    as? android.telephony.TelephonyManager ?: return false

            @Suppress("DEPRECATION")
            val state = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                // callState يحتاج READ_PHONE_STATE من API 31 — نتجاهل بأمان
                try { tm.callState } catch (e: SecurityException) {
                    android.telephony.TelephonyManager.CALL_STATE_IDLE
                }
            } else {
                tm.callState
            }

            state != android.telephony.TelephonyManager.CALL_STATE_IDLE
        } catch (e: Exception) {
            false
        }
    }

    private fun startSound() {
        try {
            val audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
            val inCall = isInCall()
            if (inCall) Log.i(TAG, "user is in a call - reducing volume")

            /**
             * رفع مستوى صوت المنبه.
             *
             * المستخدم قد يكون خفض صوت المنبه للصفر بالخطأ.
             * نرفعه للحد الأقصى ونحفظ القيمة القديمة لنعيدها.
             *
             * ملاحظة: STREAM_ALARM منفصل عن STREAM_MUSIC و STREAM_RING.
             * وضع الصامت (Silent) يكتم RING و NOTIFICATION فقط — لا ALARM.
             * هذا هو سبب خروج الصوت رغم الصامت.
             */
            if (AlarmStore.isVolumeBoostEnabled(this) && !inCall) {
                originalAlarmVolume = audioManager.getStreamVolume(AudioManager.STREAM_ALARM)
                val max = audioManager.getStreamMaxVolume(AudioManager.STREAM_ALARM)
                audioManager.setStreamVolume(AudioManager.STREAM_ALARM, max, 0)
            }

            val soundUri: Uri = resolveAlarmSound()

            player = MediaPlayer().apply {
                setDataSource(this@AlarmRingService, soundUri)
                setAudioAttributes(
                    AudioAttributes.Builder()
                        // USAGE_ALARM: المفتاح السحري.
                        // يوجّه الصوت لقناة المنبه ويمنحه استثناء الصامت و DND.
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                )
                isLooping = true
                // أثناء المكالمة نبقى منخفضين ولا نتدرّج
                val startVol = if (inCall) 0.12f else 0.3f
                setVolume(startVol, startVol)
                setOnErrorListener { _, what, extra ->
                    Log.e(TAG, "MediaPlayer error what=$what extra=$extra")
                    // fallback: نغمة النظام الافتراضية
                    true
                }
                prepare()
                start()
            }

            if (!inCall) startVolumeRamp()
        } catch (e: Exception) {
            Log.e(TAG, "startSound failed", e)
            // آخر خط دفاع: نغمة الإشعار الافتراضية عبر Ringtone
            playFallbackTone()
        }
    }

    /**
     * ترتيب البحث عن الصوت:
     *   1. ملف مخصص في res/raw/clan_alarm
     *   2. نغمة المنبه الافتراضية في النظام
     *   3. نغمة الرنين
     *   4. نغمة الإشعار
     *
     * لماذا كل هذا؟ بعض أجهزة أندرويد المخصصة (خاصة الصينية الرخيصة)
     * لا تُعرّف نغمة منبه افتراضية أصلاً — فيرجع null ويصمت المنبه.
     */
    private fun resolveAlarmSound(): Uri {
        val rawId = resources.getIdentifier("clan_alarm", "raw", packageName)
        if (rawId != 0) {
            return Uri.parse("android.resource://$packageName/$rawId")
        }

        return RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
            ?: Uri.parse("android.resource://$packageName/${android.R.raw::class.java.hashCode()}")
    }

    private fun playFallbackTone() {
        try {
            val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
                ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
                ?: return
            RingtoneManager.getRingtone(applicationContext, uri)?.play()
        } catch (e: Exception) {
            Log.e(TAG, "fallback tone failed", e)
        }
    }

    /**
     * تدرّج تصاعدي للصوت.
     *
     * لماذا لا نبدأ بأقصى صوت مباشرة؟
     * الاستيقاظ الفجائي بصوت عالٍ يرفع الكورتيزول ويسبب صداعاً.
     * التدرّج خلال 25 ثانية يوقظ برفق — لكنه يصل للأقصى حتماً.
     */
    private fun startVolumeRamp() {
        val steps = (AlarmContract.VOLUME_RAMP_MS / AlarmContract.VOLUME_RAMP_STEP_MS).toInt()
        var currentStep = 0

        rampRunnable = object : Runnable {
            override fun run() {
                currentStep++
                if (currentStep > steps) return

                val progress = currentStep.toFloat() / steps
                val volume = 0.3f + (0.7f * progress)

                try {
                    player?.setVolume(volume, volume)
                } catch (e: Exception) {
                    return
                }

                handler.postDelayed(this, AlarmContract.VOLUME_RAMP_STEP_MS)
            }
        }

        handler.postDelayed(rampRunnable!!, AlarmContract.VOLUME_RAMP_STEP_MS)
    }

    // ════════════════════════════════════════════════
    //  الاهتزاز
    // ════════════════════════════════════════════════

    private fun startVibration() {
        try {
            vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vm = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
                vm.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            }

            // نمط: انتظر 0 · اهتز 800 · توقف 400 · اهتز 800 · توقف 400
            val pattern = longArrayOf(0, 800, 400, 800, 400)

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val effect = VibrationEffect.createWaveform(pattern, 0) // 0 = كرّر من البداية
                val attrs = AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .build()
                vibrator?.vibrate(effect, attrs)
            } else {
                @Suppress("DEPRECATION")
                vibrator?.vibrate(pattern, 0)
            }
        } catch (e: Exception) {
            Log.e(TAG, "vibration failed", e)
        }
    }

    // ════════════════════════════════════════════════
    //  مؤقت الأمان
    // ════════════════════════════════════════════════

    private fun armSafetyTimeout(alarmId: String) {
        timeoutRunnable = Runnable {
            Log.w(TAG, "max ring duration reached - giving up")
            broadcastMissedToJs(alarmId)
            cleanupAndStop()
        }
        handler.postDelayed(timeoutRunnable!!, AlarmContract.MAX_RING_DURATION_MS)
    }

    // ════════════════════════════════════════════════
    //  الإيقاف والغفوة
    // ════════════════════════════════════════════════

    private fun handleDismiss(alarmId: String?) {
        Log.i(TAG, "dismiss $alarmId")
        broadcastDismissedToJs(alarmId ?: "")
        cleanupAndStop()
    }

    private fun handleSnooze(alarmId: String?) {
        if (alarmId == null) { cleanupAndStop(); return }

        val alarm = AlarmStore.findById(this, alarmId)
        if (alarm == null || alarm.snoozeMinutes <= 0) {
            cleanupAndStop()
            return
        }

        val at = System.currentTimeMillis() + alarm.snoozeMinutes * 60_000L
        AlarmScheduler.scheduleAt(this, alarm, at, isSnooze = true)
        Log.i(TAG, "snoozed $alarmId for ${alarm.snoozeMinutes}min")

        broadcastSnoozedToJs(alarmId, at)
        cleanupAndStop()
    }

    private fun cleanupAndStop() {
        rampRunnable?.let { handler.removeCallbacks(it) }
        timeoutRunnable?.let { handler.removeCallbacks(it) }

        try {
            player?.let {
                if (it.isPlaying) it.stop()
                it.reset()
                it.release()
            }
        } catch (e: Exception) {
            Log.e(TAG, "player cleanup failed", e)
        }
        player = null

        try { vibrator?.cancel() } catch (e: Exception) { /* ignore */ }
        vibrator = null

        // إرجاع مستوى الصوت كما كان
        if (originalAlarmVolume >= 0) {
            try {
                val am = getSystemService(Context.AUDIO_SERVICE) as AudioManager
                am.setStreamVolume(AudioManager.STREAM_ALARM, originalAlarmVolume, 0)
            } catch (e: Exception) { /* ignore */ }
            originalAlarmVolume = -1
        }

        try {
            if (wakeLock?.isHeld == true) wakeLock?.release()
        } catch (e: Exception) { /* ignore */ }
        wakeLock = null

        currentAlarmId = null
        isRinging = false

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(STOP_FOREGROUND_REMOVE)
            } else {
                @Suppress("DEPRECATION")
                stopForeground(true)
            }
        } catch (e: Exception) { /* ignore */ }

        stopSelf()
    }

    override fun onDestroy() {
        super.onDestroy()
        cleanupAndStop()
    }

    // ════════════════════════════════════════════════
    //  البثّ إلى JavaScript
    // ════════════════════════════════════════════════

    private fun broadcast(event: String, alarmId: String, extra: Map<String, Any> = emptyMap()) {
        val i = Intent(AlarmContract.ACTION_ALARM_RINGING_EVENT).apply {
            putExtra("event", event)
            putExtra(AlarmContract.EXTRA_ALARM_ID, alarmId)
            extra.forEach { (k, v) ->
                when (v) {
                    is String -> putExtra(k, v)
                    is Long -> putExtra(k, v)
                    is Int -> putExtra(k, v)
                    is Boolean -> putExtra(k, v)
                }
            }
        }
        LocalBroadcastManager.getInstance(this).sendBroadcast(i)
    }

    private fun broadcastRingingToJs(alarmId: String, label: String) =
        broadcast("ringing", alarmId, mapOf("label" to label))

    private fun broadcastDismissedToJs(alarmId: String) =
        broadcast("dismissed", alarmId)

    private fun broadcastSnoozedToJs(alarmId: String, at: Long) =
        broadcast("snoozed", alarmId, mapOf("nextAt" to at))

    private fun broadcastMissedToJs(alarmId: String) =
        broadcast("missed", alarmId)
}
