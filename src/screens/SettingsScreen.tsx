import React, { useEffect, useState } from 'react';
import { PermissionsAndroid, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { coach, Settings } from '../native/coach';
import { DAY_NAMES, fmtMinutes } from '../services/dates';
import { Body, Button, Card, Chips, Label, Notice, Row, Stepper, Toggle } from '../ui/components';
import { useTheme } from '../ui/theme';

const MOVE_PRESETS = [15, 30, 45, 60, 90, 120];
const WATER_PRESETS = [30, 45, 60, 90, 120];
const SNOOZE_PRESETS = [5, 10, 15];

export default function SettingsScreen() {
  const t = useTheme();
  const [saved, setSaved] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);

  useEffect(() => {
    coach
      .getSettings()
      .then(s => {
        setSaved(s);
        setDraft(s);
      })
      .catch(e => setMsg({ tone: 'bad', text: String(e?.message ?? e) }));
  }, []);

  if (!draft || !saved) {
    return msg ? <View style={styles.pad}><Notice tone="bad">{msg.text}</Notice></View> : null;
  }

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => {
    const next = { ...draft, [k]: v };
    // The follow-up must come before the next interval (mirrors native normalisation).
    next.followUpDelayMin = Math.min(next.followUpDelayMin, Math.max(2, next.movementIntervalMin - 2));
    setDraft(next);
    setMsg(null);
  };
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  const save = async () => {
    try {
      if (draft.smartResetEnabled && Platform.OS === 'android' && Platform.Version >= 29) {
        await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION);
      }
      const s = await coach.saveSettings(draft);
      setSaved(s);
      setDraft(s);
      setMsg({ tone: 'good', text: 'Saved. The new schedule is active now.' });
    } catch (e: any) {
      setMsg({ tone: 'bad', text: `Could not save: ${e?.message ?? e}` });
    }
  };

  const toggleDay = (i: number) => set('activeDays', draft.activeDays ^ (1 << i));
  const custom = !MOVE_PRESETS.includes(draft.movementIntervalMin);

  return (
    <ScrollView contentContainerStyle={styles.pad}>
      <Card>
        <Label>Active hours</Label>
        <Row
          label="Start"
          right={<Stepper value={draft.activeStartMin} step={15} min={0} max={1425} format={fmtMinutes}
            onChange={v => set('activeStartMin', v)} />}
        />
        <Row
          label="End"
          right={<Stepper value={draft.activeEndMin} step={15} min={15} max={1440} format={fmtMinutes}
            onChange={v => set('activeEndMin', v)} />}
        />
        <Text style={[styles.sub, { color: t.sub }]}>Days</Text>
        <View style={styles.days}>
          {DAY_NAMES.map((d, i) => {
            const on = (draft.activeDays >> i) & 1;
            return (
              <Pressable
                key={d}
                accessibilityRole="button"
                accessibilityState={{ selected: !!on }}
                onPress={() => toggleDay(i)}
                style={[styles.day, { borderColor: on ? t.accent : t.border, backgroundColor: on ? t.accent : 'transparent' }]}>
                <Text style={{ color: on ? t.accentText : t.text, fontWeight: '700' }}>{d.slice(0, 2)}</Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Card>
        <Label>Movement reminder</Label>
        <Body>Remind me every {draft.movementIntervalMin} minutes of sitting.</Body>
        <Chips options={MOVE_PRESETS} value={custom ? -1 : draft.movementIntervalMin}
          onChange={v => set('movementIntervalMin', v)} format={v => `${v}m`} />
        <Row
          label="Custom interval"
          right={<Stepper value={draft.movementIntervalMin} step={5} min={5} max={240}
            format={v => `${v}m`} onChange={v => set('movementIntervalMin', v)} />}
        />
        <Row
          label="Snooze length"
          right={<Chips options={SNOOZE_PRESETS} value={draft.snoozeMin}
            onChange={v => set('snoozeMin', v)} format={v => `${v}m`} />}
        />
        <Row
          label="One gentle follow-up"
          hint={draft.followUpEnabled ? `If ignored, remind once more after ${draft.followUpDelayMin} min.` : 'Only one reminder per interval.'}
          right={<Toggle value={draft.followUpEnabled} onChange={v => set('followUpEnabled', v)} />}
        />
        {draft.followUpEnabled ? (
          <Row
            label="Follow-up after"
            right={<Stepper value={draft.followUpDelayMin} step={1} min={2} max={Math.max(2, draft.movementIntervalMin - 2)}
              format={v => `${v}m`} onChange={v => set('followUpDelayMin', v)} />}
          />
        ) : null}
      </Card>

      <Card>
        <Label>Smart inactivity reset</Label>
        <Row
          label="Reset timer when I walk"
          hint="Uses the phone's step counter (keep the phone in your pocket). The GT 7 Pro's own sensor data is not available to third-party phone apps."
          right={<Toggle value={draft.smartResetEnabled} onChange={v => set('smartResetEnabled', v)} />}
        />
        {draft.smartResetEnabled ? (
          <Row
            label="Steps that count as a break"
            hint="Within about 4 minutes."
            right={<Stepper value={draft.smartResetSteps} step={10} min={10} max={500}
              onChange={v => set('smartResetSteps', v)} />}
          />
        ) : null}
      </Card>

      <Card>
        <Label>Water reminder</Label>
        <Row label="Water reminders" right={<Toggle value={draft.waterEnabled} onChange={v => set('waterEnabled', v)} />} />
        {draft.waterEnabled ? (
          <>
            <Chips options={WATER_PRESETS} value={draft.waterIntervalMin}
              onChange={v => set('waterIntervalMin', v)} format={v => `${v}m`} />
            <Row label="From" right={<Stepper value={draft.waterStartMin} step={15} min={0} max={1425}
              format={fmtMinutes} onChange={v => set('waterStartMin', v)} />} />
            <Row label="Until" right={<Stepper value={draft.waterEndMin} step={15} min={15} max={1440}
              format={fmtMinutes} onChange={v => set('waterEndMin', v)} />} />
            <Row label="Daily target (glasses)" right={<Stepper value={draft.waterDailyTarget} step={1} min={1} max={20}
              onChange={v => set('waterDailyTarget', v)} />} />
          </>
        ) : null}
      </Card>

      <Card>
        <Label>Focus / meeting mode</Label>
        <Row
          label="Default pause length"
          hint="Used by the Pause button on the notification and the Focus button."
          right={<Stepper value={draft.focusDefaultMin} step={15} min={15} max={480}
            format={v => `${v}m`} onChange={v => set('focusDefaultMin', v)} />}
        />
      </Card>

      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      <View style={styles.actions}>
        <Button label="Discard" kind="secondary" disabled={!dirty} onPress={() => setDraft(saved)} style={styles.flex} />
        <Button label="Save" disabled={!dirty} onPress={save} style={styles.flex} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pad: { padding: 16, paddingBottom: 32 },
  sub: { fontSize: 13, marginTop: 12 },
  days: { flexDirection: 'row', gap: 6, marginTop: 8 },
  day: { flex: 1, height: 42, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
});
