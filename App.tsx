/**
 * Sedentary Coach — Android companion for Huawei Watch GT 7 Pro.
 * The reminder engine runs natively in an always-on foreground service; this UI only configures it
 * and shows history.
 */
import React, { useEffect, useState } from 'react';
import {
  BackHandler,
  PermissionsAndroid,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import TodayScreen from './src/screens/TodayScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import TrendsScreen from './src/screens/TrendsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import WatchScreen from './src/screens/WatchScreen';
import { coach } from './src/native/coach';
import { useTheme } from './src/ui/theme';

type Tab = 'today' | 'history' | 'trends' | 'settings' | 'watch';
const TABS: { key: Tab; label: string; glyph: string }[] = [
  { key: 'today', label: 'Today', glyph: '◉' },
  { key: 'history', label: 'History', glyph: '☰' },
  { key: 'trends', label: 'Trends', glyph: '▤' },
  { key: 'settings', label: 'Settings', glyph: '⚙' },
  { key: 'watch', label: 'Watch', glyph: '⌚' },
];
const TITLES: Record<Tab, string> = {
  today: 'Sedentary Coach',
  history: 'History',
  trends: 'Trends',
  settings: 'Settings',
  watch: 'Watch & setup',
};

async function firstRunPermissions() {
  if (Platform.OS !== 'android') return;
  try {
    if (Platform.Version >= 33) {
      await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    }
    if (Platform.Version >= 29) {
      await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION);
    }
    // Start (or restart) the always-on service now that permissions are settled.
    await coach.setServiceEnabled(true);
  } catch {
    // Errors surface on the Watch & setup screen.
  }
}

function Shell() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('today');

  useEffect(() => {
    firstRunPermissions();
  }, []);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (tab !== 'today') {
        setTab('today');
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [tab]);

  return (
    <View style={[styles.root, { backgroundColor: t.bg, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={[styles.headerText, { color: t.text }]}>{TITLES[tab]}</Text>
      </View>
      <View style={styles.flex}>
        {tab === 'today' && <TodayScreen onOpenWatch={() => setTab('watch')} />}
        {tab === 'history' && <HistoryScreen />}
        {tab === 'trends' && <TrendsScreen />}
        {tab === 'settings' && <SettingsScreen />}
        {tab === 'watch' && <WatchScreen />}
      </View>
      <View
        style={[
          styles.tabBar,
          { backgroundColor: t.card, borderColor: t.border, paddingBottom: Math.max(insets.bottom, 6) },
        ]}>
        {TABS.map(x => {
          const on = x.key === tab;
          return (
            <Pressable
              key={x.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={x.label}
              onPress={() => setTab(x.key)}
              style={styles.tab}>
              <Text style={[styles.glyph, { color: on ? t.accent : t.sub }]}>{x.glyph}</Text>
              <Text style={[styles.tabLabel, { color: on ? t.accent : t.sub }]}>{x.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function App() {
  const t = useTheme();
  return (
    <SafeAreaProvider>
      <StatusBar barStyle={t.bg === '#0E1116' ? 'light-content' : 'dark-content'} />
      <Shell />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  header: { paddingHorizontal: 16, paddingVertical: 12 },
  headerText: { fontSize: 26, fontWeight: '800' },
  tabBar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 6 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 52 },
  glyph: { fontSize: 20 },
  tabLabel: { fontSize: 11, fontWeight: '600', marginTop: 2 },
});
