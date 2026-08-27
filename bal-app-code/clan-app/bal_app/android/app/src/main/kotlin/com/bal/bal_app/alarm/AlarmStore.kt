package com.bal.bal_app.alarm

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

/**
 * ════════════════════════════════════════════════════════════
 *  مخزن المنبهات — الجانب الأصلي (Native)
 * ════════════════════════════════════════════════════════════
 *
 *  لماذا نخزّن في Kotlin وليس في JS فقط؟
 *
 *  عند إعادة تشغيل الهاتف، أندرويد يمسح كل المنبهات المجدولة.
 *  الـ BootReceiver يشتغل قبل ما JavaScript يفتح أصلاً — بل قبل
 *  ما المستخدم يفتح التطبيق أول مرة بعد الإقلاع.
 *  فلو كانت البيانات في AsyncStorage فقط، مفيش حد يقدر يعيد الجدولة.
 *
 *  الحل: نسخة أصلية في SharedPreferences، تُحدَّث من JS عند كل تعديل.
 */
data class AlarmEntity(
    val id: String,
    /** 0-23 */
    val hour: Int,
    /** 0-59 */
    val minute: Int,
    /** أيام الأسبوع باصطلاح JavaScript: الأحد = 0 … السبت = 6 */
    val weekdays: List<Int>,
    val label: String,
    val enabled: Boolean,
    /** بالدقائق. 0 = الغفوة معطّلة */
    val snoozeMinutes: Int,
    /** true = يجب حل مسألة لإيقافه */
    val requireChallenge: Boolean
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("id", id)
        put("hour", hour)
        put("minute", minute)
        put("weekdays", JSONArray(weekdays))
        put("label", label)
        put("enabled", enabled)
        put("snoozeMinutes", snoozeMinutes)
        put("requireChallenge", requireChallenge)
    }

    companion object {
        fun fromJson(o: JSONObject): AlarmEntity {
            val daysArray = o.optJSONArray("weekdays") ?: JSONArray()
            val days = mutableListOf<Int>()
            for (i in 0 until daysArray.length()) days.add(daysArray.getInt(i))

            return AlarmEntity(
                id = o.getString("id"),
                hour = o.getInt("hour"),
                minute = o.getInt("minute"),
                weekdays = days,
                // نص إنجليزي احتياطي - الواجهة تعرض المورد لا هذا
                label = o.optString("label", "Clan Alarm"),
                enabled = o.optBoolean("enabled", true),
                snoozeMinutes = o.optInt("snoozeMinutes", 0),
                requireChallenge = o.optBoolean("requireChallenge", true)
            )
        }
    }
}

object AlarmStore {

    private fun prefs(ctx: Context): SharedPreferences =
        ctx.applicationContext.getSharedPreferences(
            AlarmContract.PREFS_NAME,
            Context.MODE_PRIVATE
        )

    fun loadAll(ctx: Context): List<AlarmEntity> {
        val raw = prefs(ctx).getString(AlarmContract.KEY_ALARMS_JSON, null) ?: return emptyList()

        return try {
            val arr = JSONArray(raw)
            (0 until arr.length()).mapNotNull { i ->
                try {
                    AlarmEntity.fromJson(arr.getJSONObject(i))
                } catch (e: Exception) {
                    // منبه واحد تالف لا يجب أن يُسقط الباقي
                    null
                }
            }
        } catch (e: Exception) {
            emptyList()
        }
    }

    fun saveAll(ctx: Context, alarms: List<AlarmEntity>) {
        val arr = JSONArray()
        alarms.forEach { arr.put(it.toJson()) }
        prefs(ctx).edit()
            .putString(AlarmContract.KEY_ALARMS_JSON, arr.toString())
            .apply()
    }

    fun findById(ctx: Context, id: String): AlarmEntity? =
        loadAll(ctx).firstOrNull { it.id == id }

    fun upsert(ctx: Context, alarm: AlarmEntity) {
        val list = loadAll(ctx).toMutableList()
        val index = list.indexOfFirst { it.id == alarm.id }
        if (index >= 0) list[index] = alarm else list.add(alarm)
        saveAll(ctx, list)
    }

    fun remove(ctx: Context, id: String) {
        saveAll(ctx, loadAll(ctx).filterNot { it.id == id })
    }

    fun isVolumeBoostEnabled(ctx: Context): Boolean =
        prefs(ctx).getBoolean(AlarmContract.KEY_VOLUME_BOOST, true)

    fun setVolumeBoost(ctx: Context, enabled: Boolean) {
        prefs(ctx).edit().putBoolean(AlarmContract.KEY_VOLUME_BOOST, enabled).apply()
    }

    fun markRescheduled(ctx: Context) {
        prefs(ctx).edit()
            .putLong(AlarmContract.KEY_LAST_RESCHEDULE, System.currentTimeMillis())
            .apply()
    }

    fun lastRescheduleAt(ctx: Context): Long =
        prefs(ctx).getLong(AlarmContract.KEY_LAST_RESCHEDULE, 0L)
}
