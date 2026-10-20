import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { canRunSync, nextAlarmAt, sendReminders, SYNC_INTERVAL_MS } from '../src/schedule.ts';
import type { Database } from '../../server/src/runtime.ts';
import type { PushSubscription } from '../src/push.ts';

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

const keys = { publicKey: 'p', privateKey: 'k', subject: 'mailto:o@example.test' };
const habits = [{ id: 'a', name: 'Stretch', note: 'Hold', time: '07:30' }, { id: 'b', name: 'Read', time: '07:30' }];
const setup = () => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE sync_state (key TEXT PRIMARY KEY, value TEXT); CREATE TABLE habit_log (day TEXT, habit TEXT, PRIMARY KEY(day, habit));
    CREATE TABLE push_subscriptions (endpoint TEXT PRIMARY KEY, json TEXT);`);
  for (const endpoint of ['https://ok.test/1', 'https://gone.test/2'])
    sqlite.prepare('INSERT INTO push_subscriptions VALUES (?, ?)').run(endpoint, JSON.stringify({ endpoint, keys: { p256dh: 'x', auth: 'y' } }));
  return { sqlite, db: sqlite as unknown as Database };
};
const t = (iso: string) => Date.parse(iso);

test('reminders: first run only records the check time', async () => {
  const { sqlite, db } = setup();
  const sent: string[] = [];
  await sendReminders(db, habits, keys, t('2026-07-10T04:31:00Z'), async (s) => (sent.push(s.endpoint), 201));
  assert.deepEqual(sent, []);
  assert.deepEqual({ ...sqlite.prepare("SELECT value FROM sync_state WHERE key='reminder_check_at'").get() }, { value: '2026-07-10T04:31:00.000Z' });
});

test('reminders: one push per due habit and subscription, skips done habits, drops gone subscriptions', async () => {
  const { sqlite, db } = setup();
  sqlite.prepare("INSERT INTO sync_state VALUES ('reminder_check_at', '2026-07-10T04:00:00.000Z')").run();
  sqlite.prepare("INSERT INTO habit_log VALUES ('2026-07-10', 'b')").run();
  const sent: { endpoint: string; payload: any }[] = [];
  await sendReminders(db, habits, keys, t('2026-07-10T05:00:00Z'), async (s: PushSubscription, payload) => {
    sent.push({ endpoint: s.endpoint, payload: JSON.parse(payload) });
    return s.endpoint.includes('gone') ? 410 : 201;
  });
  assert.deepEqual(sent.map((x) => x.endpoint), ['https://ok.test/1', 'https://gone.test/2']);
  assert.deepEqual(sent[0].payload, { title: 'Stretch', body: 'Hold', tag: 'a', url: '/habits' });
  assert.deepEqual(sqlite.prepare('SELECT endpoint FROM push_subscriptions').all().map((r) => ({ ...r })), [{ endpoint: 'https://ok.test/1' }]);
  assert.deepEqual({ ...sqlite.prepare("SELECT value FROM sync_state WHERE key='reminder_check_at'").get() }, { value: '2026-07-10T05:00:00.000Z' });
});

test('reminders: no keys or no habits sends nothing but still advances the check', async () => {
  for (const [h, k] of [[habits, undefined], [[], keys]] as const) {
    const { sqlite, db } = setup();
    sqlite.prepare("INSERT INTO sync_state VALUES ('reminder_check_at', '2026-07-10T04:00:00.000Z')").run();
    await sendReminders(db, [...h], k, t('2026-07-10T05:00:00Z'), async () => assert.fail('must not send'));
    assert.deepEqual({ ...sqlite.prepare("SELECT value FROM sync_state WHERE key='reminder_check_at'").get() }, { value: '2026-07-10T05:00:00.000Z' });
  }
});
