import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ActivityEvent, coach, DaySummary, Settings } from '../native/coach';
import { useCoachData } from '../hooks/useCoachData';
import { consistencyScore } from '../services/score';
import {
  addDays,
  daysAgo,
  fmtDayLong,
  fmtTime,
  isoDate,
  parseIso,
  weekStart,
} from '../services/dates';
import { Body, Button, Card, Chips, Label, Notice, Stat, Title } from '../ui/components';
import { useTheme } from '../ui/theme';

type Mode = 'Daily' | 'Weekly' | 'Monthly';
type Data = { days: DaySummary[]; settings: Settings };

type Bucket = {
  key: string;
  label: string;
  days: DaySummary[];
  done: number;
  missed: number;
  water: number;
  avgScore: number | null;
};

function bucketize(days: DaySummary[], s: Settings, mode: Mode): Bucket[] {
  const map = new Map<string, Bucket>();
  for (const d of days) {
    const date = parseIso(d.date);
    let key: string;
    let label: string;
    if (mode === 'Weekly') {
      const ws = weekStart(date);
      key = isoDate(ws);
      const we = addDays(ws, 6);
      label = `${ws.getDate()} ${ws.toLocaleString('en', { month: 'short' })} – ${we.getDate()} ${we.toLocaleString('en', { month: 'short' })}`;
    } else {
      key = d.date.slice(0, 7);
      label = date.toLocaleString('en', { month: 'long', year: 'numeric' });
    }
    const b = map.get(key) ?? { key, label, days: [], done: 0, missed: 0, water: 0, avgScore: null };
    b.days.push(d);
    b.done += d.movementDone;
    b.missed += d.movementMissed;
    b.water += d.waterDone;
    map.set(key, b);
  }
  const out = [...map.values()];
  for (const b of out) {
    const scores = b.days.map(d => consistencyScore(d, s)).filter((x): x is number => x !== null);
    b.avgScore = scores.length ? Math.round(scores.reduce((a, c) => a + c, 0) / scores.length) : null;
  }
  return out.sort((a, b) => (a.key < b.key ? 1 : -1));
}

export default function HistoryScreen() {
  const t = useTheme();
  const [mode, setMode] = useState<Mode>('Daily');
  const [selected, setSelected] = useState<DaySummary | null>(null);
  const { data, error } = useCoachData<Data>(async () => {
    const [days, settings] = await Promise.all([
      coach.getDays(daysAgo(400), isoDate(new Date())),
      coach.getSettings(),
    ]);
    return { days, settings };
  }, [], 60000);

  const buckets = useMemo(
    () => (data && mode !== 'Daily' ? bucketize(data.days, data.settings, mode) : []),
    [data, mode],
  );

  if (error) return <View style={styles.pad}><Notice tone="bad">{error}</Notice></View>;
  if (!data) return null;

  if (selected) {
    return <DayDetail day={selected} settings={data.settings} onBack={() => setSelected(null)} />;
  }

  const header = (
    <View>
      <Chips options={['Daily', 'Weekly', 'Monthly'] as Mode[]} value={mode} onChange={setMode} />
      <View style={styles.gap} />
      {data.days.length === 0 ? (
        <Notice tone="info">No history yet. Your first day appears here once reminders start.</Notice>
      ) : null}
    </View>
  );

  if (mode === 'Daily') {
    return (
      <FlatList
        contentContainerStyle={styles.pad}
        data={data.days}
        keyExtractor={d => d.date}
        ListHeaderComponent={header}
        renderItem={({ item }) => {
          const score = consistencyScore(item, data.settings);
          return (
            <Pressable accessibilityRole="button" onPress={() => setSelected(item)}>
              <Card style={styles.rowCard}>
                <View style={styles.flex}>
                  <Text style={[styles.rowTitle, { color: t.text }]}>{fmtDayLong(item.date)}</Text>
                  <Text style={{ color: t.sub }}>
                    {item.movementDone} moves · {item.movementMissed} missed
                    {data.settings.waterEnabled ? ` · ${item.waterDone} water` : ''}
                  </Text>
                </View>
                <Text style={[styles.score, { color: scoreColor(score, t) }]}>
                  {score === null ? '—' : score}
                </Text>
              </Card>
            </Pressable>
          );
        }}
      />
    );
  }

  return (
    <FlatList
      contentContainerStyle={styles.pad}
      data={buckets}
      keyExtractor={b => b.key}
      ListHeaderComponent={header}
      renderItem={({ item }) => (
        <Card>
          <View style={styles.between}>
            <Text style={[styles.rowTitle, { color: t.text }]}>{item.label}</Text>
            <Text style={[styles.score, { color: scoreColor(item.avgScore, t) }]}>
              {item.avgScore === null ? '—' : item.avgScore}
            </Text>
          </View>
          <View style={styles.stats}>
            <Stat value={item.days.length} label="Days" />
            <Stat value={item.done} label="Moves" color={t.good} />
            <Stat value={item.missed} label="Missed" color={item.missed ? t.bad : t.text} />
            {data.settings.waterEnabled ? <Stat value={item.water} label="Water" color={t.water} /> : null}
          </View>
        </Card>
      )}
    />
  );
}

