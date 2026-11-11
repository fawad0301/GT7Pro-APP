package com.sedentarycoach.app

import android.Manifest
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.IBinder
import androidx.core.content.ContextCompat

/**
 * Always-on foreground service. It keeps the process alive, owns the phone step-counter listener
 * (used for smart inactivity reset) and refreshes the engine. Restarted by the system (START_STICKY),
 * on boot, after app updates, and on every reminder alarm.
 */
class CoachService : Service(), SensorEventListener {

    private var sensorManager: SensorManager? = null
    private var lastCount = -1L
    private val window = ArrayDeque<Pair<Long, Long>>() // (time, cumulative steps)
    private var pendingDelta = 0
    private var lastFlush = 0L

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        running = true
        goForeground()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopSelf()
            return START_NOT_STICKY
        }
        goForeground()
        refreshSensor()
        Engine.tick(this)
        return START_STICKY
    }

    private fun goForeground() {
        val n = Notifier.buildOngoing(this, "Starting…")
        try {
            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(Notifier.ID_SERVICE, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
            } else {
                startForeground(Notifier.ID_SERVICE, n)
            }
        } catch (e: Exception) {
            // Some OEMs refuse a start from the background; the next alarm/app open retries.
        }
    }

    private fun refreshSensor() {
        val set = CoachSettings.load(this)
        val granted = Build.VERSION.SDK_INT < 29 ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACTIVITY_RECOGNITION) == PackageManager.PERMISSION_GRANTED
        val sm = getSystemService(Context.SENSOR_SERVICE) as SensorManager
        val sensor = sm.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
        val want = set.smartResetEnabled && granted && sensor != null
        if (want && sensorManager == null) {
            // Batched delivery (up to 60 s) keeps the battery cost close to zero.
            sensorActive = sm.registerListener(this, sensor, SensorManager.SENSOR_DELAY_NORMAL, 60_000_000)
            if (sensorActive) sensorManager = sm
        } else if (!want && sensorManager != null) {
            sensorManager?.unregisterListener(this)
            sensorManager = null
            sensorActive = false
            window.clear(); lastCount = -1
        }
    }

    override fun onSensorChanged(event: SensorEvent) {
        val count = event.values[0].toLong()
        val now = System.currentTimeMillis()
        if (lastCount >= 0 && count >= lastCount) pendingDelta += (count - lastCount).toInt()
        lastCount = count

        if (pendingDelta > 0 && (now - lastFlush > 60_000 || pendingDelta > 200)) {
            CoachDb.get(this).addSteps(Engine.today(), pendingDelta)
            pendingDelta = 0; lastFlush = now
        }

        window.addLast(now to count)
        while (window.isNotEmpty() && now - window.first().first > WINDOW_MS) window.removeFirst()
        val stepsInWindow = count - window.first().second
        val threshold = CoachSettings.load(this).smartResetSteps
        if (stepsInWindow >= threshold) {
            Engine.onBreakDetected(this, stepsInWindow.toInt())
            window.clear()
            window.addLast(now to count)
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    override fun onDestroy() {
        sensorManager?.unregisterListener(this)
        if (pendingDelta > 0) CoachDb.get(this).addSteps(Engine.today(), pendingDelta)
        running = false
        sensorActive = false
        super.onDestroy()
    }

    companion object {
        const val ACTION_STOP = "com.sedentarycoach.app.STOP"
        private const val WINDOW_MS = 4 * 60_000L
        private const val PREFS = "coach_service"

        @Volatile var running = false
        @Volatile var sensorActive = false

        fun isEnabled(ctx: Context) =
            ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean("enabled", true)

        fun setEnabled(ctx: Context, on: Boolean) =
            ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean("enabled", on).apply()

        /** Start (or refresh) the service if the user has it enabled. Safe to call from anywhere. */
        fun ensure(ctx: Context) {
            if (!isEnabled(ctx)) return
            try {
                ContextCompat.startForegroundService(ctx, Intent(ctx, CoachService::class.java))
            } catch (e: Exception) {
                // Background-start restriction: alarms still fire and notify without the service.
            }
        }

        fun stop(ctx: Context) {
            ctx.stopService(Intent(ctx, CoachService::class.java))
        }
    }
}
