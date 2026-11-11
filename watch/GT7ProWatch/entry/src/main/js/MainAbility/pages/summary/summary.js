import * as coach from '../../common/coach.js';

export default {
    data: {
        scoreText: '--',
        line1: '',
        line2: '',
        intervalLabel: ''
    },
    state: null,

    onInit() {
        var self = this;
        coach.attach(this, function (s) {
            self.state = s;
            coach.tick(s, new Date().getTime());
            coach.save(s);
            self.updateView();
        });
    },

    updateView() {
        var s = this.state;
        var d = s.day;
        var sc = coach.score(d, s.settings);
        this.scoreText = sc < 0 ? '--' : sc + '';
        this.line1 = 'Moves ' + d.done + '   Missed ' + d.missed;
        this.line2 = 'Water ' + d.water + '/' + s.settings.waterTarget + '   Snoozed ' + d.snoozes;
        this.intervalLabel = 'Every ' + s.settings.intervalMin + ' min';
    },

    /* Tap to cycle the movement interval through 15/30/45/60/90/120 minutes. */
    onInterval() {
        coach.cycleInterval(this.state, new Date().getTime());
        coach.save(this.state);
        coach.buzz(false);
        this.updateView();
    },

    onSwipe(e) {
        if (e.direction === 'right' || e.direction === 'down') {
            if (this.state) {
                coach.open('pages/index/index', this.state);
            }
        }
    }
};
