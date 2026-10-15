import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DEMO = '1';
process.env.BUDGET_DB = ':memory:';
process.env.WALLET_API_TOKEN = 'fictional-test-token';

test('sync checkpoints pages, respects request budget, and deletes only after complete remote window', async (t) => {
  const { db, getConfig, setConfig } = await import('./db.ts');
  process.env.DEMO = '0';
  const config = getConfig();
  setConfig({ ...config, currency: 'EUR', investing: { ...config.investing, crypto: [], etfs: [] } });
  const now = new Date().toISOString();
  db.prepare("INSERT INTO sync_state (key, value) VALUES ('last_date', ?)").run(now.slice(0, 10));
  const insert = db.prepare(
    `INSERT INTO records (source, ext_id, account, category, amount_cents, type, payment_type, note, payee, date_utc, raw_json)
     VALUES ('api', ?, 'Fixture', 'Other', -100, 'Expenses', 'CASH', '', '', ?, '{}')`,
  );
  insert.run('kept', now);
  insert.run('removed', now);

  let calls = 0;
  let deletionPages = 0;
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    calls++;
    const url = new URL(String(input));
    if (url.pathname.endsWith('/accounts')) return Response.json({ accounts: [] });
    if (url.pathname.endsWith('/categories')) return Response.json({ categories: [] });
    const deletion = !url.searchParams.has('convertTo') && !url.searchParams.has('updatedAt') && url.searchParams.getAll('recordDate').length === 1;
    if (!deletion) return Response.json({ records: [] });
    deletionPages++;
    return deletionPages === 1
      ? Response.json({ records: [{ id: 'kept' }], nextOffset: 200 })
      : Response.json({ records: [] });
  });

  const { beginSync, runSyncStep } = await import('./sync.ts');
  beginSync();
  let job;
  for (let i = 0; i < 30; i++) {
    const before = calls;
    job = await runSyncStep({ maxRequests: 1 });
    assert.ok(calls - before <= 1);
    if (deletionPages === 1) {
      assert.ok(db.prepare("SELECT 1 FROM records WHERE ext_id='removed'").get(), 'first deletion page must not delete');
    }
    if (job.status !== 'running') break;
  }

  assert.equal(job?.status, 'succeeded', job?.error ?? 'sync did not finish');
  assert.ok(db.prepare("SELECT 1 FROM records WHERE ext_id='kept'").get());
  assert.equal(db.prepare("SELECT 1 FROM records WHERE ext_id='removed'").get(), undefined);
});

test('pricing failures are warnings: sync still classifies and succeeds', async (t) => {
  const { db, getConfig, setConfig } = await import('./db.ts');
  process.env.COINMARKETCAP_API_KEY = 'fictional-key';
  const config = getConfig();
  setConfig({ ...config, investing: { ...config.investing, crypto: [{ symbol: 'XYZ', amount: 1, paid: 0 }], etfs: [{ symbol: 'ABC', amount: 1, paid: 0 }] } });
  db.prepare(
    `INSERT INTO records (source, ext_id, account, category, amount_cents, type, payment_type, note, payee, date_utc, raw_json)
     VALUES ('api', 'unclassified', 'Fixture', 'Other', -100, 'Expenses', 'CASH', '', '', ?, '{}')`,
  ).run(new Date().toISOString());
  const errors = t.mock.method(console, 'error', () => undefined);
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const { hostname, pathname } = new URL(String(input));
    if (hostname.includes('coinmarketcap')) return new Response('no', { status: 429, statusText: 'Too Many' });
    if (pathname.endsWith('/accounts')) return Response.json({ accounts: [] });
    if (pathname.endsWith('/categories')) return Response.json({ categories: [] });
    if (pathname.endsWith('/records')) return Response.json({ records: [] });
    return new Response('no', { status: 500 });
  });

  const { beginSync, runSyncStep } = await import('./sync.ts');
  beginSync();
  let job;
  for (let i = 0; i < 40; i++) {
    job = await runSyncStep({ maxRequests: 20 });
    if (job.status !== 'running') break;
  }

  assert.equal(job?.status, 'succeeded', job?.error ?? 'sync did not finish');
  assert.equal(job?.warnings?.length, 2);
  assert.match(job!.warnings![0], /^crypto prices failed: /);
  assert.match(job!.warnings![1], /^etf prices failed: /);
  assert.equal(errors.mock.calls.length, 2);
  assert.ok((db.prepare("SELECT month FROM records WHERE ext_id='unclassified'").get() as { month: string | null }).month, 'record classified');
  db.close();
});
