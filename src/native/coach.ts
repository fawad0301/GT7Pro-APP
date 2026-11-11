/**
 * Typed adapter over the native "SedentaryCoach" module. All platform/Huawei-specific behaviour
 * stays behind this file; screens never touch NativeModules directly.
 */
import { NativeModules } from 'react-native';

export type Settings = {
  activeStartMin: number;
  activeEndMin: number;
  activeDays: number; // bit0 = Mon ... bit6 = Sun
  movementIntervalMin: number;
  waterEnabled: boolean;
  waterIntervalMin: number;
  waterStartMin: number;
  waterEndMin: number;
  waterDailyTarget: number;
  snoozeMin: number;
  followUpEnabled: boolean;
  followUpDelayMin: number;
  smartResetEnabled: boolean;
  smartResetSteps: number;
  focusDefaultMin: number;
};

export type Status = {
  now: number;
  today: string;
  inWindow: boolean;
  focusUntil: number;
  pendingSince: number;
  anchorAt: number;
  nextMovementAt: number;
  nextWaterAt: number;
  nextWindowStart: number;
  nextWakeAt: number;
  serviceRunning: boolean;
  serviceEnabled: boolean;
  sensorActive: boolean;
  phoneStepsToday: number;
};

export type DaySummary = {
  date: string;
  movementDue: number;
  movementDone: number;
  movementMissed: number;
  movementSkipped: number;
  snoozes: number;
  waterDue: number;
  waterDone: number;
  breaksDetected: number;
  followUps: number;
  phoneSteps: number;
  autoDone: number;
  focusSessions: number;
};

export type ActivityEvent = {
  id: string;
  ts: number;
  type: string;
  source: string;
  value: number;
};

export type Capabilities = {
  manufacturer: string;
  model: string;
  sdkInt: number;
  notificationsEnabled: boolean;
  exactAlarms: boolean;
  ignoringBatteryOptimizations: boolean;
  stepSensorAvailable: boolean;
  activityPermission: boolean;
  bluetoothPermission: boolean;
  bluetoothOn: boolean | null;
  pairedWatches: { name: string; wearableClass: boolean }[];
  huaweiHealthInstalled: boolean;
  serviceRunning: boolean;
  directWatchLink: boolean;
  checkedAt: number;
};

export type CoachAction = 'movement_done' | 'water_done' | 'snooze' | 'skip' | 'focus_end';
export type SystemScreen =
  | 'battery_request'
  | 'battery_list'
  | 'notifications'
  | 'exact_alarm'
  | 'huawei_health'
  | 'app';

type NativeCoach = {
  getSettings(): Promise<string>;
  saveSettings(json: string): Promise<string>;
  getStatus(): Promise<string>;
  getDays(from: string, to: string): Promise<string>;
  getEvents(date: string): Promise<string>;
  performAction(type: CoachAction): Promise<boolean>;
  startFocus(minutes: number): Promise<boolean>;
  setServiceEnabled(on: boolean): Promise<boolean>;
  sendTestNotification(): Promise<boolean>;
  getCapabilities(): Promise<string>;
  openSystemScreen(kind: SystemScreen): Promise<boolean>;
};

const native: NativeCoach | undefined = NativeModules.SedentaryCoach;

function mod(): NativeCoach {
  if (!native) {
    throw new Error('Sedentary Coach native module is not available in this build.');
  }
  return native;
}

export const coach = {
  getSettings: async (): Promise<Settings> => JSON.parse(await mod().getSettings()),
  saveSettings: async (s: Settings): Promise<Settings> =>
    JSON.parse(await mod().saveSettings(JSON.stringify(s))),
  getStatus: async (): Promise<Status> => JSON.parse(await mod().getStatus()),
  getDays: async (from: string, to: string): Promise<DaySummary[]> =>
    JSON.parse(await mod().getDays(from, to)),
  getEvents: async (date: string): Promise<ActivityEvent[]> =>
    JSON.parse(await mod().getEvents(date)),
  action: (type: CoachAction) => mod().performAction(type),
  startFocus: (minutes: number) => mod().startFocus(minutes),
  setServiceEnabled: (on: boolean) => mod().setServiceEnabled(on),
  sendTest: () => mod().sendTestNotification(),
  getCapabilities: async (): Promise<Capabilities> =>
    JSON.parse(await mod().getCapabilities()),
  open: (kind: SystemScreen) => mod().openSystemScreen(kind),
};
