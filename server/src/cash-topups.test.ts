import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.BUDGET_DB = ':memory:';
const { db } = await import('./db.ts');
const { app } = await import('./main.ts');

test('cash top-ups list only ATM withdrawals not paired as a transfer from either side', async () => {
  const day = new Date(Date.now() - 86_400_000).toISOString();
  const ins = db.prepare(
    "INSERT INTO records (id, source, ext_id, account, category, amount_cents, type, payment_type, note, date_utc, grp, is_dup, raw_json) VALUES (?, 'api', ?, ?, 'x', ?, ?, 'TRANSFER', 'ATM 1', ?, ?, 0, ?)",
  );
  const paired = (mirror: string) => JSON.stringify({ transfer: { type: 'paired', mirrorRecord: { id: mirror } } });
  ins.run(1, 'w1', 'Bank', -5000, 'Expenses', day, 'Cash withdrawal', '{}'); // unpaired
  ins.run(2, 'w2', 'Bank', -6000, 'Expenses', day, 'Cash withdrawal', paired('c2')); // paired on bank side
  ins.run(3, 'w3', 'Bank', -7000, 'Expenses', day, 'Cash withdrawal', '{}');
  ins.run(4, 'c3', 'Cash', 7000, 'Income', day, 'Cash withdrawal', paired('w3')); // paired, bank side not synced yet
  ins.run(5, 'w5', 'Bank', -1000, 'Expenses', day, 'Groceries', '{}'); // not a withdrawal
  db.prepare("INSERT INTO accounts (id, name, balance_cents, currency, updated_at) VALUES ('acc-cash', 'Cash', 0, 'EUR', ?)").run(day);

  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  try {
    const { port } = server.address() as { port: number };
    const body = await (await fetch(`http://127.0.0.1:${port}/api/cash-topups`)).json();
    assert.equal(body.cashAccountId, 'acc-cash');
    assert.deepEqual(body.items.map((r: { id: number }) => r.id), [1]);
  } finally {
    server.close();
  }
});

test('records filter by year and reject a malformed year', async () => {
  const ins = db.prepare(
    "INSERT INTO records (id, source, ext_id, account, category, amount_cents, type, payment_type, note, date_utc, grp, month, is_dup, raw_json) VALUES (?, 'api', ?, 'Bank', 'x', -100, 'Expenses', 'Card', 'n', '2020-03-01T00:00:00Z', 'G', ?, 0, '{}')",
  );
  ins.run(901, 'y1', '2020-03');
  ins.run(902, 'y2', '2021-03');
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  try {
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/records`;
    const ids = ((await (await fetch(`${base}?year=2020`)).json()) as { id: number }[]).map((r) => r.id);
    assert.deepEqual(ids, [901]);
    assert.equal((await fetch(`${base}?year=20x`)).status, 400);
  } finally {
    server.close();
  }
});
