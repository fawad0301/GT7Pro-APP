import sensor from '@system.sensor';
import * as coach from '../../common/coach.js';

var TICK_MS = 15000;
var BREAK_WINDOW_MS = 4 * 60000;

export default {
    data: {
        label: '',
        big: '--:--',
        sub: '',
        counts: '',
        focusLabel: 'Pause',
        ringPercent: 0
    },
    state: null,
    timer: null,
    shown: false,
    stepSamples: [],

    onInit() {
        var self = this;
        coach.attach(this, function (s) {
            self.state = s;
            // Navigating away before the page is shown upsets the ACE lifecycle,
            // so only draw here; onShow runs the first real tick.
            if (self.shown) {
                self.step();
            } else {
                self.updateView();
            }
        });
    },

    onShow() {
        var self = this;
        this.shown = true;
        this.step();
        this.timer = setInterval(function () {
            self.step();
        }, TICK_MS);
        this.watchSteps();
    },

    onDestroy() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        sensor.unsubscribeStepCounter();
    },

    /* Smart inactivity reset: real walking on the watch restarts the sitting timer. */
    watchSteps() {
        var self = this;
        sensor.subscribeStepCounter({
            success: function (data) {
                self.onSteps(data.steps);
            },
            fail: function () {
                // No permission or no sensor: fixed-interval reminders still work.
            }
        });
    },

    onSteps(steps) {
        var s = this.state;
        if (!s) {
            return;
        }
        var now = new Date().getTime();
        this.stepSamples.push({ t: now, n: steps });
        while (this.stepSamples.length && now - this.stepSamples[0].t > BREAK_WINDOW_MS) {
            this.stepSamples.shift();
        }
        var walked = steps - this.stepSamples[0].n;
        if (walked >= s.settings.breakSteps && now - s.lastBreakAt > 10 * 60000 && coach.inActiveWindow(s, now)) {
            s.lastBreakAt = now;
            coach.moved(s, now, true);
            coach.save(s);
            this.stepSamples = [{ t: now, n: steps }];
            this.updateView();
        }
    },

    step() {
        var s = this.state;
        if (!s) {
            return;
        }
        var now = new Date().getTime();
        var ev = coach.tick(s, now);
        coach.save(s);
        if (ev === 'remind' || ev === 'followup' || s.pendingSince) {
            if (ev) {
                coach.buzz(true);
            }
            coach.open('pages/reminder/reminder', s, { followUp: ev === 'followup' });
            return;
        }
        this.updateView();
    },

    updateView() {
        var s = this.state;
        var now = new Date().getTime();
        var set = s.settings;
        if (s.focusUntil) {
            this.label = 'PAUSED UNTIL';
            this.big = coach.hhmm(s.focusUntil);
            this.sub = 'Meeting / focus mode';
            this.ringPercent = 0;
            this.focusLabel = 'Resume';
        } else if (!coach.inActiveWindow(s, now)) {
            this.label = 'OFF HOURS';
            this.big = coach.hhmm(now);
            this.sub = 'Active ' + this.mm(set.activeStartMin) + '-' + this.mm(set.activeEndMin);
            this.ringPercent = 0;
            this.focusLabel = 'Pause';
        } else {
            var due = coach.dueAt(s);
            var span = Math.max(1, due - s.anchorAt);
            this.label = 'NEXT MOVE';
            this.big = coach.hhmm(due);
            this.sub = 'Sitting ' + Math.max(0, Math.round((now - s.anchorAt) / 60000)) + ' min';
            this.ringPercent = Math.max(0, Math.min(100, Math.round(((now - s.anchorAt) / span) * 100)));
            this.focusLabel = 'Pause ' + set.focusMin + 'm';
        }
        this.counts = 'Moves ' + s.day.done + '  Water ' + s.day.water + '/' + set.waterTarget;
    },

    mm(min) {
        var h = Math.floor(min / 60);
        var m = min % 60;
        return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
    },

    onMoved() {
        coach.moved(this.state, new Date().getTime(), false);
        coach.save(this.state);
        coach.buzz(false);
        this.updateView();
    },

    onWater() {
        coach.water(this.state);
        coach.save(this.state);
        coach.buzz(false);
        this.updateView();
    },

    onFocus() {
        var now = new Date().getTime();
        if (this.state.focusUntil) {
            coach.endFocus(this.state, now);
        } else {
            coach.startFocus(this.state, now);
        }
        coach.save(this.state);
        this.updateView();
    },

    onSwipe(e) {
        if (e.direction === 'left' || e.direction === 'up') {
            if (this.state) {
                coach.open('pages/summary/summary', this.state);
            }
        }
    }
};
