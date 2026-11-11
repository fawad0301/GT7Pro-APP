/**
 * Activity consistency score (0-100). NOT a health or medical measure: it only reflects how
 * consistently reminders were followed. Kept isolated here so the formula can be tuned.
 */
import type { DaySummary, Settings } from '../native/coach';

export const SCORE_VERSION = 1;

const WEIGHTS = { movement: 0.8, water: 0.2 };
const SNOOZE_FREE = 2; // snoozes per day without penalty
const SNOOZE_PENALTY = 2; // points per extra snooze
const SNOOZE_PENALTY_CAP = 10;

export function consistencyScore(d: DaySummary, s: Settings): number | null {
  // Breaks the phone detected before a reminder was due count as successes too.
  const preemptiveBreaks = Math.max(0, d.breaksDetected - d.autoDone);
  const successes = d.movementDone + preemptiveBreaks;
  const opportunities = successes + d.movementMissed + 0.5 * d.movementSkipped;
  const movement = opportunities > 0 ? successes / opportunities : null;

  const water =
    s.waterEnabled && (d.waterDue > 0 || d.waterDone > 0)
      ? Math.min(d.waterDone / Math.max(1, s.waterDailyTarget), 1)
      : null;

  let weight = 0;
  let total = 0;
  if (movement !== null) {
    total += WEIGHTS.movement * movement;
    weight += WEIGHTS.movement;
  }
  if (water !== null) {
    total += WEIGHTS.water * water;
    weight += WEIGHTS.water;
  }
  if (weight === 0) return null;

  const penalty = Math.min(
    Math.max(0, d.snoozes - SNOOZE_FREE) * SNOOZE_PENALTY,
    SNOOZE_PENALTY_CAP,
  );
  return Math.max(0, Math.min(100, Math.round((total / weight) * 100 - penalty)));
}

export function scoreLabel(score: number | null): string {
  if (score === null) return 'No data yet';
  if (score >= 85) return 'Very consistent';
  if (score >= 65) return 'Consistent';
  if (score >= 40) return 'Getting there';
  return 'Room to improve';
}
