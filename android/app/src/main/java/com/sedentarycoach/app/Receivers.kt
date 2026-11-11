package com.sedentarycoach.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Fired by the engine's exact alarm. Runs the engine and makes sure the service is alive. */
class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val ctx = context.applicationContext
        Engine.tick(ctx)
        if (!CoachService.running) CoachService.ensure(ctx)
    }
}

/** Buttons on notifications (phone, and wherever Huawei Health forwards them). */
class ActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val ctx = context.applicationContext
        when (intent.action) {
            MOVE_DONE -> Engine.action(ctx, "movement_done", "notification")
            SNOOZE -> Engine.action(ctx, "snooze", "notification")
            SKIP -> Engine.action(ctx, "skip", "notification")
            WATER_DONE -> Engine.action(ctx, "water_done", "notification")
            FOCUS_START -> Engine.startFocus(ctx, CoachSettings.load(ctx).focusDefaultMin, "notification")
            FOCUS_END -> Engine.action(ctx, "focus_end", "notification")
        }
    }

    companion object {
        const val MOVE_DONE = "com.sedentarycoach.app.MOVE_DONE"
        const val SNOOZE = "com.sedentarycoach.app.SNOOZE"
        const val SKIP = "com.sedentarycoach.app.SKIP"
        const val WATER_DONE = "com.sedentarycoach.app.WATER_DONE"
        const val FOCUS_START = "com.sedentarycoach.app.FOCUS_START"
        const val FOCUS_END = "com.sedentarycoach.app.FOCUS_END"
    }
}

/** Restart after reboot, app update, and clock/time-zone changes. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val ctx = context.applicationContext
        Engine.tick(ctx)
        CoachService.ensure(ctx)
    }
}
