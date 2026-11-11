package com.sedentarycoach.app

import android.content.Context
import org.json.JSONObject

/**
 * User-editable settings. Stored as JSON in SharedPreferences.
 * Times are minutes after midnight. activeDays is a bitmask: bit 0 = Monday ... bit 6 = Sunday.
 */
data class CoachSettings(
    val activeStartMin: Int = 9 * 60,
    val activeEndMin: Int = 17 * 60,
    val activeDays: Int = 0b0011111, // Mon-Fri
    val movementIntervalMin: Int = 45,
    val waterEnabled: Boolean = true,
    val waterIntervalMin: Int = 60,
    val waterStartMin: Int = 9 * 60,
    val waterEndMin: Int = 17 * 60,
    val waterDailyTarget: Int = 8,
    val snoozeMin: Int = 10,
    val followUpEnabled: Boolean = true,
    val followUpDelayMin: Int = 10,
    val smartResetEnabled: Boolean = true,
    val smartResetSteps: Int = 50,
    val focusDefaultMin: Int = 60,
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("activeStartMin", activeStartMin)
        put("activeEndMin", activeEndMin)
        put("activeDays", activeDays)
        put("movementIntervalMin", movementIntervalMin)
        put("waterEnabled", waterEnabled)
        put("waterIntervalMin", waterIntervalMin)
        put("waterStartMin", waterStartMin)
        put("waterEndMin", waterEndMin)
        put("waterDailyTarget", waterDailyTarget)
        put("snoozeMin", snoozeMin)
        put("followUpEnabled", followUpEnabled)
        put("followUpDelayMin", followUpDelayMin)
        put("smartResetEnabled", smartResetEnabled)
        put("smartResetSteps", smartResetSteps)
        put("focusDefaultMin", focusDefaultMin)
    }

    /** Clamp everything to sane ranges so a bad value can never break the scheduler. */
    fun normalized(): CoachSettings {
        val start = activeStartMin.coerceIn(0, 1439)
        var end = activeEndMin.coerceIn(1, 1440)
        if (end <= start) end = (start + 60).coerceAtMost(1440)
        val wStart = waterStartMin.coerceIn(0, 1439)
        var wEnd = waterEndMin.coerceIn(1, 1440)
        if (wEnd <= wStart) wEnd = (wStart + 60).coerceAtMost(1440)
        val interval = movementIntervalMin.coerceIn(5, 240)
        return copy(
            activeStartMin = start,
            activeEndMin = end,
            activeDays = activeDays and 0b1111111,
            movementIntervalMin = interval,
            waterIntervalMin = waterIntervalMin.coerceIn(10, 240),
            waterStartMin = wStart,
            waterEndMin = wEnd,
            waterDailyTarget = waterDailyTarget.coerceIn(1, 20),
            snoozeMin = snoozeMin.coerceIn(1, 60),
            // The follow-up must come before the next interval, or it would never be sent.
            followUpDelayMin = followUpDelayMin.coerceIn(2, maxOf(2, interval - 2)),
            smartResetSteps = smartResetSteps.coerceIn(10, 500),
            focusDefaultMin = focusDefaultMin.coerceIn(5, 480),
        )
    }

    companion object {
        private const val PREFS = "coach_settings"
        private const val KEY = "json"

        fun fromJson(o: JSONObject): CoachSettings {
            val d = CoachSettings()
            return CoachSettings(
                activeStartMin = o.optInt("activeStartMin", d.activeStartMin),
                activeEndMin = o.optInt("activeEndMin", d.activeEndMin),
                activeDays = o.optInt("activeDays", d.activeDays),
                movementIntervalMin = o.optInt("movementIntervalMin", d.movementIntervalMin),
                waterEnabled = o.optBoolean("waterEnabled", d.waterEnabled),
                waterIntervalMin = o.optInt("waterIntervalMin", d.waterIntervalMin),
                waterStartMin = o.optInt("waterStartMin", d.waterStartMin),
                waterEndMin = o.optInt("waterEndMin", d.waterEndMin),
                waterDailyTarget = o.optInt("waterDailyTarget", d.waterDailyTarget),
                snoozeMin = o.optInt("snoozeMin", d.snoozeMin),
                followUpEnabled = o.optBoolean("followUpEnabled", d.followUpEnabled),
                followUpDelayMin = o.optInt("followUpDelayMin", d.followUpDelayMin),
                smartResetEnabled = o.optBoolean("smartResetEnabled", d.smartResetEnabled),
                smartResetSteps = o.optInt("smartResetSteps", d.smartResetSteps),
                focusDefaultMin = o.optInt("focusDefaultMin", d.focusDefaultMin),
            ).normalized()
        }

        fun load(ctx: Context): CoachSettings {
            val raw = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null)
                ?: return CoachSettings()
            return try { fromJson(JSONObject(raw)) } catch (e: Exception) { CoachSettings() }
        }

        fun save(ctx: Context, s: CoachSettings) {
            ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putString(KEY, s.normalized().toJson().toString()).apply()
        }
    }
}
