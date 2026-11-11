import * as coach from '../../common/coach.js';

// Two short lines each: lite text wraps by character, not by word.
var PROMPTS = [
    ['Stand up, stretch', 'take a few steps'],
    ['Short walk -', 'even 2 min helps'],
    ['Stand tall and', 'reach overhead'],
    ['Walk over and', 'refill your water']
];

export default {
    data: {
        title: 'Time to move',
        prompt1: PROMPTS[0][0],
        prompt2: PROMPTS[0][1],
        snoozeLabel: 'Snooze'
    },
    state: null,
    timer: null,
    shown: false,

    onInit() {
        var self = this;
        var p = PROMPTS[Math.floor(new Date().getTime() / 60000) % PROMPTS.length];
        this.prompt1 = p[0];
        this.prompt2 = p[1];
        if (this.followUp) {
            this.title = 'Still sitting?';
        }
        coach.attach(this, function (s) {
            self.state = s;
            self.snoozeLabel = 'Snooze ' + s.settings.snoozeMin + 'm';
            if (self.shown) {
                self.leaveIfIdle();
            }
        });
    },

    /* Opened without a pending reminder (e.g. state changed): go home. */
    leaveIfIdle() {
        if (this.state && !this.state.pendingSince) {
            coach.open('pages/index/index', this.state);
        }
    },

    onShow() {
        var self = this;
        this.shown = true;
        this.leaveIfIdle();
        // Keep checking for the single follow-up / missed state while this screen is open.
        this.timer = setInterval(function () {
            if (!self.state) {
                return;
            }
            var ev = coach.tick(self.state, new Date().getTime());
            coach.save(self.state);
            if (ev === 'followup') {
                self.title = 'Still sitting?';
                coach.buzz(true);
            } else if (ev === 'remind') {
                self.title = 'Time to move';
                coach.buzz(true);
            } else if (!self.state.pendingSince) {
                coach.open('pages/index/index', self.state);
            }
        }, 15000);
    },

    onDestroy() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    },

    finish(action) {
        if (!this.state) {
            return;
        }
        var now = new Date().getTime();
        if (action === 'done') {
            coach.moved(this.state, now, false);
        } else if (action === 'snooze') {
            coach.snooze(this.state, now);
        } else {
            coach.skip(this.state, now);
        }
        coach.save(this.state);
        coach.buzz(false);
        coach.open('pages/index/index', this.state);
    },

    onDone() {
        this.finish('done');
    },
    onSnooze() {
        this.finish('snooze');
    },
    onSkip() {
        this.finish('skip');
    }
};
