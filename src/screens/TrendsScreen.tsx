import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { coach, DaySummary, Settings } from '../native/coach';
import { useCoachData } from '../hooks/useCoachData';
import { consistencyScore } from '../services/score';
import { addDays, DAY_NAMES, isoDate } from '../services/dates';
import { Body, Card, Chips, Label, Notice } from '../ui/components';
import { useTheme } from '../ui/theme';

type Range = 7 | 14 | 30;
type Data = { days: DaySummary[]; settings: Settings };

type Point = { date: string; value: number | null };

function BarChart({
  points,
  max,
  color,
  format,
}: {
  points: Point[];
  max: number;
  color: string;
  format?: (v: number) => string;
}) {
  const t = useTheme();
  const showLabels = points.length <= 14;
  const nonNull = points.filter(p => p.value !== null) as { date: string; value: number }[];
  const avg = nonNull.length ? nonNull.reduce((a, p) => a + p.value, 0) / nonNull.length : null;
  return (
    <View>
      <Text style={[styles.avg, { color: t.sub }]}>
        Average: {avg === null ? '—' : format ? format(avg) : avg.toFixed(1)}
      </Text>
      <View style={styles.chart} accessibilityRole="image">
        {points.map(p => {
          const h = p.value === null ? 0 : Math.max(2, (p.value / Math.max(1, max)) * 100);
          return (
            <View key={p.date} style={styles.barSlot}>
              <View style={[styles.barTrack, { backgroundColor: t.track }]}>
                <View style={[styles.bar, { height: `${h}%`, backgroundColor: color }]} />
              </View>
              {showLabels ? (
                <Text style={[styles.barLabel, { color: t.sub }]}>
                  {DAY_NAMES[(new Date(p.date + 'T12:00:00').getDay() + 6) % 7].slice(0, 2)}
                </Text>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

export default function TrendsScreen() {
  const t = useTheme();
  const [range, setRange] = useState<Range>(14);
  const { data, error } = useCoachData<Data>(async () => {
    const [days, settings] = await Promise.all([
      coach.getDays(isoDate(addDays(new Date(), -40)), isoDate(new Date())),
      coach.getSettings(),
    ]);
    return { days, settings };
  }, [], 60000);

  const series = useMemo(() => {
    if (!data) return null;
    const byDate = new Map(data.days.map(d => [d.date, d]));
    const dates: string[] = [];
    for (let i = range - 1; i >= 0; i--) dates.push(isoDate(addDays(new Date(), -i)));
    const pick = (f: (d: DaySummary) => number | null): Point[] =>
      dates.map(date => {
        const d = byDate.get(date);
        return { date, value: d ? f(d) : null };
      });
    return {
      score: pick(d => consistencyScore(d, data.settings)),
      completion: pick(d => {
        const opp = d.movementDone + d.movementMissed + d.movementSkipped;
        return opp ? (d.movementDone / opp) * 100 : null;
      }),
      missed: pick(d => d.movementMissed),
      water: pick(d => d.waterDone),
    };
  }, [data, range]);

  if (error) return <View style={styles.pad}><Notice tone="bad">{error}</Notice></View>;
  if (!data || !series) return null;

  const maxMissed = Math.max(3, ...series.missed.map(p => p.value ?? 0));
  return (
    <ScrollView contentContainerStyle={styles.pad}>
      <Chips options={[7, 14, 30] as Range[]} value={range} onChange={setRange} format={r => `${r} days`} />
      <View style={styles.gap} />
      <Card>
        <Label>Consistency score</Label>
        <BarChart points={series.score} max={100} color={t.accent} format={v => `${Math.round(v)}`} />
      </Card>
      <Card>
        <Label>Movement breaks completed</Label>
        <BarChart points={series.completion} max={100} color={t.good} format={v => `${Math.round(v)}%`} />
      </Card>
      <Card>
        <Label>Missed reminders</Label>
        <BarChart points={series.missed} max={maxMissed} color={t.bad} />
      </Card>
      {data.settings.waterEnabled ? (
        <Card>
          <Label>Water</Label>
          <BarChart
            points={series.water}
            max={Math.max(data.settings.waterDailyTarget, ...series.water.map(p => p.value ?? 0))}
            color={t.water}
          />
        </Card>
      ) : null}
      <Body color={t.sub} style={styles.small}>
        Empty bars are days with no recorded activity (weekends or days off).
      </Body>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pad: { padding: 16, paddingBottom: 32 },
  gap: { height: 12 },
  avg: { fontSize: 13, marginBottom: 8 },
  chart: { flexDirection: 'row', height: 110, alignItems: 'flex-end', gap: 3 },
  barSlot: { flex: 1, alignItems: 'center', height: '100%' },
  barTrack: { flex: 1, width: '100%', borderRadius: 4, justifyContent: 'flex-end', overflow: 'hidden' },
  bar: { width: '100%', borderRadius: 4 },
  barLabel: { fontSize: 10, marginTop: 4 },
  small: { fontSize: 13 },
});
