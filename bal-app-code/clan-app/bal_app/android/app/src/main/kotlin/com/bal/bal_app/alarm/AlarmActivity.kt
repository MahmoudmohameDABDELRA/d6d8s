package com.bal.bal_app.alarm

import android.app.Activity
import android.app.KeyguardManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Color
import android.graphics.Typeface
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView
import androidx.localbroadcastmanager.content.LocalBroadcastManager

// R يعيش في حزمة التطبيق الأصل لا في حزمة المنبه.
// ️ الحزمة اتغيّرت لـ com.bal.bal_app عند النقل من React Native لـ Flutter.
import com.bal.bal_app.R
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.random.Random

/**
 * ════════════════════════════════════════════════════════════
 *  شاشة المنبه — Kotlin خالص، بلا React
 * ════════════════════════════════════════════════════════════
 *
 *  ⚠️ لماذا أُعيدت كتابتها بالكامل؟
 *
 *  كانت ReactActivity، وظهرت على الجهاز الحقيقي أربع مشاكل
 *  كلها من جذر واحد — حالة JavaScript تبقى في الذاكرة:
 *
 *    1. المنبه الثاني يعرض مسألة الأمس **محلولة بالفعل**
 *    2. الشاشة لا تشتعل (JS يتأخر في التحميل)
 *    3. أزرار النظام تتجمّد بعد الحل
 *    4. شاشة Metro الحمراء عند فتح الإشعار
 *
 *  الحل الجذري: لا React هنا إطلاقاً.
 *
 *    · الواجهة مبنية برمجياً — بلا XML، بلا موارد
 *    · المسألة تُولَّد في onCreate و onNewIntent معاً
 *    · لا حالة تبقى بين منبه وآخر
 *    · تعمل حتى لو انهار JavaScript أو انقطع Metro
 *    · تظهر فوراً — لا انتظار لتحميل حزمة
 *
 *  هذه هي طريقة تطبيقات المنبه الحقيقية.
 */
class AlarmActivity : Activity() {

    companion object {
        private const val TAG = "ClanAlarmActivity"

        /** يبثّه JS بعد التحقق من الخادم → نُغلق الشاشة */
        const val EVENT_CLOSE_SCREEN = "com.bal.bal_app.alarm.ACTIVITY_CLOSE"

        private const val ORANGE = 0xFFFF8A3D.toInt()
        private const val BG = 0xFF0B0D12.toInt()
        private const val CARD = 0xFF151922.toInt()
        private const val KEY_BG = 0xFF1A1F2B.toInt()
        private const val DIM = 0xFF8B93A7.toInt()
        private const val RED = 0xFFE14B4B.toInt()

        // مفاتيح لوحة الأرقام - أرقام لا رموز
        private const val KEY_0 = 0
        private const val KEY_1 = 1
        private const val KEY_2 = 2
        private const val KEY_3 = 3
        private const val KEY_4 = 4
        private const val KEY_5 = 5
        private const val KEY_6 = 6
        private const val KEY_7 = 7
        private const val KEY_8 = 8
        private const val KEY_9 = 9
        private const val KEY_DELETE = -1
        private const val KEY_OK = -2
    }

    // ── الحالة ──
    private var alarmId: String? = null
    private var alarmLabel: String = ""

    private var answer: Int = 0
    private var typed: String = ""
    private var attempts: Int = 0
    private var solvedCount: Int = 0
    private var requiredSolves: Int = 1
    private var finished = false

    // ── العناصر ──
    private lateinit var clockView: TextView
    private lateinit var labelView: TextView
    private lateinit var questionView: TextView
    private lateinit var answerView: TextView
    private lateinit var statusView: TextView
    private lateinit var card: LinearLayout

    private val handler = Handler(Looper.getMainLooper())
    private var clockTicker: Runnable? = null
    private var closeReceiver: BroadcastReceiver? = null

    // ════════════════════════════════════════════════
    //  دورة الحياة
    // ════════════════════════════════════════════════

