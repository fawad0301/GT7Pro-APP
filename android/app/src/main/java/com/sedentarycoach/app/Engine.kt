package com.sedentarycoach.app

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import org.json.JSONObject
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime

/**
 * The reminder engine. Everything is driven by a single exact alarm that calls [tick]; the engine
 * works out what is due, posts notifications, records events and schedules the next wake-up.
 * State lives in SharedPreferences so a process kill or reboot loses nothing.
 */
object Engine {
    private const val PREFS = "coach_engine"
    private const val ALARM_REQ = 4101
    private const val SLACK_MS = 30_000L
    private const val MIN = 60_000L

    // ---- persisted state ----
    private class State(
        var stateDate: String = "",
        var anchorAt: Long = 0,          // last movement / reset point; 0 = re-anchor on next tick
        var nextMovementAt: Long = 0,    // explicit override (snooze); 0 = anchor + interval
        var pendingSince: Long = 0,      // a movement reminder is waiting for an answer
        var followUpSent: Boolean = false,
        var nextWaterAt: Long = 0,
        var focusUntil: Long = 0,
        var lastBreakAt: Long = 0,
        var nextWakeAt: Long = 0,
    )

    private fun load(ctx: Context): State {
        val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        return State(
            p.getString("stateDate", "") ?: "",
            p.getLong("anchorAt", 0), p.getLong("nextMovementAt", 0), p.getLong("pendingSince", 0),
            p.getBoolean("followUpSent", false), p.getLong("nextWaterAt", 0), p.getLong("focusUntil", 0),
            p.getLong("lastBreakAt", 0), p.getLong("nextWakeAt", 0),
        )
    }

