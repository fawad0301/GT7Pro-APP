package com.sedentarycoach.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.AlarmManager
import android.bluetooth.BluetoothClass
import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import org.json.JSONArray
import org.json.JSONObject

/**
 * Bridge between the TypeScript UI and the native engine. Payloads are JSON strings to keep the
 * contract small and explicit (see src/native/coach.ts).
 */
class CoachModule(private val rc: ReactApplicationContext) : ReactContextBaseJavaModule(rc) {

    override fun getName() = "SedentaryCoach"

    private val ctx: Context get() = rc.applicationContext

    private inline fun run(p: Promise, block: () -> Any?) {
        try { p.resolve(block()) } catch (e: Exception) { p.reject("E_COACH", e.message, e) }
    }

    @ReactMethod fun getSettings(p: Promise) = run(p) { CoachSettings.load(ctx).toJson().toString() }

    @ReactMethod fun saveSettings(json: String, p: Promise) = run(p) {
        val s = CoachSettings.fromJson(JSONObject(json))
        CoachSettings.save(ctx, s)
        Engine.onSettingsChanged(ctx)
        CoachService.ensure(ctx) // refreshes the step sensor if smart reset changed
        s.toJson().toString()
    }

    @ReactMethod fun getStatus(p: Promise) = run(p) {
        Engine.tick(ctx)
        Engine.statusJson(ctx).apply { put("serviceEnabled", CoachService.isEnabled(ctx)) }.toString()
    }

    @ReactMethod fun getDays(from: String, to: String, p: Promise) =
        run(p) { CoachDb.get(ctx).daySummaries(from, to).toString() }

    @ReactMethod fun getEvents(date: String, p: Promise) = run(p) { CoachDb.get(ctx).eventsFor(date).toString() }

    @ReactMethod fun performAction(type: String, p: Promise) = run(p) {
        require(type in setOf("movement_done", "water_done", "snooze", "skip", "focus_end")) { "Unknown action $type" }
        Engine.action(ctx, type, "app"); true
    }

    @ReactMethod fun startFocus(minutes: Double, p: Promise) = run(p) { Engine.startFocus(ctx, minutes.toInt(), "app"); true }

    @ReactMethod fun setServiceEnabled(on: Boolean, p: Promise) = run(p) {
        CoachService.setEnabled(ctx, on)
        if (on) { CoachService.ensure(ctx); Engine.tick(ctx) } else CoachService.stop(ctx)
        true
    }

    @ReactMethod fun sendTestNotification(p: Promise) = run(p) { Notifier.showTest(ctx); true }

    @SuppressLint("MissingPermission")
    @ReactMethod fun getCapabilities(p: Promise) = run(p) {
        val pm = ctx.packageManager
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val power = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
        val sm = ctx.getSystemService(Context.SENSOR_SERVICE) as SensorManager
        fun granted(perm: String) = ContextCompat.checkSelfPermission(ctx, perm) == PackageManager.PERMISSION_GRANTED

        val btGranted = Build.VERSION.SDK_INT < 31 || granted(Manifest.permission.BLUETOOTH_CONNECT)
        val watches = JSONArray()
        var btOn: Boolean? = null
        if (btGranted) {
            val adapter = (ctx.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter
            btOn = adapter?.isEnabled
            try {
                adapter?.bondedDevices?.forEach { d ->
                    val name = d.name ?: ""
                    val wearable = d.bluetoothClass?.majorDeviceClass == BluetoothClass.Device.Major.WEARABLE
                    if (wearable || Regex("(?i)watch|gt ?\\d|huawei|honor|band").containsMatchIn(name)) {
                        watches.put(JSONObject().put("name", name).put("wearableClass", wearable))
                    }
                }
            } catch (_: SecurityException) {}
        }

        val huaweiHealth = try { pm.getPackageInfo("com.huawei.health", 0); true } catch (_: Exception) { false }

        JSONObject().apply {
            put("manufacturer", Build.MANUFACTURER)
            put("model", Build.MODEL)
            put("sdkInt", Build.VERSION.SDK_INT)
            put("notificationsEnabled", NotificationManagerCompat.from(ctx).areNotificationsEnabled())
            put("exactAlarms", Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms())
            put("ignoringBatteryOptimizations", power.isIgnoringBatteryOptimizations(ctx.packageName))
            put("stepSensorAvailable", sm.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) != null)
            put("activityPermission", Build.VERSION.SDK_INT < 29 || granted(Manifest.permission.ACTIVITY_RECOGNITION))
            put("bluetoothPermission", btGranted)
            put("bluetoothOn", btOn ?: JSONObject.NULL)
            put("pairedWatches", watches)
            put("huaweiHealthInstalled", huaweiHealth)
            put("serviceRunning", CoachService.running)
            put("directWatchLink", false) // needs Huawei Wear Engine approval; not in this build
            put("checkedAt", System.currentTimeMillis())
        }.toString()
    }

    @SuppressLint("BatteryLife")
    @ReactMethod fun openSystemScreen(kind: String, p: Promise) = run(p) {
        val pkg = ctx.packageName
        val intent: Intent = when (kind) {
            "battery_request" -> Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$pkg"))
            "battery_list" -> Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
            "notifications" -> Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, pkg)
            "exact_alarm" -> if (Build.VERSION.SDK_INT >= 31)
                Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:$pkg"))
            else Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$pkg"))
            "huawei_health" -> ctx.packageManager.getLaunchIntentForPackage("com.huawei.health")
                ?: Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=com.huawei.health"))
            else -> Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$pkg"))
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            ctx.startActivity(intent)
        } catch (e: Exception) {
            ctx.startActivity(
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$pkg"))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
        }
        true
    }
}
