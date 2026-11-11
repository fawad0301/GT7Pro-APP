import React, { useCallback } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { coach, CoachAction, DaySummary, Settings, Status } from '../native/coach';
import { useCoachData } from '../hooks/useCoachData';
import { consistencyScore, scoreLabel } from '../services/score';
import { fmtDuration, fmtMinutes, fmtTime } from '../services/dates';
import { Body, Button, Card, Label, Notice, Progress, Stat, Title } from '../ui/components';
import { useTheme } from '../ui/theme';

type TodayData = { status: Status; settings: Settings; day: DaySummary | null };

const EMPTY_DAY = (date: string): DaySummary => ({
  date,
  movementDue: 0,
  movementDone: 0,
  movementMissed: 0,
  movementSkipped: 0,
  snoozes: 0,
  waterDue: 0,
  waterDone: 0,
  breaksDetected: 0,
  followUps: 0,
  phoneSteps: 0,
  autoDone: 0,
  focusSessions: 0,
});

export default function TodayScreen({ onOpenWatch }: { onOpenWatch: () => void }) {
  const t = useTheme();
  const { data, error, refresh } = useCoachData<TodayData>(async () => {
    const [status, settings] = await Promise.all([coach.getStatus(), coach.getSettings()]);
    const days = await coach.getDays(status.today, status.today);
    return { status, settings, day: days[0] ?? null };
  }, [], 15000);

  const act = useCallback(
    async (a: CoachAction) => {
      await coach.action(a);
      refresh();
    },
    [refresh],
  );

  if (error) {
    return (
      <ScrollView contentContainerStyle={styles.pad}>
        <Notice tone="bad">Could not reach the reminder engine: {error}</Notice>
      </ScrollView>
    );
  }
  if (!data) return null;

  const { status: st, settings: s } = data;
  const day = data.day ?? EMPTY_DAY(st.today);
  const score = consistencyScore(day, s);
  const focus = st.focusUntil > 0;
  const pending = st.pendingSince > 0;

  let headline: string;
  let detail: string;
  if (focus) {
    headline = 'Reminders paused';
    detail = `Resumes automatically at ${fmtTime(st.focusUntil)}.`;
  } else if (!st.inWindow) {
    headline = 'Outside active hours';
    detail = st.nextWindowStart
      ? `Reminders start again ${fmtWhen(st.nextWindowStart)}.`
      : `Active hours: ${fmtMinutes(s.activeStartMin)}–${fmtMinutes(s.activeEndMin)}.`;
  } else if (pending) {
    headline = 'Time to move!';
    detail = `Reminder sent at ${fmtTime(st.pendingSince)}. Stand up, stretch and walk a little.`;
  } else {
    headline = st.nextMovementAt ? `Next move at ${fmtTime(st.nextMovementAt)}` : 'Starting…';
    detail = st.anchorAt
      ? `Sitting for ${fmtDuration(st.now - st.anchorAt)} since your last break.`
      : '';
  }

  const movePct = st.nextMovementAt && st.anchorAt
    ? (st.now - st.anchorAt) / Math.max(1, st.nextMovementAt - st.anchorAt)
    : pending ? 1 : 0;

  return (
    <ScrollView
      contentContainerStyle={styles.pad}
      refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} />}>
      {!st.serviceRunning && st.serviceEnabled ? (
        <Notice tone="warn">
          The background service is not running. Open Watch & setup to fix battery settings.
        </Notice>
      ) : null}

      <Card>
        <Label>Right now</Label>
        <Title>{headline}</Title>
        {detail ? <Body color={t.sub}>{detail}</Body> : null}
        {st.inWindow && !focus ? (
          <View style={styles.gapTop}>
            <Progress value={movePct} color={pending ? t.warn : t.accent} />
          </View>
        ) : null}
        <View style={[styles.actions, styles.gapTop]}>
          <Button label="I moved" onPress={() => act('movement_done')} style={styles.flex} />
          {pending ? (
            <Button
              label={`Snooze ${s.snoozeMin}m`}
              kind="secondary"
              onPress={() => act('snooze')}
              style={styles.flex}
            />
          ) : null}
        </View>
        <View style={[styles.actions, styles.gapSmall]}>
          {focus ? (
            <Button label="Resume now" kind="secondary" onPress={() => act('focus_end')} style={styles.flex} />
          ) : (
            <>
              <Button
                label="Meeting 30m"
                kind="secondary"
                onPress={() => coach.startFocus(30).then(refresh)}
                style={styles.flex}
              />
              <Button
                label={`Focus ${s.focusDefaultMin}m`}
                kind="secondary"
                onPress={() => coach.startFocus(s.focusDefaultMin).then(refresh)}
                style={styles.flex}
              />
            </>
          )}
        </View>
      </Card>

      <Card>
        <Label>Today</Label>
        <View style={styles.stats}>
          <Stat value={day.movementDone} label="Moves done" color={t.good} />
          <Stat value={day.movementMissed} label="Missed" color={day.movementMissed ? t.bad : t.text} />
          <Stat value={day.snoozes} label="Snoozed" />
          <Stat value={Math.max(0, day.breaksDetected - day.autoDone)} label="Auto breaks" />
        </View>
      </Card>

      {s.waterEnabled ? (
        <Card>
          <Label>Water</Label>
          <View style={styles.between}>
            <Title>
              {day.waterDone} / {s.waterDailyTarget} glasses
            </Title>
            <Button label="+ Water" kind="secondary" onPress={() => act('water_done')} />
          </View>
          <Progress value={day.waterDone / s.waterDailyTarget} color={t.water} />
          {st.nextWaterAt && !focus ? (
            <Body color={t.sub} style={styles.gapSmall}>
              Next water reminder at {fmtTime(st.nextWaterAt)}
            </Body>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <Label>Activity consistency score</Label>
        <View style={styles.between}>
          <Title>{score === null ? '—' : `${score} / 100`}</Title>
          <Body color={t.sub}>{scoreLabel(score)}</Body>
        </View>
        <Body color={t.sub} style={styles.small}>
          Shows how consistently you followed your reminders. It is not a health or medical measure.
        </Body>
        {st.sensorActive ? (
          <Body color={t.sub} style={styles.small}>
            Phone steps today: {st.phoneStepsToday}
          </Body>
        ) : null}
      </Card>

      <Button label="Watch & setup" kind="secondary" onPress={onOpenWatch} />
    </ScrollView>
  );
}

function fmtWhen(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(d, now)) return `today at ${fmtTime(ts)}`;
  if (sameDay(d, tomorrow)) return `tomorrow at ${fmtTime(ts)}`;
  return `${d.toLocaleDateString('en', { weekday: 'long' })} at ${fmtTime(ts)}`;
}

const styles = StyleSheet.create({
  pad: { padding: 16, paddingBottom: 32 },
  actions: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
  gapTop: { marginTop: 14 },
  gapSmall: { marginTop: 8 },
  stats: { flexDirection: 'row', marginTop: 4 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  small: { fontSize: 13, marginTop: 6 },
});
