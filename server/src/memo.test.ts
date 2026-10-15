import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.BUDGET_DB = ':memory:';
process.env.DEMO = '1';

test('memo caches, db writes invalidate, cap evicts, day key changes', async () => {
  const { memo, bumpVersion } = await import('./memo.ts');
  const { db } = await import('./db.ts');
  let n = 0;
  const f = () => ++n;
  assert.equal(memo('a', f), 1);
  assert.equal(memo('a', f), 1);
  db.prepare('UPDATE sync_state SET value=1').run(); // no rows needed: any run() bumps
  assert.equal(memo('a', f), 2);
  db.exec('SELECT 1');
  assert.equal(memo('a', f), 3);
  db.transaction(() => 0);
  assert.equal(memo('a', f), 4);
  db.prepare('SELECT 1').get();
  assert.equal(memo('a', f), 4, 'reads do not invalidate');

  bumpVersion();
  let calls = 0;
  for (let i = 0; i < 70; i++) memo(`k${i}`, () => ++calls);
  memo('k69', () => ++calls);
  assert.equal(calls, 70);
  memo('k0', () => ++calls); // evicted
  assert.equal(calls, 71);

  let day = '2026-01-01';
  const timed = () => memo(`t:${day}`, () => ++calls);
  const first = timed();
  assert.equal(timed(), first);
  day = '2026-01-02';
  assert.notEqual(timed(), first);
});

test('indexes serve month list, deletions scan and unclassified queries', async () => {
  const { db } = await import('./db.ts');
  const ins = db.prepare(`INSERT INTO records (source, ext_id, account, category, amount_cents, type, payment_type, note, payee, date_utc, raw_json, grp, month)
    VALUES ('api', ?, 'A', 'c', -100, 'Expenses', 'CASH', '', '', ?, '{}', ?, ?)`);
  for (let i = 0; i < 200; i++) ins.run(`e${i}`, `2026-0${1 + (i % 9)}-05T10:00:00Z`, i % 5 ? 'Food' : 'Other', `2026-0${1 + (i % 9)}`);
  const plan = (sql: string, ...a: unknown[]) =>
    (db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...a) as { detail: string }[]).map((r) => r.detail).join('\n');
  const q = [
    "SELECT * FROM records WHERE source IN ('api','manual') AND month=? ORDER BY date_utc DESC, id DESC",
    "SELECT ext_id FROM records WHERE source='api' AND date_utc >= ?",
    "SELECT * FROM records WHERE grp='Other'",
  ];
  const arg = ['2026-03', '2026-02-01', undefined];
  q.forEach((sql, i) => assert.doesNotMatch(plan(sql, ...(arg[i] ? [arg[i]] : [])), /SCAN records\b(?! USING)/, sql));
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM records WHERE grp='Other'").get() as { n: number }).n, 40);
});
