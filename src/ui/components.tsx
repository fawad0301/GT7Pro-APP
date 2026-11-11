import React from 'react';
import {
  Pressable,
  StyleProp,
  StyleSheet,
  Switch,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { useTheme } from './theme';

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }, style]}>
      {children}
    </View>
  );
}

export function Title({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return <Text style={[styles.title, { color: t.text }]}>{children}</Text>;
}

export function Label({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return <Text style={[styles.label, { color: t.sub }]}>{children}</Text>;
}

export function Body({
  children,
  color,
  style,
}: {
  children: React.ReactNode;
  color?: string;
  style?: StyleProp<any>;
}) {
  const t = useTheme();
  return <Text style={[styles.body, { color: color ?? t.text }, style]}>{children}</Text>;
}

export function Button({
  label,
  onPress,
  kind = 'primary',
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const bg = kind === 'primary' ? t.accent : 'transparent';
  const fg = kind === 'primary' ? t.accentText : kind === 'danger' ? t.bad : t.accent;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: bg,
          borderColor: kind === 'primary' ? t.accent : t.border,
          opacity: disabled ? 0.4 : pressed ? 0.75 : 1,
        },
        style,
      ]}>
      <Text style={[styles.buttonText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export function Stat({
  value,
  label,
  color,
}: {
  value: string | number;
  label: string;
  color?: string;
}) {
  const t = useTheme();
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color: color ?? t.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: t.sub }]}>{label}</Text>
    </View>
  );
}

export function Progress({ value, color }: { value: number; color?: string }) {
  const t = useTheme();
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View style={[styles.track, { backgroundColor: t.track }]}>
      <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: color ?? t.accent }]} />
    </View>
  );
}

export function Row({
  label,
  hint,
  right,
}: {
  label: string;
  hint?: string;
  right: React.ReactNode;
}) {
  const t = useTheme();
  return (
    <View style={[styles.row, { borderColor: t.border }]}>
      <View style={styles.rowText}>
        <Text style={[styles.body, { color: t.text }]}>{label}</Text>
        {hint ? <Text style={[styles.hint, { color: t.sub }]}>{hint}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const t = useTheme();
  return (
    <Switch
      value={value}
      onValueChange={onChange}
      trackColor={{ true: t.accent, false: t.track }}
      thumbColor="#FFFFFF"
    />
  );
}

export function Stepper({
  value,
  onChange,
  step,
  min,
  max,
  format,
}: {
  value: number;
  onChange: (v: number) => void;
  step: number;
  min: number;
  max: number;
  format?: (v: number) => string;
}) {
  const t = useTheme();
  const btn = (delta: number, label: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={delta > 0 ? 'Increase' : 'Decrease'}
      onPress={() => onChange(Math.max(min, Math.min(max, value + delta)))}
      style={({ pressed }) => [
        styles.stepBtn,
        { borderColor: t.border, opacity: pressed ? 0.6 : 1 },
      ]}>
      <Text style={[styles.stepBtnText, { color: t.accent }]}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={styles.stepper}>
      {btn(-step, '−')}
      <Text style={[styles.stepValue, { color: t.text }]}>{format ? format(value) : value}</Text>
      {btn(step, '+')}
    </View>
  );
}

export function Chips<T extends string | number>({
  options,
  value,
  onChange,
  format,
}: {
  options: T[];
  value: T;
  onChange: (v: T) => void;
  format?: (v: T) => string;
}) {
  const t = useTheme();
  return (
    <View style={styles.chips}>
      {options.map(o => {
        const on = o === value;
        return (
          <Pressable
            key={String(o)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o)}
            style={[
              styles.chip,
              { borderColor: on ? t.accent : t.border, backgroundColor: on ? t.accent : 'transparent' },
            ]}>
            <Text style={{ color: on ? t.accentText : t.text, fontWeight: '600' }}>
              {format ? format(o) : String(o)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Notice({
  tone,
  children,
}: {
  tone: 'good' | 'warn' | 'bad' | 'info';
  children: React.ReactNode;
}) {
  const t = useTheme();
  const c = tone === 'good' ? t.good : tone === 'warn' ? t.warn : tone === 'bad' ? t.bad : t.accent;
  return (
    <View style={[styles.notice, { borderColor: c }]}>
      <Text style={[styles.body, { color: t.text }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  label: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  body: { fontSize: 15, lineHeight: 21 },
  hint: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  button: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  buttonText: { fontSize: 15, fontWeight: '700' },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 24, fontWeight: '800' },
  statLabel: { fontSize: 12, marginTop: 2, textAlign: 'center' },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  rowText: { flex: 1 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: { fontSize: 22, fontWeight: '700' },
  stepValue: { minWidth: 64, textAlign: 'center', fontSize: 16, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: { borderWidth: 1, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14, minHeight: 40, justifyContent: 'center' },
  notice: { borderLeftWidth: 4, paddingVertical: 8, paddingHorizontal: 12, marginBottom: 12 },
});
