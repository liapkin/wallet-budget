import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import seed from '../../config/seed-config.example.json' with { type: 'json' };
import { seedToConfig } from '../../shared/src/seed.ts';
import { initializeSchema } from '../../server/src/db.ts';
import type { Database, Statement } from '../../server/src/runtime.ts';
import { loadMigrationSource, uploadMigration } from '../src/migration-source.ts';
import { TABLES, type TableName } from '../src/migration.ts';
import { readWrangler } from './wrangler-config.ts';

// Rehearsal of the real migration path (synthetic data only) on workerd with persisted Durable Object storage.
const cfg = readWrangler();
const issuer = 'https://budget-test.cloudflareaccess.com';
const vars = { ACCESS_TEAM_DOMAIN: issuer, ACCESS_AUD: 'app-audience', OWNER_EMAIL: 'owner@example.test' };
const enc = (v: unknown): string => Buffer.from(JSON.stringify(v)).toString('base64url');
const tmp = mkdtempSync(join(tmpdir(), 'cloud-rtm-'));
const instances = new Set<Miniflare>();
const RECORDS = 6000;
const CHUNK = 100;
let script = '';
let skip: string | false = false;
let pair: CryptoKeyPair;
let jwk: JsonWebKey;
let sourcePath = '';
const timings: string[] = [];
let bytes = 0;
let maxRequest = 0;

const sign = async (): Promise<string> => {
  const now = Math.floor(Date.now() / 1000);
  const head = enc({ alg: 'RS256', kid: 'k1', typ: 'JWT' });
  const body = enc({ iss: issuer, aud: ['app-audience'], email: vars.OWNER_EMAIL, type: 'app', nbf: now - 60, exp: now + 3600 });
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${Buffer.from(sig).toString('base64url')}`;
};

const start = (persist: string, extra: Record<string, string>): Miniflare => {
  const options = convertV4MiniflareOptions({ workers: [{
    name: 'worker',
    modules: true,
    scriptPath: script,
    modulesRoot: join(tmp, 'out'),
    compatibilityDate: cfg.compatibility_date,
    compatibilityFlags: cfg.compatibility_flags,
    bindings: { ...vars, ...cfg.vars, ...extra },
    durableObjects: { BUDGET: { className: 'BudgetObject', useSQLite: true } },
    outboundService: () => Response.json({ keys: [{ ...jwk, kid: 'k1', alg: 'RS256', use: 'sig' }] }) as never,
  }] });
  const mf = new Miniflare({ ...options, resourcePersistencePath: persist } as never);
  instances.add(mf);
  return mf;
};
const stop = async (mf: Miniflare) => { instances.delete(mf); await mf.dispose(); };
const prodVars = (migration: '0' | '1') => ({ MIGRATION_ENABLED: migration, RECOVERY_ENABLED: '0' });

const call = async (mf: Miniflare, path: string, body?: unknown) =>
  mf.dispatchFetch(`http://localhost${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'cf-access-jwt-assertion': await sign(), origin: 'http://localhost', 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

// Same post contract as scripts/cloud-migrate.mjs: throw on non-ok, return parsed JSON.
const poster = (mf: Miniflare, stopAfterChunks = Infinity) => {
  let chunks = 0;
  return async (path: string, body?: unknown): Promise<unknown> => {
    if (path.endsWith('/chunk') && ++chunks > stopAfterChunks) throw new Error('simulated interruption');
    const size = body === undefined ? 0 : Buffer.byteLength(JSON.stringify(body));
    bytes += size;
    maxRequest = Math.max(maxRequest, size);
    const r = await call(mf, path, body);
    if (!r.ok) throw new Error(`migration request failed (${r.status})`);
    return r.json();
  };
};

const exported = async (mf: Miniflare) => (await (await call(mf, '/__cloud/export')).json() as { tables: Record<TableName, unknown[]> }).tables;
const counts = (t: Record<string, unknown[]>) => Object.fromEntries(Object.keys(TABLES).map((k) => [k, t[k].length]));

const timed = async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
  const t0 = performance.now();
  try { return await fn(); } finally { timings.push(`${label}: ${Math.round(performance.now() - t0)}ms`); }
};

