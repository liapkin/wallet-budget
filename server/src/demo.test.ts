import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { seedToConfig } from '../../shared/src/seed.ts';

const root = join(import.meta.dirname, '..', '..');

test('demo stays local, tokenless and example-configured', async () => {
  process.env.DEMO = '1';
  process.env.BUDGET_DB = ':memory:';
  delete process.env.WALLET_API_TOKEN;

  const originalFetch = globalThis.fetch;
  let externalCalls = 0;
  globalThis.fetch = async () => {
    externalCalls++;
    throw new Error('unexpected external request');
  };

  const { createRecord, getMeta } = await import('./main.ts');
  const { db, getConfig, resolveDatabasePath } = await import('./db.ts');
  const { sync } = await import('./sync.ts');
  const { post } = await import('./wallet.ts');
  const response = () => {
    const state: { status: number; body?: any } = { status: 200 };
    const res = {
      status(code: number) { state.status = code; return this; },
      json(body: any) { state.body = body; return this; },
    };
    return { state, res };
  };

  try {
    assert.equal(process.env.WALLET_API_TOKEN, undefined);
    assert.equal(resolveDatabasePath({ DEMO: '1' }), resolve(root, 'data/demo.db'));
    assert.equal(resolveDatabasePath({}), resolve(root, 'data/budget.db'));
    assert.equal(resolveDatabasePath({ DEMO: '1', BUDGET_DB: ':memory:' }), ':memory:');
    assert.throws(() => resolveDatabasePath({ DEMO: '1', BUDGET_DB: 'data/other.db' }), /refuses/);
    assert.throws(() => resolveDatabasePath({ DEMO: '1', BUDGET_DB: 'data/../data/budget.db' }), /refuses/);
    assert.throws(() => resolveDatabasePath({ DEMO: '1', BUDGET_DB: resolve(root, 'data/budget.db') }), /refuses/);

    const expected = seedToConfig(JSON.parse(readFileSync(join(root, 'config', 'seed-config.example.json'), 'utf8')));
    assert.deepEqual(getConfig(), expected);

    assert.equal(getMeta().demo, true);
    await assert.rejects(sync(), /Disabled in demo mode/);
    await assert.rejects(post('/v1/api/records', []), /Disabled in demo mode/);

    await assert.rejects(createRecord({ body: { date: '2026-01-15T12:00', amount: 10, note: 'Local', toWallet: true } } as any, response().res as any), /Disabled in demo mode/);
    const local = response();
    await createRecord({ body: { date: '2026-01-15T12:00', amount: 10, note: 'Local' } } as any, local.res as any);
    assert.equal(local.state.status, 201);
    assert.equal(local.state.body.source, 'manual');
    assert.equal(externalCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});

test('demo generator makes 18 months with duplicates and unclassified records', (t) => {
  const fixture = mkdtempSync(join(tmpdir(), 'budget-demo-'));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  mkdirSync(join(fixture, 'server'), { recursive: true });
  mkdirSync(join(fixture, 'server', 'src'), { recursive: true });
  mkdirSync(join(fixture, 'shared', 'src'), { recursive: true });
  mkdirSync(join(fixture, 'config'), { recursive: true });
  for (const file of ['demo.ts', 'db.ts', 'pipeline.ts'])
    cpSync(join(root, 'server', 'src', file), join(fixture, 'server', 'src', file));
  for (const file of ['seed.ts', 'money.ts', 'types.ts', 'month.ts', 'dedupe.ts', 'classify.ts', 'summary.ts'])
    cpSync(join(root, 'shared', 'src', file), join(fixture, 'shared', 'src', file));
  cpSync(join(root, 'config', 'seed-config.example.json'), join(fixture, 'config', 'seed-config.example.json'));

  const env = { ...process.env };
  delete env.BUDGET_DB;
  delete env.DEMO;
  delete env.WALLET_API_TOKEN;
  const result = spawnSync(process.execPath, [join(fixture, 'server', 'src', 'demo.ts')], {
    cwd: fixture, env, encoding: 'utf8', timeout: 30_000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const db = new DatabaseSync(join(fixture, 'data', 'demo.db'));
  const counts = db.prepare("SELECT COUNT(DISTINCT month) AS months, SUM(is_dup) AS duplicates, SUM(grp='Other') AS unclassified FROM records").get() as {
    months: number; duplicates: number; unclassified: number;
  };
  db.close();
  assert.equal(counts.months, 18);
  assert.ok(counts.duplicates > 0);
  assert.ok(counts.unclassified > 0);
});
