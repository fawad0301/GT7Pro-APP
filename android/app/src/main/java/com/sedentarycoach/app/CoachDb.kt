package com.sedentarycoach.app

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/**
 * Durable, append-only activity ledger. Daily counters are derived from events, so a new day
 * never deletes history. Each event has a UUID so a future sync can de-duplicate safely.
 */
class CoachDb private constructor(ctx: Context) :
    SQLiteOpenHelper(ctx.applicationContext, "coach.db", null, 1) {

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """CREATE TABLE events (
                id TEXT PRIMARY KEY,
                ts INTEGER NOT NULL,
                date TEXT NOT NULL,
                type TEXT NOT NULL,
                source TEXT NOT NULL,
                value INTEGER NOT NULL DEFAULT 0,
                ref TEXT
            )"""
        )
        db.execSQL("CREATE INDEX idx_events_date ON events(date, ts)")
        db.execSQL("CREATE TABLE day_steps (date TEXT PRIMARY KEY, steps INTEGER NOT NULL DEFAULT 0)")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {}

    fun addEvent(ts: Long, date: String, type: String, source: String, value: Int = 0, ref: String? = null): String {
        val id = UUID.randomUUID().toString()
        writableDatabase.insert("events", null, ContentValues().apply {
            put("id", id); put("ts", ts); put("date", date); put("type", type)
            put("source", source); put("value", value); put("ref", ref)
        })
        return id
    }

    fun addSteps(date: String, delta: Int) {
        if (delta <= 0) return
        // INSERT OR IGNORE + UPDATE works on every SQLite version Android ships (no UPSERT needed).
        val db = writableDatabase
        db.execSQL("INSERT OR IGNORE INTO day_steps(date, steps) VALUES(?, 0)", arrayOf(date))
        db.execSQL("UPDATE day_steps SET steps = steps + ? WHERE date = ?", arrayOf<Any>(delta, date))
    }

    fun stepsFor(date: String): Int =
        readableDatabase.rawQuery("SELECT steps FROM day_steps WHERE date = ?", arrayOf(date)).use {
            if (it.moveToFirst()) it.getInt(0) else 0
        }

    fun countToday(date: String, type: String): Int =
        readableDatabase.rawQuery("SELECT COUNT(*) FROM events WHERE date = ? AND type = ?", arrayOf(date, type)).use {
            if (it.moveToFirst()) it.getInt(0) else 0
        }

    /** One row per date that has any activity, between from and to inclusive (yyyy-MM-dd). */
    fun daySummaries(from: String, to: String): JSONArray {
        val sql = """
            SELECT d.date,
              COALESCE(SUM(e.type = 'movement_due'), 0),
              COALESCE(SUM(e.type = 'movement_done'), 0),
              COALESCE(SUM(e.type = 'movement_missed'), 0),
              COALESCE(SUM(e.type = 'movement_skipped'), 0),
              COALESCE(SUM(e.type = 'snooze'), 0),
              COALESCE(SUM(e.type = 'water_due'), 0),
              COALESCE(SUM(e.type = 'water_done'), 0),
              COALESCE(SUM(e.type = 'break_detected'), 0),
              COALESCE(SUM(e.type = 'follow_up'), 0),
              COALESCE(MAX(s.steps), 0),
              COALESCE(SUM(e.type = 'movement_done' AND e.source = 'phone_sensor'), 0),
              COALESCE(SUM(e.type = 'focus_start'), 0)
            FROM (SELECT date FROM events WHERE date BETWEEN ?1 AND ?2
                  UNION SELECT date FROM day_steps WHERE date BETWEEN ?1 AND ?2) d
            LEFT JOIN events e ON e.date = d.date
            LEFT JOIN day_steps s ON s.date = d.date
            GROUP BY d.date ORDER BY d.date DESC
        """
        val out = JSONArray()
        readableDatabase.rawQuery(sql, arrayOf(from, to)).use { c ->
            while (c.moveToNext()) {
                out.put(JSONObject().apply {
                    put("date", c.getString(0))
                    put("movementDue", c.getInt(1))
                    put("movementDone", c.getInt(2))
                    put("movementMissed", c.getInt(3))
                    put("movementSkipped", c.getInt(4))
                    put("snoozes", c.getInt(5))
                    put("waterDue", c.getInt(6))
                    put("waterDone", c.getInt(7))
                    put("breaksDetected", c.getInt(8))
                    put("followUps", c.getInt(9))
                    put("phoneSteps", c.getInt(10))
                    put("autoDone", c.getInt(11))
                    put("focusSessions", c.getInt(12))
                })
            }
        }
        return out
    }

    fun eventsFor(date: String): JSONArray {
        val out = JSONArray()
        readableDatabase.rawQuery(
            "SELECT id, ts, type, source, value FROM events WHERE date = ? ORDER BY ts ASC", arrayOf(date)
        ).use { c ->
            while (c.moveToNext()) {
                out.put(JSONObject().apply {
                    put("id", c.getString(0)); put("ts", c.getLong(1)); put("type", c.getString(2))
                    put("source", c.getString(3)); put("value", c.getInt(4))
                })
            }
        }
        return out
    }

    companion object {
        @Volatile private var instance: CoachDb? = null
        fun get(ctx: Context): CoachDb =
            instance ?: synchronized(this) { instance ?: CoachDb(ctx).also { instance = it } }
    }
}