function buildSource(path: string): void {
  const sqlite = new DatabaseSync(path);
  const db: Database = {
    prepare: (sql) => sqlite.prepare(sql) as Statement,
    exec: (sql) => sqlite.exec(sql),
    transaction: (fn) => { sqlite.exec('BEGIN'); try { const r = fn(); sqlite.exec('COMMIT'); return r; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } },
  };
  initializeSchema(db, seedToConfig(seed as Parameters<typeof seedToConfig>[0]));
  sqlite.exec('BEGIN');
  const rec = sqlite.prepare(`INSERT INTO records (id, source, ext_id, account, category, amount_cents, type, payment_type, note, payee, date_utc, raw_json, month, created_in_app)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0)`);
  const pad = 'x'.repeat(1400);
  for (let i = 1; i <= RECORDS; i++) {
    const month = `2026-${String((i % 12) + 1).padStart(2, '0')}`;
    rec.run(i, 'wallet', `ext-${i}`, `acc-${i % 4}`, `cat-${i % 9}`, -((i * 37) % 9000) - 1, 'expense', 'card', `invented note ${i}`, 'TEST PAYEE',
      `${month}-15T10:00:00Z`, JSON.stringify({ id: `ext-${i}`, note: `invented note ${i}`, pad }), month);
  }
  for (let a = 0; a < 4; a++) sqlite.prepare('INSERT INTO accounts VALUES (?,?,?,?,?)').run(`acc-${a}`, `Account ${a}`, a * 10000, 'EUR', '2026-01-01T00:00:00Z');
  for (let c = 0; c < 9; c++) sqlite.prepare('INSERT INTO categories VALUES (?,?,?)').run(`cat-${c}`, `Category ${c}`, null);
  for (let m = 1; m <= 12; m++) {
    const month = `2026-${String(m).padStart(2, '0')}`;
    sqlite.prepare('INSERT INTO month_close VALUES (?,?)').run(month, JSON.stringify({ closed: true }));
    sqlite.prepare('INSERT INTO core_actuals VALUES (?,?,?)').run(month, 'rent', 50000);
    for (let a = 0; a < 4; a++) sqlite.prepare('INSERT INTO balance_snapshots VALUES (?,?,?)').run(`${month}-01`, `acc-${a}`, 1000 * m);
    sqlite.prepare('INSERT INTO crypto_snapshots (ts, symbol, amount, price_cents, pct24h, kind) VALUES (?,?,?,?,?,?)').run(`${month}-01T00:00:00Z`, 'TST', 1.5, 12345, 0.5, 'crypto');
  }
  sqlite.prepare('INSERT INTO sync_state VALUES (?,?)').run('last_sync', '2026-01-01T00:00:00Z');
  sqlite.exec('COMMIT');
  sqlite.close();
}

before(async () => {
  try {
    pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
    jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
    const conf = join(tmp, 'wrangler.json');
    writeFileSync(conf, JSON.stringify({
      name: 'rtm', main: new URL('../src/worker.ts', import.meta.url).pathname,
      compatibility_date: cfg.compatibility_date, compatibility_flags: cfg.compatibility_flags,
      alias: Object.fromEntries(Object.entries(cfg.alias as Record<string, string>).map(([k, v]) => [k, new URL(`../${v}`, import.meta.url).pathname])),
      durable_objects: cfg.durable_objects, migrations: cfg.migrations,
    }));
    execFileSync('pnpm', ['exec', 'wrangler', 'deploy', '--dry-run', '--config', conf, '--outdir', join(tmp, 'out')], { cwd: new URL('..', import.meta.url).pathname, stdio: 'pipe', env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } });
    script = join(tmp, 'out', readdirSync(join(tmp, 'out')).find((f) => f.endsWith('.js'))!);
    const probeDir = join(tmp, 'probe');
    mkdirSync(probeDir);
    await start(probeDir, { PREVIEW_SEED: '1' }).ready;
    sourcePath = join(tmp, 'source.db');
    buildSource(sourcePath);
  } catch (e) {
    skip = `workerd/bundle unavailable: ${(e as Error).message.slice(0, 400)}`;
  }
});

