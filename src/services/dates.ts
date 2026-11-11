const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);

export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseIso(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function daysAgo(n: number): string {
  return isoDate(addDays(new Date(), -n));
}

export function fmtTime(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtMinutes(min: number): string {
  if (min >= 1440) return '24:00';
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}

export function fmtDuration(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

export function fmtDayLong(iso: string): string {
  const d = parseIso(iso);
  const today = isoDate(new Date());
  if (iso === today) return 'Today';
  if (iso === daysAgo(1)) return 'Yesterday';
  return `${DAY_NAMES[(d.getDay() + 6) % 7]} ${d.getDate()} ${d.toLocaleString('en', {
    month: 'short',
  })}`;
}

/** Monday of the week containing d. */
export function weekStart(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  r.setDate(r.getDate() - ((r.getDay() + 6) % 7));
  return r;
}
