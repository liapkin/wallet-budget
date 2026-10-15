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
