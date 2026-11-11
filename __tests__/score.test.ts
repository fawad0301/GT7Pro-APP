import { consistencyScore } from '../src/services/score';
import type { DaySummary, Settings } from '../src/native/coach';

const settings: Settings = {
  activeStartMin: 540, activeEndMin: 1020, activeDays: 31, movementIntervalMin: 45,
  waterEnabled: true, waterIntervalMin: 60, waterStartMin: 540, waterEndMin: 1020,
  waterDailyTarget: 8, snoozeMin: 10, followUpEnabled: true, followUpDelayMin: 10,
  smartResetEnabled: true, smartResetSteps: 50, focusDefaultMin: 60,
};
const day = (p: Partial<DaySummary>): DaySummary => ({
  date: '2026-11-11', movementDue: 0, movementDone: 0, movementMissed: 0, movementSkipped: 0,
  snoozes: 0, waterDue: 0, waterDone: 0, breaksDetected: 0, followUps: 0, phoneSteps: 0,
  autoDone: 0, focusSessions: 0, ...p,
});

test('no activity gives no score', () => {
  expect(consistencyScore(day({}), settings)).toBeNull();
});
test('all moves done and water target met is 100', () => {
  expect(consistencyScore(day({ movementDue: 8, movementDone: 8, waterDue: 8, waterDone: 8 }), settings)).toBe(100);
});
test('half missed, no water', () => {
  expect(consistencyScore(day({ movementDue: 8, movementDone: 4, movementMissed: 4, waterDue: 8 }), settings)).toBe(40);
});
test('pre-emptive auto breaks count as success; auto-done is not double counted', () => {
  // 2 breaks detected, 1 of them answered a pending reminder (autoDone, also in movementDone)
  expect(consistencyScore(day({ movementDone: 1, autoDone: 1, breaksDetected: 2, movementMissed: 2 }), { ...settings, waterEnabled: false })).toBe(50);
});
test('extra snoozes are penalised and capped', () => {
  expect(consistencyScore(day({ movementDone: 4, snoozes: 20 }), { ...settings, waterEnabled: false })).toBe(90);
});