after(async () => {
  await Promise.all([...instances].map((m) => m.dispose()));
  console.log(`rehearsal timings: ${timings.join('; ')}; uploaded ${bytes} bytes, largest request ${maxRequest} bytes`);
  rmSync(tmp, { recursive: true, force: true });
});

test('migration rehearsal on workerd', { timeout: 900_000 }, async (t) => {
  if (skip) return t.skip(skip);
  const data = loadMigrationSource(sourcePath);
  const expected = Object.fromEntries(Object.keys(TABLES).map((k) => [k, data[k as TableName].length]));
  assert.equal(expected.records, RECORDS);
  const persist = join(tmp, 'persist-main');
  mkdirSync(persist);
  let before: Record<string, unknown[]>;

  await t.test('a) empty production serves 503, full upload finalizes with matching counts', async () => {
    const mf = start(persist, prodVars('1'));
    assert.equal((await call(mf, '/api/meta')).status, 503);
    await timed('a upload', () => uploadMigration(data, poster(mf), CHUNK));
    before = await exported(mf);
    assert.deepEqual(counts(before), expected);
    assert.equal(new Set((before.records as { id: number }[]).map((r) => r.id)).size, RECORDS);
    await stop(mf);
  });

  await t.test('b) after restart with migration disabled the app serves data and __cloud is closed', async () => {
    const mf = start(persist, prodVars('0'));
    const r = await timed('b first request', () => call(mf, '/api/meta'));
    assert.equal(r.status, 200);
    assert.ok(Object.keys(await r.json() as object).length > 0);
    assert.equal((await call(mf, '/api/config')).status, 200);
    assert.equal((await call(mf, '/__cloud/export')).status, 404);
    assert.equal((await call(mf, '/__cloud/migration/start', { version: 1, manifest: expected })).status, 404);
    await stop(mf);
  });

  await t.test('c) second migration into non-empty store is refused and data unchanged', async () => {
    const mf = start(persist, prodVars('1'));
    // migration state is finalized, so start returns it; chunks are refused as inactive
    const post = poster(mf);
    await assert.rejects(() => uploadMigration(data, post, CHUNK), /\(409\)/);
    const r = await call(mf, '/__cloud/migration/chunk', { table: 'config', offset: 0, rows: data.config });
    assert.equal(r.status, 409);
    assert.deepEqual(await exported(mf), before);
    await stop(mf);
  });

  await t.test('d) interrupted upload resumes by rerunning the same upload', async () => {
    const dir = join(tmp, 'persist-resume');
    mkdirSync(dir);
    let mf = start(dir, prodVars('1'));
    const total = Math.ceil(RECORDS / CHUNK);
    await assert.rejects(() => uploadMigration(data, poster(mf, Math.floor(total / 2)), CHUNK), /simulated interruption/);
    await stop(mf);
    mf = start(dir, prodVars('1'));
    const status = await (await call(mf, '/__cloud/migration/status')).json() as { finalized: boolean; received: Record<string, number> };
    assert.equal(status.finalized, false);
    assert.equal(status.received.records, Math.floor(total / 2) * CHUNK);
    await timed('d resume upload', () => uploadMigration(data, poster(mf), CHUNK));
    const after = await exported(mf);
    assert.deepEqual(counts(after), expected);
    assert.equal(new Set((after.records as { id: number }[]).map((r) => r.id)).size, RECORDS);
    assert.deepEqual(after, before);
    await stop(mf);
  });
});
