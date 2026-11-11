package com.sedentarycoach.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/**
 * All notifications. Movement and water reminders are normal, high-importance notifications so that
 * Huawei Health can mirror them to the watch (enable "Sedentary Coach" under Huawei Health >
 * device > Notifications). The ongoing "service" notification uses a quiet channel.
 */
object Notifier {
    const val CH_SERVICE = "coach_service"
    const val CH_MOVE = "coach_movement"
    const val CH_WATER = "coach_water"
    const val ID_SERVICE = 1
    private const val ID_MOVE = 2
    private const val ID_WATER = 3

    private val movePrompts = listOf(
        "Stand up, stretch and take a few steps.",
        "Time for a short walk — even 2 minutes helps.",
        "Stand tall and reach overhead for a moment.",
        "Roll your shoulders and walk to refill your water.",
        "Quick break: stand, stretch your legs, breathe.",
    )

    fun ensureChannels(ctx: Context) {
        if (Build.VERSION.SDK_INT < 26) return
        val nm = ctx.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CH_SERVICE, "Coach running", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Keeps Sedentary Coach active and shows the next reminder time."
                setShowBadge(false)
            }
        )
        nm.createNotificationChannel(
            NotificationChannel(CH_MOVE, "Movement reminders", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Gentle prompts to stand up and move."
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 300, 150, 300)
            }
        )
        nm.createNotificationChannel(
            NotificationChannel(CH_WATER, "Water reminders", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "Short reminders to drink water."
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 200)
            }
        )
    }

    private fun openApp(ctx: Context): PendingIntent =
        PendingIntent.getActivity(
            ctx, 0,
            Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

    private fun actionPi(ctx: Context, action: String, req: Int): PendingIntent =
        PendingIntent.getBroadcast(
            ctx, req,
            Intent(ctx, ActionReceiver::class.java).setAction(action),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

    private fun canPost(ctx: Context) = NotificationManagerCompat.from(ctx).areNotificationsEnabled()

    fun buildOngoing(ctx: Context, text: String): Notification {
        ensureChannels(ctx)
        val paused = text.startsWith("Paused")
        val b = NotificationCompat.Builder(ctx, CH_SERVICE)
            .setSmallIcon(R.drawable.ic_stat_coach)
            .setContentTitle("Sedentary Coach")
            .setContentText(text)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setShowWhen(false)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setLocalOnly(true) // don't mirror the status card to the watch
            .setContentIntent(openApp(ctx))
            .addAction(0, "I moved", actionPi(ctx, ActionReceiver.MOVE_DONE, 11))
            .addAction(0, "Water", actionPi(ctx, ActionReceiver.WATER_DONE, 12))
        if (paused) b.addAction(0, "Resume", actionPi(ctx, ActionReceiver.FOCUS_END, 13))
        else b.addAction(0, "Pause", actionPi(ctx, ActionReceiver.FOCUS_START, 14))
        if (Build.VERSION.SDK_INT >= 31) b.setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
        return b.build()
    }

    fun updateOngoing(ctx: Context, text: String) {
        if (!CoachService.running || !canPost(ctx)) return
        try {
            NotificationManagerCompat.from(ctx).notify(ID_SERVICE, buildOngoing(ctx, text))
        } catch (_: SecurityException) {}
    }

    fun showMovement(ctx: Context, followUp: Boolean, snoozeMin: Int) {
        if (!canPost(ctx)) return
        ensureChannels(ctx)
        val title = if (followUp) "Still sitting? Time to move" else "Time to move"
        val text = movePrompts[(System.currentTimeMillis() / 60_000L % movePrompts.size).toInt()]
        val n = NotificationCompat.Builder(ctx, CH_MOVE)
            .setSmallIcon(R.drawable.ic_stat_coach)
            .setContentTitle(title)
            .setContentText(text)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setAutoCancel(true)
            .setContentIntent(openApp(ctx))
            .addAction(0, "Done", actionPi(ctx, ActionReceiver.MOVE_DONE, 21))
            .addAction(0, "Snooze ${snoozeMin}m", actionPi(ctx, ActionReceiver.SNOOZE, 22))
            .addAction(0, "Skip", actionPi(ctx, ActionReceiver.SKIP, 23))
            .build()
        try { NotificationManagerCompat.from(ctx).notify(ID_MOVE, n) } catch (_: SecurityException) {}
    }

    fun showWater(ctx: Context) {
        if (!canPost(ctx)) return
        ensureChannels(ctx)
        val n = NotificationCompat.Builder(ctx, CH_WATER)
            .setSmallIcon(R.drawable.ic_stat_coach)
            .setContentTitle("Water break")
            .setContentText("Have a few sips of water.")
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setAutoCancel(true)
            .setContentIntent(openApp(ctx))
            .addAction(0, "Done", actionPi(ctx, ActionReceiver.WATER_DONE, 31))
            .build()
        try { NotificationManagerCompat.from(ctx).notify(ID_WATER, n) } catch (_: SecurityException) {}
    }

    fun showTest(ctx: Context) {
        if (!canPost(ctx)) return
        ensureChannels(ctx)
        val n = NotificationCompat.Builder(ctx, CH_MOVE)
            .setSmallIcon(R.drawable.ic_stat_coach)
            .setContentTitle("Test reminder")
            .setContentText("If this appears on your watch, mirroring works.")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .build()
        try { NotificationManagerCompat.from(ctx).notify(99, n) } catch (_: SecurityException) {}
    }

    fun cancelMovement(ctx: Context) = NotificationManagerCompat.from(ctx).cancel(ID_MOVE)
    fun cancelWater(ctx: Context) = NotificationManagerCompat.from(ctx).cancel(ID_WATER)
}