const EVENT_LABEL: Record<string, string> = {
  movement_due: 'Movement reminder',
  movement_done: 'Moved',
  movement_missed: 'Reminder missed',
  movement_skipped: 'Skipped',
  snooze: 'Snoozed',
  follow_up: 'Follow-up reminder',
  water_due: 'Water reminder',
  water_done: 'Drank water',
  break_detected: 'Walking detected by phone',
  focus_start: 'Paused (focus/meeting)',
  focus_end: 'Resumed',
};

function DayDetail({ day, settings, onBack }: { day: DaySummary; settings: Settings; onBack: () => void }) {
  const t = useTheme();
  const { data: events } = useCoachData<ActivityEvent[]>(() => coach.getEvents(day.date), [day.date], 0);
  const score = consistencyScore(day, settings);
  return (
    <ScrollView contentContainerStyle={styles.pad}>
      <Button label="‹ Back to history" kind="secondary" onPress={onBack} />
      <View style={styles.gap} />
      <Card>
        <Label>{fmtDayLong(day.date)}</Label>
        <Title>{score === null ? 'No score' : `Consistency ${score} / 100`}</Title>
        <View style={styles.stats}>
          <Stat value={day.movementDue} label="Reminders" />
          <Stat value={day.movementDone} label="Done" color={t.good} />
          <Stat value={day.movementMissed} label="Missed" color={day.movementMissed ? t.bad : t.text} />
          <Stat value={day.snoozes} label="Snoozes" />
        </View>
        <View style={[styles.stats, styles.gap]}>
          <Stat value={day.waterDone} label="Water" color={t.water} />
          <Stat value={day.movementSkipped} label="Skipped" />
          <Stat value={day.breaksDetected} label="Auto breaks" />
          <Stat value={day.phoneSteps} label="Phone steps" />
        </View>
      </Card>
      <Card>
        <Label>Timeline</Label>
        {(events ?? []).length === 0 ? <Body color={t.sub}>No events recorded.</Body> : null}
        {(events ?? []).map(e => (
          <View key={e.id} style={[styles.event, { borderColor: t.border }]}>
            <Text style={[styles.eventTime, { color: t.sub }]}>{fmtTime(e.ts)}</Text>
            <Text style={[styles.flex, { color: t.text }]}>
              {EVENT_LABEL[e.type] ?? e.type}
              {e.source === 'phone_sensor' && e.type === 'movement_done' ? ' (auto)' : ''}
            </Text>
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}

function scoreColor(score: number | null, t: ReturnType<typeof useTheme>) {
  if (score === null) return t.sub;
  if (score >= 65) return t.good;
  if (score >= 40) return t.warn;
  return t.bad;
}

const styles = StyleSheet.create({
  pad: { padding: 16, paddingBottom: 32 },
  gap: { height: 12 },
  flex: { flex: 1 },
  rowCard: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  rowTitle: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
  score: { fontSize: 22, fontWeight: '800', marginLeft: 12 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  stats: { flexDirection: 'row' },
  event: { flexDirection: 'row', paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, gap: 12 },
  eventTime: { width: 48, fontVariant: ['tabular-nums'] },
});
