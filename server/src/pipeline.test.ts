import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.BUDGET_DB = ':memory:';
const { db } = await import('./db.ts');
const { runPipeline } = await import('./pipeline.ts');

const ins = db.prepare(
  "INSERT INTO records (id, source, ext_id, account, category, amount_cents, type, payment_type, note, date_utc) VALUES (?, 'api', ?, ?, 'x', -1000, 'Expenses', ?, 'n', ?)",
);
const state = () => db.prepare('SELECT id, is_dup AS d, dup_of AS o FROM records ORDER BY id').all().map((r: any) => [r.id, r.d, r.o]);

test('confirmed dup pair keeps the TRANSFER record, else the later one; "not" changes nothing', () => {
  ins.run(1, 'e1', 'A', 'CASH', '2026-03-01T10:00:00Z');
  ins.run(2, 'e2', 'B', 'TRANSFER', '2026-03-01T09:00:00Z');
  ins.run(3, 'e3', 'A', 'CASH', '2026-03-02T10:00:00Z');
  ins.run(4, 'e4', 'B', 'CASH', '2026-03-03T10:00:00Z');
  runPipeline();
  assert.deepEqual(state(), [[1, 0, null], [2, 0, null], [3, 0, null], [4, 0, null]]);

  db.prepare("INSERT INTO dup_decisions VALUES (1, 2, 'dup'), (3, 4, 'dup')").run();
  runPipeline();
  assert.deepEqual(state(), [[1, 1, 2], [2, 0, null], [3, 1, 4], [4, 0, null]]);

  db.exec("UPDATE dup_decisions SET decision='not'");
  runPipeline();
  assert.deepEqual(state(), [[1, 0, null], [2, 0, null], [3, 0, null], [4, 0, null]]);
});
