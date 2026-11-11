import React from 'react';
import { PermissionsAndroid, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Capabilities, coach, Status } from '../native/coach';
import { useCoachData } from '../hooks/useCoachData';
import { fmtTime } from '../services/dates';
import { Body, Button, Card, Label, Notice, Row, Toggle } from '../ui/components';
import { useTheme } from '../ui/theme';

type Data = { caps: Capabilities; status: Status };

function Check({ ok, label, hint, fix }: { ok: boolean | null; label: string; hint?: string; fix?: React.ReactNode }) {
  const t = useTheme();
  const mark = ok === null ? '–' : ok ? '✓' : '!';
  const color = ok === null ? t.sub : ok ? t.good : t.warn;
  return (
    <View style={[styles.check, { borderColor: t.border }]}>
      <Text style={[styles.mark, { color }]}>{mark}</Text>
      <View style={styles.flex}>
        <Text style={[styles.checkLabel, { color: t.text }]}>{label}</Text>
        {hint ? <Text style={[styles.hint, { color: t.sub }]}>{hint}</Text> : null}
        {fix && !ok ? <View style={styles.fix}>{fix}</View> : null}
      </View>
    </View>
  );
}

export default function WatchScreen() {
  const t = useTheme();
  const { data, error, refresh } = useCoachData<Data>(async () => {
    const [caps, status] = await Promise.all([coach.getCapabilities(), coach.getStatus()]);
    return { caps, status };
  }, [], 10000);

  if (error) return <View style={styles.pad}><Notice tone="bad">{error}</Notice></View>;
  if (!data) return null;
  const { caps: c, status: st } = data;

  const askNotifications = async () => {
    if (Platform.OS === 'android' && Platform.Version >= 33) {
      const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      if (r === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) await coach.open('notifications');
    } else {
      await coach.open('notifications');
    }
    refresh();
  };
  const askBluetooth = async () => {
    if (Platform.OS === 'android' && Platform.Version >= 31) {
      await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
    }
    refresh();
  };
  const askActivity = async () => {
    const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION);
    if (r === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) await coach.open('app');
    await coach.setServiceEnabled(true); // restart so the step sensor attaches
    refresh();
  };

  const watchNames = c.pairedWatches.map(w => w.name).filter(Boolean);
  const allGood =
    c.notificationsEnabled && c.ignoringBatteryOptimizations && c.exactAlarms && st.serviceRunning && c.huaweiHealthInstalled;

  return (
    <ScrollView contentContainerStyle={styles.pad}>
      <Card>
        <Label>Always-on reminders</Label>
        <Row
          label="Keep Sedentary Coach running"
          hint={
            st.serviceRunning
              ? 'Running in the background with a small status notification. Restarts after reboot.'
              : st.serviceEnabled
                ? 'Enabled but not running. Fix the items below, then reopen the app.'
                : 'Off: reminders still fire, but Android may stop them when it saves battery.'
          }
          right={<Toggle value={st.serviceEnabled} onChange={v => coach.setServiceEnabled(v).then(refresh)} />}
        />
        <Body color={t.sub} style={styles.small}>
          Last check {fmtTime(c.checkedAt)} · next engine wake-up {st.nextWakeAt ? fmtTime(st.nextWakeAt) : '—'}
        </Body>
      </Card>

      {allGood ? <Notice tone="good">Everything needed for reliable reminders is set up.</Notice> : null}

      <Card>
        <Label>Setup checklist</Label>
        <Check ok={c.notificationsEnabled} label="Notifications allowed"
          fix={<Button label="Allow notifications" onPress={askNotifications} />} />
        <Check ok={c.ignoringBatteryOptimizations} label="Battery optimisation off"
          hint="Stops Android from closing the app. Required for 'always in memory'."
          fix={<Button label="Turn off for this app" onPress={() => coach.open('battery_request').then(refresh)} />} />
        <Check ok={c.exactAlarms} label="Exact alarms allowed"
          fix={<Button label="Allow exact alarms" onPress={() => coach.open('exact_alarm').then(refresh)} />} />
        <Check ok={st.serviceRunning} label="Background service running" />
        <Check
          ok={c.stepSensorAvailable ? c.activityPermission : null}
          label="Phone step counter (smart reset)"
          hint={c.stepSensorAvailable ? (st.sensorActive ? 'Active.' : 'Optional.') : 'This phone has no step counter.'}
          fix={c.stepSensorAvailable ? <Button label="Allow physical activity" kind="secondary" onPress={askActivity} /> : undefined}
        />
        <Body color={t.sub} style={styles.small}>
          {c.manufacturer} {c.model} · Android API {c.sdkInt}. Some brands (Huawei, Xiaomi, Oppo, Samsung) also have
          their own "app launch" or "auto-start" setting — set Sedentary Coach to "Manage manually" and allow
          background activity.
        </Body>
        <Button label="Open app settings" kind="secondary" onPress={() => coach.open('app')} style={styles.gapTop} />
      </Card>

      <Card>
        <Label>Huawei Watch GT 7 Pro</Label>
        <Check ok={c.huaweiHealthInstalled} label="Huawei Health installed"
          hint="Huawei Health is what connects the phone to the watch."
          fix={<Button label="Get Huawei Health" onPress={() => coach.open('huawei_health')} />} />
        <Check
          ok={c.bluetoothPermission ? watchNames.length > 0 : null}
          label={watchNames.length ? `Paired: ${watchNames.join(', ')}` : 'Paired watch'}
          hint={
            !c.bluetoothPermission
              ? 'Allow "Nearby devices" to check which watch is paired.'
              : c.bluetoothOn === false
                ? 'Bluetooth is off.'
                : watchNames.length
                  ? 'Bluetooth pairing found. This shows the link only, not data sync.'
                  : 'No paired watch found. Pair it in the Huawei Health app.'
          }
          fix={!c.bluetoothPermission ? <Button label="Allow nearby devices" kind="secondary" onPress={askBluetooth} /> : undefined}
        />
        <Check
          ok={c.directWatchLink}
          label="Direct watch link"
          hint="Not available: Huawei only allows direct phone-to-watch messaging for apps approved for its Wear Engine programme. Reminders reach the watch through Huawei Health notification mirroring instead."
        />
      </Card>

      <Card>
        <Label>Get reminders on your watch</Label>
        <Body>1. Open Huawei Health → Devices → your GT 7 Pro → Notifications.</Body>
        <Body>2. Turn notifications on and switch on “Sedentary Coach”.</Body>
        <Body>3. On the phone, keep notifications for this app allowed (lock screen too).</Body>
        <Body>4. Tap “Send test” — the reminder should vibrate on your wrist.</Body>
        <Body color={t.sub} style={styles.small}>
          Watch buttons depend on Huawei Health; if they don't appear, tap “I moved” on the phone or the status
          notification. Mirroring often pauses while the phone screen is on and unlocked.
        </Body>
        <View style={[styles.row, styles.gapTop]}>
          <Button label="Open Huawei Health" kind="secondary" onPress={() => coach.open('huawei_health')} style={styles.flex} />
          <Button label="Send test" onPress={() => coach.sendTest()} style={styles.flex} />
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pad: { padding: 16, paddingBottom: 32 },
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: 8 },
  small: { fontSize: 13, marginTop: 8 },
  gapTop: { marginTop: 12 },
  check: { flexDirection: 'row', paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, gap: 12 },
  mark: { fontSize: 18, fontWeight: '800', width: 20, textAlign: 'center' },
  checkLabel: { fontSize: 15, fontWeight: '600' },
  hint: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  fix: { marginTop: 8, alignSelf: 'flex-start' },
});
