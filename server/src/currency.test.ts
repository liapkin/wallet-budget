import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import XLSX from 'xlsx';

test('database currency stays consistent and Wallet remains EUR-only', async (t) => {
  process.env.DEMO = '1';
  process.env.BUDGET_DB = ':memory:';
  delete process.env.WALLET_API_TOKEN;
  t.mock.method(process, 'loadEnvFile', () => { throw new Error('tests must not read .env'); });
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    requests++;
    throw new Error('tests must not contact Wallet');
  });
  const { db, getConfig, setConfig, currencyLocked } = await import('./db.ts');
  const { updateConfig, createRecord, getMeta } = await import('./main.ts');
  const { get, post } = await import('./wallet.ts');
  const { sync, insertApiRecord } = await import('./sync.ts');
  const { importFile } = await import('./import.ts');
  const fixture = mkdtempSync(join(tmpdir(), 'budget-currency-'));
  t.after(() => { db.close(); rmSync(fixture, { recursive: true, force: true }); });
  process.env.DEMO = '0'; // Modules loaded in demo mode, so personal seed and .env were never read.

  const legacy = getConfig();
  delete legacy.currency;
  db.prepare('UPDATE config SET json=? WHERE id=1').run(JSON.stringify(legacy));
  assert.equal(getConfig().currency, 'EUR');
  const before = getConfig();
  setConfig({ ...before, currency: 'USD' });
  assert.deepEqual(getConfig(), { ...before, currency: 'USD' });
  assert.equal(currencyLocked(), false);
  for (const currency of [null, '', 'JPY'])
    assert.throws(() => setConfig({ ...getConfig(), currency } as any), /currency must be EUR or USD/);
  const withoutCurrency = getConfig();
  delete withoutCurrency.currency;
  updateConfig({ body: withoutCurrency } as any, { json() {} } as any);
  assert.equal(getConfig().currency, 'USD');

  for (const [table, sql] of [
    ['records', "INSERT INTO records (source, ext_id, amount_cents) VALUES ('manual', 'fixture', -100)"],
    ['core_actuals', "INSERT INTO core_actuals VALUES ('2026-01', 'rent', 100)"],
    ['accounts', "INSERT INTO accounts (id, name, balance_cents, currency) VALUES ('fixture', 'Fixture', 100, 'USD')"],
  ]) {
    db.exec(sql);
    assert.equal(currencyLocked(), true, table);
    assert.throws(() => setConfig({ ...getConfig(), currency: 'EUR' }), /Database currency cannot change/);
    assert.equal(getConfig().currency, 'USD');
    db.exec(`DELETE FROM ${table}`);
  }

  await assert.rejects(get('/v1/api/accounts'), /EUR databases only/);
  await assert.rejects(post('/v1/api/records', []), /EUR databases only/);
  await assert.rejects(sync(), /EUR databases only/);
  assert.throws(() => insertApiRecord({}), /EUR databases only/);
  assert.throws(() => importFile(join(fixture, 'missing.xls')), /EUR databases only/);
  assert.equal(requests, 0);

  let record: any;
  await createRecord({ body: { date: '2026-01-15T12:00', amount: 12.34, note: 'Fictional purchase' } } as any,
    { status() { return this; }, json(body: any) { record = body; } } as any);
  assert.equal(record.amountCents, -1234);
  assert.equal(getMeta().currency, 'USD');
  assert.equal(currencyLocked(), true);
  db.exec('DELETE FROM records');
  setConfig({ ...getConfig(), currency: 'EUR' });

  const row = { account: 'Fixture', category: 'Groceries', currency: 'EUR', amount: -12.34,
    type: 'Expenses', payment_type: 'CASH', note: 'Fictional purchase', date: 46000 };
  const file = join(fixture, 'mixed.xls');
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet([row, { ...row, currency: 'USD' }]), 'Records');
  XLSX.writeFile(book, file);
  assert.throws(() => importFile(file), /only EUR records/);
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM records').get() as { n: number }).n, 0);
  assert.equal(currencyLocked(), false);

  process.env.WALLET_API_TOKEN = 'fictional-test-token';
  t.mock.method(console, 'error', () => {});
  t.mock.method(globalThis, 'fetch', async () => {
    requests++;
    setConfig({ ...getConfig(), currency: 'USD' });
    return requests === 1
      ? new Response('{}', { status: 429, headers: { 'retry-after': '0.001' } })
      : new Response('{}');
  });
  await assert.rejects(get('/v1/api/accounts'), /EUR databases only/);
  assert.equal(requests, 1);
});
