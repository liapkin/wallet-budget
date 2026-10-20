import type { SyncJob } from '../../shared/src/sync-job.ts';
import { athensDay } from '../../shared/src/month.ts';
import { dueReminders } from '../../shared/src/habits.ts';
import type { Habit } from '../../shared/src/types.ts';
import type { Database } from '../../server/src/runtime.ts';
import { sendPush, type PushSubscription, type VapidKeys } from './push.ts';

export const SYNC_INTERVAL_MS = 3_600_000;

/** Running jobs resume at Retry-After else in 1s; finished or failed jobs wait for the hourly mark. */
export const nextAlarmAt = (job: Pick<SyncJob, 'status' | 'nextRetryAt'>, now: number): number => {
  if (job.status !== 'running') return now + SYNC_INTERVAL_MS;
  const retry = job.nextRetryAt ? Date.parse(job.nextRetryAt) : NaN;
  return Number.isFinite(retry) ? Math.max(retry, now) : now + 1_000;
};

export const canRunSync = (state: { ready: boolean; migrationEnabled: boolean; recoveryEnabled: boolean }): boolean =>
  state.ready && !state.migrationEnabled && !state.recoveryEnabled;

/**
 * Sends one notification per habit due since the last check, then records the check.
 * The first run only records it, so enabling reminders never replays earlier times.
 * Subscriptions the push service reports gone (404/410) are deleted.
 */
export async function sendReminders(
  db: Database, habits: Habit[], keys: VapidKeys | undefined, now: number, send: typeof sendPush = sendPush,
): Promise<void> {
  const state = db.prepare("SELECT value FROM sync_state WHERE key='reminder_check_at'").get() as { value: string } | undefined;
  db.prepare("INSERT OR REPLACE INTO sync_state (key, value) VALUES ('reminder_check_at', ?)").run(new Date(now).toISOString());
  if (!state || !keys || !habits.length) return;
  const nowIso = new Date(now).toISOString();
  const done = (db.prepare('SELECT habit FROM habit_log WHERE day=?').all(athensDay(nowIso)) as { habit: string }[]).map((r) => r.habit);
  const due = dueReminders(habits, state.value, nowIso, done);
  const subs = (db.prepare('SELECT json FROM push_subscriptions').all() as { json: string }[]).map((r) => JSON.parse(r.json) as PushSubscription);
  for (const habit of due) {
    const payload = JSON.stringify({ title: habit.name, body: habit.note ?? '', tag: habit.id, url: '/habits' });
    for (const sub of subs) {
      const status = await send(sub, payload, keys);
      if (status === 404 || status === 410) db.prepare('DELETE FROM push_subscriptions WHERE endpoint=?').run(sub.endpoint);
    }
  }
}
