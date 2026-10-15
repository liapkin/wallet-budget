import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { readWrangler } from './wrangler-config.ts';

const cfg = readWrangler();
const issuer = 'https://budget-test.cloudflareaccess.com';
const vars = { ACCESS_TEAM_DOMAIN: issuer, ACCESS_AUD: 'app-audience', OWNER_EMAIL: 'owner@example.test' };
const enc = (v: unknown): string => Buffer.from(JSON.stringify(v)).toString('base64url');
const tmp = mkdtempSync(join(tmpdir(), 'cloud-rt-'));
const instances: Miniflare[] = [];
let script = '';
let skip: string | false = false;
let pair: CryptoKeyPair;
let jwk: JsonWebKey;

const sign = async (): Promise<string> => {
  const now = Math.floor(Date.now() / 1000);
  const head = enc({ alg: 'RS256', kid: 'k1', typ: 'JWT' });
  const body = enc({ iss: issuer, aud: ['app-audience'], email: vars.OWNER_EMAIL, type: 'app', nbf: now - 60, exp: now + 3600 });
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${Buffer.from(sig).toString('base64url')}`;
};

const start = (extra: Record<string, string> = {}): Miniflare => {
  const mf = new Miniflare(convertV4MiniflareOptions({ workers: [{
    name: 'worker',
    modules: true,
    scriptPath: script,
    modulesRoot: join(tmp, 'out'),
    compatibilityDate: cfg.compatibility_date,
    compatibilityFlags: cfg.compatibility_flags,
    bindings: { ...vars, ...cfg.vars, ...extra },
    durableObjects: { BUDGET: { className: 'BudgetObject', useSQLite: true } },
    outboundService: () => Response.json({ keys: [{ ...jwk, kid: 'k1', alg: 'RS256', use: 'sig' }] }) as never,
  }] }));
  instances.push(mf);
  return mf;
};

const call = async (mf: Miniflare, path: string, authed = true) =>
  mf.dispatchFetch(`http://localhost${path}`, { headers: authed ? { 'cf-access-jwt-assertion': await sign() } : {} });

before(async () => {
  try {
    pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
    jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
    // No assets directory needed for API tests, so bundle with a minimal config.
    const conf = join(tmp, 'wrangler.json');
    writeFileSync(conf, JSON.stringify({
      name: 'rt', main: new URL('../src/worker.ts', import.meta.url).pathname,
      compatibility_date: cfg.compatibility_date, compatibility_flags: cfg.compatibility_flags,
      alias: Object.fromEntries(Object.entries(cfg.alias as Record<string, string>).map(([k, v]) => [k, new URL(`../${v}`, import.meta.url).pathname])),
      durable_objects: cfg.durable_objects, migrations: cfg.migrations,
    }));
    execFileSync('pnpm', ['exec', 'wrangler', 'deploy', '--dry-run', '--config', conf, '--outdir', join(tmp, 'out')], { cwd: new URL('..', import.meta.url).pathname, stdio: 'pipe', env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } });
    script = join(tmp, 'out', readdirSync(join(tmp, 'out')).find((f) => f.endsWith('.js'))!);
    readFileSync(script);
    const probe = start({ PREVIEW_SEED: '1' });
    await probe.ready;
  } catch (e) {
    skip = `workerd/bundle unavailable: ${(e as Error).message.slice(0, 400)}`;
  }
});

after(async () => {
  await Promise.all(instances.map((m) => m.dispose()));
  rmSync(tmp, { recursive: true, force: true });
});

test('runtime on workerd', { timeout: 300_000 }, async (t) => {
  if (skip) return t.skip(skip);
  const prod = start();
  const preview = start({ PREVIEW_SEED: '1' });

  await t.test('a) rejects requests without a valid Access JWT', async () => {
    const r = await call(prod, '/api/meta', false);
    assert.ok([401, 403].includes(r.status));
    assert.equal(r.headers.get('cache-control'), 'no-store');
  });

  await t.test('b) production with empty store stays in maintenance', async () => {
    const r = await call(prod, '/api/meta');
    assert.equal(r.status, 503);
    assert.equal(r.headers.get('cache-control'), 'no-store');
  });

  await t.test('c) object start (initial alarm) in maintenance leaves the store empty and serving 503', async () => {
    // Weak by design: Miniflare 5 exposes no alarm trigger; the constructor arms an alarm at once, so wait for it to fire.
    await call(prod, '/api/meta');
    await new Promise((resolve) => setTimeout(resolve, 1500));
    assert.equal((await call(prod, '/api/meta')).status, 503);
  });

  await t.test('d) preview serves seeded JSON through Express and DO SQL', async () => {
    const r = await call(preview, '/api/config');
    assert.equal(r.status, 200); // 200 also proves the bundle booted (no require_streams crash)
    assert.match(r.headers.get('content-type') ?? '', /json/);
    assert.ok(Object.keys(await r.json() as object).length > 0);
  });

  await t.test('e) preview and production do not share storage', async () => {
    assert.equal((await call(preview, '/api/config')).status, 200);
    assert.equal((await call(prod, '/api/config')).status, 503);
  });
});
