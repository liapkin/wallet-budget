import { athensDay, athensLocalToUtc } from './month.ts';
import type { Habit } from './types.ts';

// ms of the habit's reminder on an Athens calendar day (y, m, d)
const at = (time: string, y: number, m: number, d: number): number => {
  const [h, mi] = time.split(':').map(Number);
  return Date.parse(athensLocalToUtc(y, m, d, h, mi, 0));
};
const ymd = (day: string): [number, number, number] => day.split('-').map(Number) as [number, number, number];

/** Habits whose Athens-local reminder today falls in (since, now] and are not done. */
export function dueReminders(habits: Habit[], sinceIso: string, nowIso: string, doneToday: string[]): Habit[] {
  const [y, m, d] = ymd(athensDay(nowIso));
  const since = Date.parse(sinceIso);
  const now = Date.parse(nowIso);
  return habits.filter((h) => {
    if (!h.time || doneToday.includes(h.id)) return false;
    const t = at(h.time, y, m, d);
    return t > since && t <= now;
  });
}

/** Next reminder instant (UTC ms) after now, today or tomorrow in Athens; undefined if no habit has a time. */
export function nextReminderAt(habits: Habit[], nowIso: string): number | undefined {
  const [y, m, d] = ymd(athensDay(nowIso));
  const now = Date.parse(nowIso);
  const times = habits.flatMap((h) => (h.time ? [at(h.time, y, m, d), at(h.time, y, m, d + 1)] : [])).filter((t) => t > now);
  return times.length ? Math.min(...times) : undefined;
}

const prev = (day: string): string => {
  const [y, m, d] = ymd(day);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
};

/** Consecutive done days ending today, or yesterday while today is still open. */
export function streak(doneDays: string[], today: string): number {
  const done = new Set(doneDays);
  let day = done.has(today) ? today : prev(today);
  let n = 0;
  for (; done.has(day); day = prev(day)) n++;
  return n;
}
