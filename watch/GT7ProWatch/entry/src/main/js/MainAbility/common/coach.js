/*
 * Sedentary Coach - watch-side engine (Huawei lite wearable, JS/FA model).
 *
 * Runs on the watch only while the app is open (lite wearables do not let third-party apps
 * run in the background). Reminders while the app is closed come from the phone app via
 * Huawei Health notification mirroring.
 *
 * APIs used (all marked liteWearable in the SDK): @system.storage, @system.vibrator,
 * @system.sensor (step counter, needs ohos.permission.ACTIVITY_MOTION).
 */
import storage from '@system.storage';
import router from '@system.router';
import vibrator from '@system.vibrator';

var KEY = 'coach_state_v1';
var MIN = 60000;

export var PRESETS = [15, 30, 45, 60, 90, 120];

export var DEFAULTS = {
    activeStartMin: 9 * 60,
    activeEndMin: 17 * 60,
    activeDays: 31,          // bit0 = Mon ... bit6 = Sun (Mon-Fri)
    intervalMin: 45,
    snoozeMin: 10,
    followUpMin: 10,
    waterTarget: 8,
    focusMin: 60,
    breakSteps: 50
};

function pad(n) {
    return n < 10 ? '0' + n : '' + n;
}

export function today(ts) {
    var d = ts ? new Date(ts) : new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

export function hhmm(ts) {
    var d = new Date(ts);
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
}

function emptyDay(date) {
    return { date: date, due: 0, done: 0, missed: 0, skipped: 0, snoozes: 0, water: 0, breaks: 0, autoDone: 0 };
}

export function newState() {
    var s = {
        settings: {},
        day: emptyDay(today()),
        history: [],          // last 14 closed days
        anchorAt: 0,          // start of the current sitting period
        nextAt: 0,            // explicit next reminder (after snooze), 0 = anchor + interval
        pendingSince: 0,      // a reminder is waiting for Done/Snooze/Skip
        followUpSent: false,
        focusUntil: 0,
        lastBreakAt: 0
    };
    for (var k in DEFAULTS) {
        s.settings[k] = DEFAULTS[k];
    }
    return s;
}

export function load(cb) {
    storage.get({
        key: KEY,
        success: function (data) {
            var s = null;
            try {
                s = data ? JSON.parse(data) : null;
            } catch (e) {
                s = null;
            }
            if (!s || !s.day) {
                s = newState();
            }
            for (var k in DEFAULTS) {
                if (s.settings[k] === undefined) {
                    s.settings[k] = DEFAULTS[k];
                }
            }
            cb(s);
        },
        fail: function () {
            cb(newState());
        }
    });
}

export function save(s) {
    storage.set({ key: KEY, value: JSON.stringify(s) });
}

/*
 * Pages are bundled separately and storage.set is asynchronous, so a page that reloads state
 * right after another page saved it can read a stale copy. Every page switch therefore carries
 * the state in the router params; storage is only the source of truth on a cold start.
 */
export function open(uri, s, extra) {
    var params = { stateJson: JSON.stringify(s) };
    if (extra) {
        for (var k in extra) {
            params[k] = extra[k];
        }
    }
    router.replace({ uri: uri, params: params });
}

export function attach(page, cb) {
    if (page.stateJson) {
        var s = null;
        try {
            s = JSON.parse(page.stateJson);
        } catch (e) {
            s = null;
        }
        page.stateJson = '';
        if (s && s.day && s.settings) {
            cb(s);
            return;
        }
    }
    load(cb);
}

export function inActiveWindow(s, now) {
    var d = new Date(now);
    var dow = (d.getDay() + 6) % 7; // Monday = 0
    var m = d.getHours() * 60 + d.getMinutes();
    var set = s.settings;
    return ((set.activeDays >> dow) & 1) === 1 && m >= set.activeStartMin && m < set.activeEndMin;
}

export function dueAt(s) {
    if (s.nextAt) {
        return s.nextAt;
    }
    return s.anchorAt + s.settings.intervalMin * MIN;
}

/* Close the previous day and start a new one. History is kept (never deleted on reset). */
function rollover(s, now) {
    var t = today(now);
    if (s.day.date === t) {
        return;
    }
    if (s.pendingSince) {
        s.day.missed += 1;
    }
    s.history.unshift(s.day);
    if (s.history.length > 14) {
        s.history.length = 14;
    }
    s.day = emptyDay(t);
    s.anchorAt = 0;
    s.nextAt = 0;
    s.pendingSince = 0;
    s.followUpSent = false;
}

/*
 * Advance the engine. Returns an event: 'remind', 'followup', or '' (nothing to show).
 */
export function tick(s, now) {
    rollover(s, now);
    var set = s.settings;
    if (s.focusUntil && now >= s.focusUntil) {
        s.focusUntil = 0;
        s.anchorAt = now;
        s.nextAt = 0;
    }
    if (s.focusUntil || !inActiveWindow(s, now)) {
        if (s.pendingSince && !s.focusUntil) {
            s.day.missed += 1;
        }
        s.pendingSince = 0;
        s.followUpSent = false;
        s.anchorAt = 0;
        s.nextAt = 0;
        return '';
    }
    if (!s.anchorAt) {
        s.anchorAt = now;
    }
    if (s.pendingSince) {
        if (now >= s.pendingSince + set.intervalMin * MIN) {
            // A whole interval passed unanswered: count one missed break, remind again.
            s.day.missed += 1;
            s.pendingSince = now;
            s.followUpSent = false;
            s.day.due += 1;
            return 'remind';
        }
        if (!s.followUpSent && now >= s.pendingSince + set.followUpMin * MIN) {
            s.followUpSent = true;
            return 'followup';
        }
        return '';
    }
    if (now >= dueAt(s)) {
        s.pendingSince = now;
        s.followUpSent = false;
        s.nextAt = 0;
        s.day.due += 1;
        return 'remind';
    }
    return '';
}

export function moved(s, now, auto) {
    if (auto) {
        s.day.breaks += 1;
        if (s.pendingSince) {
            s.day.autoDone = (s.day.autoDone || 0) + 1;
        }
    }
    if (s.pendingSince || !auto) {
        s.day.done += 1;
    }
    s.pendingSince = 0;
    s.followUpSent = false;
    s.anchorAt = now;
    s.nextAt = 0;
}

export function snooze(s, now) {
    s.day.snoozes += 1;
    s.pendingSince = 0;
    s.followUpSent = false;
    s.nextAt = now + s.settings.snoozeMin * MIN;
}

export function skip(s, now) {
    s.day.skipped += 1;
    s.pendingSince = 0;
    s.followUpSent = false;
    s.anchorAt = now;
    s.nextAt = 0;
}

export function water(s) {
    s.day.water += 1;
}

export function startFocus(s, now) {
    s.focusUntil = now + s.settings.focusMin * MIN;
    s.pendingSince = 0;
    s.followUpSent = false;
}

export function endFocus(s, now) {
    s.focusUntil = 0;
    s.anchorAt = now;
    s.nextAt = 0;
}

export function cycleInterval(s, now) {
    var i = PRESETS.indexOf(s.settings.intervalMin);
    s.settings.intervalMin = PRESETS[(i + 1) % PRESETS.length];
    s.nextAt = 0;
    if (!s.pendingSince && s.anchorAt) {
        s.anchorAt = Math.min(s.anchorAt, now);
    }
}

/*
 * Activity consistency score 0-100 (same formula as the phone app, score version 1).
 * Not a health or medical measure. Returns -1 when there is no data yet.
 */
export function score(day, set) {
    // Breaks detected before a reminder was due count as successes too.
    var successes = day.done + Math.max(0, day.breaks - (day.autoDone || 0));
    var opportunities = successes + day.missed + 0.5 * day.skipped;
    var parts = 0;
    var total = 0;
    if (opportunities > 0) {
        total += 0.8 * (successes / opportunities);
        parts += 0.8;
    }
    if (day.water > 0 || day.due > 0) {
        total += 0.2 * Math.min(day.water / Math.max(1, set.waterTarget), 1);
        parts += 0.2;
    }
    if (parts === 0) {
        return -1;
    }
    var penalty = Math.min(Math.max(0, day.snoozes - 2) * 2, 10);
    return Math.max(0, Math.min(100, Math.round((total / parts) * 100 - penalty)));
}

export function buzz(strong) {
    vibrator.vibrate({
        mode: strong ? 'long' : 'short',
        success: function () {},
        fail: function () {}
    });
}
