import type { SyncJob } from '../../shared/src/sync-job.ts';

export const SYNC_INTERVAL_MS = 3_600_000;

/** Running jobs resume at Retry-After else in 1s; finished or failed jobs wait for the hourly mark. */
export const nextAlarmAt = (job: Pick<SyncJob, 'status' | 'nextRetryAt'>, now: number): number => {
  if (job.status !== 'running') return now + SYNC_INTERVAL_MS;
  const retry = job.nextRetryAt ? Date.parse(job.nextRetryAt) : NaN;
  return Number.isFinite(retry) ? Math.max(retry, now) : now + 1_000;
};

export const canRunSync = (state: { ready: boolean; migrationEnabled: boolean; recoveryEnabled: boolean }): boolean =>
  state.ready && !state.migrationEnabled && !state.recoveryEnabled;