    private fun save(ctx: Context, s: State) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString("stateDate", s.stateDate).putLong("anchorAt", s.anchorAt)
            .putLong("nextMovementAt", s.nextMovementAt).putLong("pendingSince", s.pendingSince)
            .putBoolean("followUpSent", s.followUpSent).putLong("nextWaterAt", s.nextWaterAt)
            .putLong("focusUntil", s.focusUntil).putLong("lastBreakAt", s.lastBreakAt)
            .putLong("nextWakeAt", s.nextWakeAt).apply()
    }

    // ---- time helpers ----
    private fun zone(): ZoneId = ZoneId.systemDefault()
    fun today(): String = LocalDate.now(zone()).toString()

    private fun atMinute(date: LocalDate, minuteOfDay: Int): Long =
        date.atStartOfDay(zone()).plusMinutes(minuteOfDay.toLong()).toInstant().toEpochMilli()

    private fun dayEnabled(set: CoachSettings, date: LocalDate): Boolean =
        (set.activeDays shr (date.dayOfWeek.value - 1)) and 1 == 1

    fun inActiveWindow(set: CoachSettings, now: Long): Boolean {
        val z = ZonedDateTime.ofInstant(java.time.Instant.ofEpochMilli(now), zone())
        val m = z.hour * 60 + z.minute
        return dayEnabled(set, z.toLocalDate()) && m >= set.activeStartMin && m < set.activeEndMin
    }

    private fun inWaterWindow(set: CoachSettings, now: Long): Boolean {
        val z = ZonedDateTime.ofInstant(java.time.Instant.ofEpochMilli(now), zone())
        val m = z.hour * 60 + z.minute
        return dayEnabled(set, z.toLocalDate()) && m >= set.waterStartMin && m < set.waterEndMin
    }

    /** Start of the next active window strictly after [now] (searches up to 8 days). */
    private fun nextWindowStart(set: CoachSettings, now: Long): Long {
        var d = LocalDate.now(zone())
        repeat(8) {
            if (dayEnabled(set, d)) {
                val start = atMinute(d, set.activeStartMin)
                if (start > now) return start
            }
            d = d.plusDays(1)
        }
        return now + 24 * 60 * MIN
    }

    private fun movementDueAt(set: CoachSettings, s: State): Long =
        if (s.nextMovementAt > 0) s.nextMovementAt else s.anchorAt + set.movementIntervalMin * MIN

    // ---- main loop ----
    @Synchronized
    fun tick(ctx: Context, now: Long = System.currentTimeMillis()) {
        val set = CoachSettings.load(ctx)
        val db = CoachDb.get(ctx)
        val s = load(ctx)
        val today = today()

        // Day rollover: close yesterday, start a fresh day. History stays in the ledger.
        if (s.stateDate != today) {
            if (s.pendingSince > 0 && s.stateDate.isNotEmpty()) {
                db.addEvent(now, s.stateDate, "movement_missed", "engine")
            }
            s.stateDate = today
            s.anchorAt = 0; s.nextMovementAt = 0; s.pendingSince = 0
            s.followUpSent = false; s.nextWaterAt = 0
            Notifier.cancelMovement(ctx); Notifier.cancelWater(ctx)
        }

        val focus = s.focusUntil > now
        if (!focus && s.focusUntil != 0L) {
            // Focus just ended: resume automatically and count from now.
            db.addEvent(now, today, "focus_end", "engine")
            s.focusUntil = 0; s.anchorAt = 0; s.nextMovementAt = 0
        }

        val wakeTimes = mutableListOf<Long>()
        val endOfDay = atMinute(LocalDate.now(zone()).plusDays(1), 0) + 5_000
        wakeTimes += endOfDay

        val active = inActiveWindow(set, now) && !focus
        if (!active) {
            if (s.pendingSince > 0 && !focus) {
                // Active window closed while a reminder was unanswered.
                db.addEvent(now, today, "movement_missed", "engine")
                Notifier.cancelMovement(ctx)
            }
            s.pendingSince = 0; s.followUpSent = false
            s.anchorAt = 0; s.nextMovementAt = 0
            wakeTimes += if (focus) s.focusUntil else nextWindowStart(set, now)
        } else {
            if (s.anchorAt == 0L) s.anchorAt = now

            if (s.pendingSince > 0) {
                val missAt = s.pendingSince + set.movementIntervalMin * MIN
                val followAt = s.pendingSince + set.followUpDelayMin * MIN
                if (now + SLACK_MS >= missAt) {
                    // A whole interval passed with no answer: one sedentary episode.
                    db.addEvent(now, today, "movement_missed", "engine")
                    s.pendingSince = 0; s.followUpSent = false
                    s.anchorAt = missAt - set.movementIntervalMin * MIN
                    s.nextMovementAt = now // remind again now, once per interval at most
                } else if (set.followUpEnabled && !s.followUpSent && now + SLACK_MS >= followAt) {
                    db.addEvent(now, today, "follow_up", "engine")
                    Notifier.showMovement(ctx, followUp = true, snoozeMin = set.snoozeMin)
                    s.followUpSent = true
                }
            }

            var movementFired = false
            if (s.pendingSince == 0L) {
                val due = movementDueAt(set, s)
                if (now + SLACK_MS >= due) {
                    db.addEvent(now, today, "movement_due", "engine")
                    Notifier.showMovement(ctx, followUp = false, snoozeMin = set.snoozeMin)
                    s.pendingSince = now; s.followUpSent = false; s.nextMovementAt = 0
                    movementFired = true
                } else {
                    wakeTimes += due
                }
            }
            if (s.pendingSince > 0) {
                wakeTimes += s.pendingSince + set.movementIntervalMin * MIN
                if (set.followUpEnabled && !s.followUpSent) wakeTimes += s.pendingSince + set.followUpDelayMin * MIN
            }

            // Window end, so an unanswered reminder is closed on time.
            wakeTimes += atMinute(LocalDate.now(zone()), set.activeEndMin)

            // Water (independent window, but suppressed during focus).
            if (set.waterEnabled && inWaterWindow(set, now)) {
                if (s.nextWaterAt == 0L) s.nextWaterAt = now + set.waterIntervalMin * MIN
                if (now + SLACK_MS >= s.nextWaterAt) {
                    if (movementFired) {
                        s.nextWaterAt = now + 3 * MIN // don't stack two alerts at once
                    } else {
                        db.addEvent(now, today, "water_due", "engine")
                        Notifier.showWater(ctx)
                        s.nextWaterAt = now + set.waterIntervalMin * MIN
                    }
                }
                wakeTimes += s.nextWaterAt
            } else {
                s.nextWaterAt = 0
            }
        }

        val next = wakeTimes.filter { it > now }.minOrNull() ?: (now + 15 * MIN)
        s.nextWakeAt = next
        save(ctx, s)
        scheduleAlarm(ctx, next)
        Notifier.updateOngoing(ctx, statusLine(ctx, set, s, now))
    }

    private fun scheduleAlarm(ctx: Context, at: Long) {
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val pi = PendingIntent.getBroadcast(
            ctx, ALARM_REQ, Intent(ctx, AlarmReceiver::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        try {
            if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
            } else {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
            }
        } catch (e: SecurityException) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
        }
    }

    // ---- user actions (from notifications, the ongoing card, or the app) ----
    @Synchronized
    fun action(ctx: Context, type: String, source: String) {
        val set = CoachSettings.load(ctx)
        val db = CoachDb.get(ctx)
        val now = System.currentTimeMillis()
        tick(ctx, now) // make sure the day/state is current first
        val s = load(ctx)
        val today = today()
        when (type) {
            "movement_done" -> {
                db.addEvent(now, today, "movement_done", source, if (s.pendingSince > 0) 1 else 0)
                s.pendingSince = 0; s.followUpSent = false
                s.anchorAt = now; s.nextMovementAt = 0
                Notifier.cancelMovement(ctx)
            }
            "skip" -> {
                db.addEvent(now, today, "movement_skipped", source)
                s.pendingSince = 0; s.followUpSent = false
                s.anchorAt = now; s.nextMovementAt = 0
                Notifier.cancelMovement(ctx)
            }
            "snooze" -> {
                db.addEvent(now, today, "snooze", source, set.snoozeMin)
                s.pendingSince = 0; s.followUpSent = false
                s.nextMovementAt = now + set.snoozeMin * MIN
                Notifier.cancelMovement(ctx)
            }
            "water_done" -> {
                db.addEvent(now, today, "water_done", source)
                if (set.waterEnabled) s.nextWaterAt = now + set.waterIntervalMin * MIN
                Notifier.cancelWater(ctx)
            }
            "focus_end" -> {
                if (s.focusUntil > 0) db.addEvent(now, today, "focus_end", source)
                s.focusUntil = 0; s.anchorAt = 0; s.nextMovementAt = 0
            }
        }
        save(ctx, s)
        tick(ctx, now)
    }

    @Synchronized
    fun startFocus(ctx: Context, minutes: Int, source: String) {
        val now = System.currentTimeMillis()
        tick(ctx, now)
        val s = load(ctx)
        CoachDb.get(ctx).addEvent(now, today(), "focus_start", source, minutes)
        s.focusUntil = now + minutes.coerceIn(5, 480) * MIN
        s.pendingSince = 0; s.followUpSent = false; s.anchorAt = 0; s.nextMovementAt = 0
        Notifier.cancelMovement(ctx)
        save(ctx, s)
        tick(ctx, now)
    }

    /** Called by the step sensor when the phone notices real walking. */
    @Synchronized
    fun onBreakDetected(ctx: Context, steps: Int) {
        val now = System.currentTimeMillis()
        val set = CoachSettings.load(ctx)
        val s = load(ctx)
        if (!set.smartResetEnabled || now - s.lastBreakAt < 10 * MIN) return
        if (!inActiveWindow(set, now) || s.focusUntil > now) return
        val db = CoachDb.get(ctx)
        val today = today()
        db.addEvent(now, today, "break_detected", "phone_sensor", steps)
        if (s.pendingSince > 0) {
            db.addEvent(now, today, "movement_done", "phone_sensor", 1)
            Notifier.cancelMovement(ctx)
        }
        s.lastBreakAt = now
        s.pendingSince = 0; s.followUpSent = false
        s.anchorAt = now; s.nextMovementAt = 0
        save(ctx, s)
        tick(ctx, now)
    }

    /** Settings changed: keep the anchor but recompute every due time. */
    @Synchronized
    fun onSettingsChanged(ctx: Context) {
        val s = load(ctx)
        s.nextMovementAt = 0; s.nextWaterAt = 0
        save(ctx, s)
        tick(ctx)
    }

    // ---- status for the UI and the ongoing notification ----
    fun statusJson(ctx: Context): JSONObject {
        val set = CoachSettings.load(ctx)
        val s = load(ctx)
        val now = System.currentTimeMillis()
        val inWindow = inActiveWindow(set, now)
        val focus = s.focusUntil > now
        val db = CoachDb.get(ctx)
        val today = today()
        return JSONObject().apply {
            put("now", now)
            put("today", today)
            put("inWindow", inWindow)
            put("focusUntil", if (focus) s.focusUntil else 0)
            put("pendingSince", s.pendingSince)
            put("anchorAt", s.anchorAt)
            put("nextMovementAt", if (inWindow && !focus && s.pendingSince == 0L && s.anchorAt > 0) movementDueAt(set, s) else 0)
            put("nextWaterAt", s.nextWaterAt)
            put("nextWindowStart", if (inWindow) 0 else nextWindowStart(set, now))
            put("nextWakeAt", s.nextWakeAt)
            put("serviceRunning", CoachService.running)
            put("sensorActive", CoachService.sensorActive)
            put("phoneStepsToday", db.stepsFor(today))
        }
    }

    private fun fmt(ts: Long): String =
        java.time.Instant.ofEpochMilli(ts).atZone(zone()).toLocalTime().withSecond(0).withNano(0).toString()

    private fun statusLine(ctx: Context, set: CoachSettings, s: State, now: Long): String {
        val db = CoachDb.get(ctx)
        val today = today()
        val done = db.countToday(today, "movement_done")
        val water = db.countToday(today, "water_done")
        val waterPart = if (set.waterEnabled) " · Water $water/${set.waterDailyTarget}" else ""
        val head = when {
            s.focusUntil > now -> "Paused until ${fmt(s.focusUntil)}"
            !inActiveWindow(set, now) -> "Off hours · next start ${nextWindowStart(set, now).let { fmtDay(it) }}"
            s.pendingSince > 0 -> "Time to move!"
            else -> "Next move at ${fmt(movementDueAt(set, s))}"
        }
        return "$head · Moves $done$waterPart"
    }

    private fun fmtDay(ts: Long): String {
        val z = java.time.Instant.ofEpochMilli(ts).atZone(zone())
        val day = if (z.toLocalDate() == LocalDate.now(zone()).plusDays(1)) "tomorrow"
        else if (z.toLocalDate() == LocalDate.now(zone())) "today"
        else z.dayOfWeek.getDisplayName(java.time.format.TextStyle.SHORT, java.util.Locale.getDefault())
        return "$day ${z.toLocalTime().withSecond(0).withNano(0)}"
    }
}
