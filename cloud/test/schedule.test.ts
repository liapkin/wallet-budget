import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canRunSync, nextAlarmAt, SYNC_INTERVAL_MS } from '../src/schedule.ts';

test('finished and failed jobs re-arm one hour out, never sooner', () => {
  for (const status of ['succeeded', 'failed', 'idle'] as const) assert.equal(nextAlarmAt({ status }, 1_000), 1_000 + SYNC_INTERVAL_MS);
});

test('running jobs keep Retry-After, else step again in 1s', () => {
  assert.equal(nextAlarmAt({ status: 'running', nextRetryAt: new Date(9_000).toISOString() }, 1_000), 9_000);
  assert.equal(nextAlarmAt({ status: 'running', nextRetryAt: new Date(500).toISOString() }, 1_000), 1_000);
  assert.equal(nextAlarmAt({ status: 'running' }, 1_000), 2_000);
  assert.equal(nextAlarmAt({ status: 'running', nextRetryAt: 'junk' }, 1_000), 2_000);
});

test('sync runs only when finalized and migration and recovery are off', () => {
  assert.equal(canRunSync({ ready: true, migrationEnabled: false, recoveryEnabled: false }), true);
  assert.equal(canRunSync({ ready: false, migrationEnabled: false, recoveryEnabled: false }), false);
  assert.equal(canRunSync({ ready: true, migrationEnabled: true, recoveryEnabled: false }), false);
  assert.equal(canRunSync({ ready: true, migrationEnabled: false, recoveryEnabled: true }), false);
});