    override fun onCreate(savedInstanceState: Bundle?) {
        applyWakeFlags()
        super.onCreate(savedInstanceState)

        readIntent(intent)
        setContentView(buildUi())
        newChallenge()
        startClock()
        blockBackButton()
        registerCloseListener()

        Log.i(TAG, "onCreate alarmId=$alarmId")
    }

    /**
     * يُستدعى بدل onCreate لأن launchMode = singleInstance.
     *
     * هذه الدالة هي الفرق بين منبه يعمل مرة واحدة
     * ومنبه يعمل كل يوم بمسألة جديدة.
     */
    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        if (intent == null) return
        setIntent(intent)

        applyWakeFlags()     // الشاشة قد تكون مطفأة
        readIntent(intent)

        // إعادة ضبط كاملة — لا أثر للمنبه السابق
        typed = ""
        attempts = 0
        solvedCount = 0
        requiredSolves = 1
        finished = false
        newChallenge()

        labelView.text = alarmLabel
        Log.i(TAG, "onNewIntent alarmId=$alarmId - challenge reset")
    }

    override fun onDestroy() {
        clockTicker?.let { handler.removeCallbacks(it) }
        closeReceiver?.let {
            try { LocalBroadcastManager.getInstance(this).unregisterReceiver(it) }
            catch (e: Exception) { /* ignore */ }
        }
        closeReceiver = null
        super.onDestroy()
    }

    private fun readIntent(i: Intent?) {
        alarmId = i?.getStringExtra(AlarmContract.EXTRA_ALARM_ID)
        alarmLabel = i?.getStringExtra(AlarmContract.EXTRA_LABEL)
            ?: getString(R.string.clan_alarm_default_label)
    }

    // ════════════════════════════════════════════════
    //  إشعال الشاشة
    // ════════════════════════════════════════════════

    /**
     * تُستدعى من onCreate **و** onNewIntent.
     *
     * الاستدعاء من onCreate وحده يعني أن المنبه الثاني
     * يرن والشاشة سوداء — وهذا ما حدث فعلاً.
     *
     * ── لماذا الأعلام القديمة والجديدة معاً؟ ──
     *
     * مأخوذ من تجربة AlarmClock مفتوح المصدر (613 نجمة، 2028 commit).
     * تعليقهم الحرفي على المشكلة رقم 360:
     *
     *   "يبدو أن على بعض الأجهزة بـ API>=27 لا يكفي استدعاء
     *    setTurnScreenOn(true)، لذا نضيف كل الأعلام بغض النظر
     *    عن نسخة النظام."
     *
     * FLAG_ALLOW_LOCK_WHILE_SCREEN_ON: يسمح للشاشة بالاشتعال
     * حتى مع وجود قفل نشط — بدونه بعض الأجهزة تتجاهل الطلب.
     */
    private fun applyWakeFlags() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
            try {
                val km = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
                km.requestDismissKeyguard(this, null)
            } catch (e: Exception) {
                Log.e(TAG, "requestDismissKeyguard failed", e)
            }
        }

        // الأعلام المهجورة ما زالت مطلوبة على أجهزة كثيرة
        @Suppress("DEPRECATION")
        window.addFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
                    WindowManager.LayoutParams.FLAG_ALLOW_LOCK_WHILE_SCREEN_ON or
                    WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                    WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
        )
    }

    // ════════════════════════════════════════════════
    //  زر الرجوع
    // ════════════════════════════════════════════════

    /**
     * ⚠️ نقطتان تعلّمناهما بالتجربة على الجهاز:
     *
     *   1. onBackPressed() لم تعد تُستدعى على أندرويد 16 (API 36)
     *      لأن predictive back مفعّل تلقائياً.
     *
     *   2. لا بد من onBackInvokedDispatcher للأجهزة الحديثة.
     */
    private fun blockBackButton() {
        if (Build.VERSION.SDK_INT >= 33) {
            try {
                onBackInvokedDispatcher.registerOnBackInvokedCallback(
                    android.window.OnBackInvokedDispatcher.PRIORITY_OVERLAY
                ) {
                    Log.d(TAG, "back blocked (new API)")
                }
            } catch (e: Exception) {
                Log.e(TAG, "registerOnBackInvokedCallback failed", e)
            }
        }
    }

    @Deprecated("needed for API < 33")
    override fun onBackPressed() {
        // لا شيء — الخروج الوحيد: حل المسألة
        Log.d(TAG, "back blocked (legacy)")
    }

    // ════════════════════════════════════════════════
    //  المسألة
    // ════════════════════════════════════════════════

    /**
     * توليد مسألة جديدة.
     *
     * ملاحظة: هذه نسخة محلية للعرض الفوري.
     * التحقق النهائي على الخادم بتوقيع HMAC —
     * لكن الشاشة يجب أن تعمل بلا إنترنت أيضاً.
     *
     * الصعوبة تزيد بعد كل ثلاث محاولات فاشلة.
     */
    private fun newChallenge() {
        val hard = attempts >= 3

        val a: Int
        val b: Int
        val c: Int
        val text: String

        if (hard) {
            a = Random.nextInt(12, 30)
            b = Random.nextInt(12, 30)
            c = Random.nextInt(5, 41)
            answer = a * b - c
            text = "($a x $b) - $c"
        } else {
            a = Random.nextInt(11, 20)
            b = Random.nextInt(3, 10)
            c = Random.nextInt(5, 31)
            answer = a * b + c
            text = "$a x $b + $c"
        }

        typed = ""
        requiredSolves = 1 + (attempts / 3)

        if (::questionView.isInitialized) {
            questionView.text = text
            renderAnswer()
            renderStatus()
        }
    }

    private fun renderAnswer() {
        answerView.text = if (typed.isEmpty()) getString(R.string.clan_alarm_answer_placeholder) else typed
    }

    private fun renderStatus() {
        val parts = mutableListOf<String>()

        if (requiredSolves > 1) {
            parts.add(getString(R.string.clan_alarm_progress, solvedCount, requiredSolves))
        }

        if (attempts > 0) {
            val base = getString(R.string.clan_alarm_attempts, attempts)
            parts.add(
                if (attempts >= 3) base + " - " + getString(R.string.clan_alarm_harder)
                else base
            )
        }

        statusView.text = parts.joinToString(getString(R.string.clan_alarm_separator))
        statusView.visibility = if (parts.isEmpty()) View.GONE else View.VISIBLE
        statusView.setTextColor(if (attempts > 0) RED else ORANGE)
    }

    // ════════════════════════════════════════════════
    //  الإدخال
    // ════════════════════════════════════════════════

    private fun onDigit(d: String) {
        if (finished) return
        if (typed.length >= 6) return
        typed += d
        renderAnswer()
    }

    private fun onBackspace() {
        if (finished) return
        if (typed.isNotEmpty()) {
            typed = typed.dropLast(1)
            renderAnswer()
        }
    }

    private fun onSubmit() {
        if (finished || typed.isEmpty()) return

        val value = typed.toIntOrNull()

        if (value != answer) {
            attempts++
            flashError()
            newChallenge()
            renderStatus()
            return
        }

        solvedCount++

        if (solvedCount < requiredSolves) {
            newChallenge()
            renderStatus()
            return
        }

        onSolved()
    }

    private fun flashError() {
        card.setBackgroundColor(0xFF1C1418.toInt())
        handler.postDelayed({ card.setBackgroundColor(CARD) }, 350)

        try {
            val v = getSystemService(Context.VIBRATOR_SERVICE) as? android.os.Vibrator
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                v?.vibrate(
                    android.os.VibrationEffect.createOneShot(
                        200,
                        android.os.VibrationEffect.DEFAULT_AMPLITUDE
                    )
                )
            }
        } catch (e: Exception) { /* ignore */ }
    }

    // ════════════════════════════════════════════════
    //  الحل
    // ════════════════════════════════════════════════

    /**
     * أُنجزت المسألة.
     *
     * ثلاث خطوات لا بد منها بالترتيب:
     *   1. إيقاف الصوت والاهتزاز
     *   2. إبلاغ JavaScript (للشرارات والإحصاءات)
     *   3. إغلاق الشاشة — بدونها تتجمّد أزرار النظام
     */
    private fun onSolved() {
        if (finished) return
        finished = true

        Log.i(TAG, "solved alarmId=$alarmId attempts=$attempts")

        val id = alarmId
        if (id != null) {
            AlarmRingService.stopRinging(this, id, dismissed = true)
        } else {
            // لا معرّف — أوقف أي رنين جارٍ
            AlarmRingService.currentAlarmId?.let {
                AlarmRingService.stopRinging(this, it, dismissed = true)
            }
        }

        // نُبلغ JS لو كان حياً — ولو لم يكن، الخدمة سجّلت الحدث
        try {
            LocalBroadcastManager.getInstance(this).sendBroadcast(
                Intent(AlarmContract.ACTION_ALARM_RINGING_EVENT).apply {
                    putExtra("event", "solved")
                    putExtra(AlarmContract.EXTRA_ALARM_ID, id)
                    putExtra("attempts", attempts)
                }
            )
        } catch (e: Exception) { /* ignore */ }

        // نخزّنها ليقرأها التطبيق عند فتحه لاحقاً
        try {
            getSharedPreferences(AlarmContract.PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putString("last_solved_alarm", id)
                .putLong("last_solved_at", System.currentTimeMillis())
                .putInt("last_solved_attempts", attempts)
                .apply()
        } catch (e: Exception) { /* ignore */ }

        showSuccessThenClose()
    }

    private fun showSuccessThenClose() {
        questionView.text = getString(R.string.clan_alarm_success)
        questionView.setTextColor(0xFF4CD964.toInt())
        answerView.visibility = View.GONE
        statusView.visibility = View.GONE

        handler.postDelayed({ closeScreen() }, 700)
    }

    private fun closeScreen() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                finishAndRemoveTask()
            } else {
                finish()
            }
        } catch (e: Exception) {
            finish()
        }
    }

    private fun registerCloseListener() {
        closeReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, i: Intent?) {
                Log.i(TAG, "close requested externally")
                finished = true
                closeScreen()
            }
        }
        LocalBroadcastManager.getInstance(this).registerReceiver(
            closeReceiver!!,
            IntentFilter(EVENT_CLOSE_SCREEN)
        )
    }

    // ════════════════════════════════════════════════
    //  الساعة
    // ════════════════════════════════════════════════

    private fun startClock() {
        val fmt = SimpleDateFormat("HH:mm", Locale.US)
        clockTicker = object : Runnable {
            override fun run() {
                clockView.text = fmt.format(Date())
                handler.postDelayed(this, 1000)
            }
        }
        handler.post(clockTicker!!)
    }

    // ════════════════════════════════════════════════
    //  بناء الواجهة برمجياً
    // ════════════════════════════════════════════════

    private fun dp(v: Int): Int = TypedValue.applyDimension(
        TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), resources.displayMetrics
    ).toInt()

    private fun buildUi(): View {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(BG)
            setPadding(dp(20), dp(48), dp(20), dp(24))
            layoutParams = LinearLayout.LayoutParams(-1, -1)
        }

        // ── الساعة ──
        clockView = TextView(this).apply {
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 60f)
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            typeface = Typeface.create("sans-serif-light", Typeface.NORMAL)
            text = SimpleDateFormat("HH:mm", Locale.US).format(Date())
        }
        root.addView(clockView, wrap())

        labelView = TextView(this).apply {
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
            setTextColor(DIM)
            gravity = Gravity.CENTER
            text = alarmLabel
            setPadding(0, dp(4), 0, dp(18))
        }
        root.addView(labelView, wrap())

        // ── بطاقة المسألة ──
        card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(CARD)
            setPadding(dp(18), dp(22), dp(18), dp(22))
            gravity = Gravity.CENTER_HORIZONTAL
        }

        card.addView(TextView(this).apply {
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
            setTextColor(DIM)
            text = getString(R.string.clan_alarm_hint)
            gravity = Gravity.CENTER
        }, wrap())

        questionView = TextView(this).apply {
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 34f)
            setTextColor(Color.WHITE)
            setTypeface(null, Typeface.BOLD)
            gravity = Gravity.CENTER
            setPadding(0, dp(10), 0, dp(14))
        }
        card.addView(questionView, wrap())

        answerView = TextView(this).apply {
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 30f)
            setTextColor(ORANGE)
            setTypeface(null, Typeface.BOLD)
            gravity = Gravity.CENTER
            text = getString(R.string.clan_alarm_answer_placeholder)
            setPadding(dp(30), dp(6), dp(30), dp(6))
            setBackgroundColor(0xFF10141C.toInt())
        }
        card.addView(answerView, wrap())

        statusView = TextView(this).apply {
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
            setTextColor(ORANGE)
            gravity = Gravity.CENTER
            visibility = View.GONE
            setPadding(0, dp(12), 0, 0)
        }
        card.addView(statusView, wrap())

        root.addView(card, LinearLayout.LayoutParams(-1, -2).apply {
            bottomMargin = dp(20)
        })

        /**
         * لوحة الأرقام.
         *
         * نستخدم أنواعاً (KEY_DELETE / KEY_OK) بدل رموز يونيكود
         * مثل الرمزين القديمين. السبب من تجربة حقيقية: أي خلل في
         * ترميز الملف يحوّل تلك الرموز إلى محارف عشوائية فتبدو
         * لوحة المفاتيح كلها مكسورة.
         *
         * الأرقام 0-9 محارف ASCII لا تتأثر بأي ترميز.
         */
        val rows = listOf(
            listOf(KEY_1, KEY_2, KEY_3),
            listOf(KEY_4, KEY_5, KEY_6),
            listOf(KEY_7, KEY_8, KEY_9),
            listOf(KEY_DELETE, KEY_0, KEY_OK)
        )

        val pad = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(-1, 0, 1f)
        }

        for (row in rows) {
            val rowLayout = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                layoutParams = LinearLayout.LayoutParams(-1, 0, 1f).apply {
                    bottomMargin = dp(8)
                }
            }

            for (key in row) {
                rowLayout.addView(makeKey(key))
            }
            pad.addView(rowLayout)
        }

        root.addView(pad)
        return root
    }

    /**
     * بناء مفتاح واحد.
     *
     * زر الحذف والموافقة يُرسمان بالكود (سهم ومربع)
     * بدل الاعتماد على رموز يونيكود قد تتلف.
     */
    private fun makeKey(key: Int): View {
        val isOk = key == KEY_OK
        val isDelete = key == KEY_DELETE

        val label = when (key) {
            KEY_DELETE -> "<"
            KEY_OK -> "OK"
            else -> key.toString()
        }

        return TextView(this).apply {
            text = label
            gravity = Gravity.CENTER
            setTextSize(
                TypedValue.COMPLEX_UNIT_SP,
                when {
                    isOk -> 20f
                    isDelete -> 26f
                    else -> 26f
                }
            )
            setTextColor(if (isOk) BG else Color.WHITE)
            setTypeface(null, if (isOk) Typeface.BOLD else Typeface.NORMAL)
            setBackgroundColor(
                when {
                    isOk -> ORANGE
                    isDelete -> 0xFF141821.toInt()
                    else -> KEY_BG
                }
            )

            // وصف للقارئ الصوتي - لا يظهر بصرياً
            contentDescription = when (key) {
                KEY_DELETE -> getString(R.string.clan_alarm_key_delete)
                KEY_OK -> getString(R.string.clan_alarm_key_ok)
                else -> label
            }

            isClickable = true
            isFocusable = true

            layoutParams = LinearLayout.LayoutParams(0, -1, 1f).apply {
                marginEnd = dp(8)
            }

            setOnClickListener {
                when (key) {
                    KEY_DELETE -> onBackspace()
                    KEY_OK -> onSubmit()
                    else -> onDigit(key.toString())
                }
            }
        }
    }

    private fun wrap() = LinearLayout.LayoutParams(-1, -2)
}
