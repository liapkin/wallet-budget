import { createServer } from 'node:http';
import { DurableObject } from 'cloudflare:workers';
import { handleAsNodeRequest } from 'cloudflare:node';
import seed from '../../config/seed-config.example.json' with { type: 'json' };
import { seedToConfig } from '../../shared/src/seed.ts';
import { initializeSchema } from '../../server/src/db.ts';
import { app } from '../../server/src/main.ts';
import { beginSync, localSyncController, runSyncStep } from '../../server/src/sync.ts';
import { withRuntime, type Runtime, type SyncController } from '../../server/src/runtime.ts';
import type { SyncJob } from '../../shared/src/sync-job.ts';
import { accessToken, verifyAccessJwt, type AccessSettings } from './access.ts';
import { DurableDatabase, type DurableStorage } from './database.ts';
import { MigrationStore } from './migration.ts';
import { routeKey, UsageMeter } from './meter.ts';
import { canRunSync, nextAlarmAt, SYNC_INTERVAL_MS } from './schedule.ts';

const BLOCKED_RETRY_MS = 300_000;

const EXPRESS_PORT = 31_415;
const expressServer = createServer(app);
expressServer.listen(EXPRESS_PORT);

interface Env extends AccessSettings {
  BUDGET: DurableObjectNamespace<BudgetObject>;
  ASSETS: Fetcher;
  HOSTED: string;
  MIGRATION_ENABLED: string;
  PREVIEW_SEED?: string;
  RECOVERY_ENABLED?: string;
  WALLET_API_TOKEN?: string;
  COINMARKETCAP_API_KEY?: string;
}

const runtimeEnv = (env: Env): Record<string, string | undefined> => ({
  HOSTED: env.HOSTED,
  MIGRATION_ENABLED: env.MIGRATION_ENABLED,
  WALLET_API_TOKEN: env.WALLET_API_TOKEN,
  COINMARKETCAP_API_KEY: env.COINMARKETCAP_API_KEY,
});

const accessRequired = (): Response => new Response(JSON.stringify({ error: 'Access required', code: 'ACCESS_REQUIRED' }), {
  status: 401,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});
const forbidden = (): Response => new Response('Forbidden', { status: 403, headers: { 'cache-control': 'no-store' } });
const unsafe = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

class CloudSyncController implements SyncController {
  private readonly setAlarm: (time: number) => Promise<void>;
  private stepping = false;

  constructor(setAlarm: (time: number) => Promise<void>) {
    this.setAlarm = setAlarm;
  }

  async start(): Promise<SyncJob> {
    const job = beginSync();
    if (job.status === 'running') await this.setAlarm(Date.now());
    return job;
  }

  status(): SyncJob {
    return localSyncController.status();
  }

  async step(): Promise<void> {
    if (this.stepping) return;
    this.stepping = true;
    try {
      await this.setAlarm(nextAlarmAt(await runSyncStep({ maxRequests: 20 }), Date.now()));
    } catch (e) {
      // an unexpected throw must not end the hourly schedule; surface the error after re-arming
      await this.setAlarm(Date.now() + SYNC_INTERVAL_MS);
      throw e;
    } finally {
      this.stepping = false;
    }
  }
}

export class BudgetObject extends DurableObject<Env> {
  private readonly db: DurableDatabase;
  private readonly migration: MigrationStore;
  private readonly runtime: Runtime;
  private readonly sync: CloudSyncController;
  private readonly recovery: DurableObjectStorage;
  private readonly usage = new UsageMeter();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.db = new DurableDatabase(ctx.storage as unknown as DurableStorage);
    this.migration = new MigrationStore(this.db);
    this.recovery = ctx.storage;
    this.sync = new CloudSyncController((time) => ctx.storage.setAlarm(time));
    this.runtime = { db: this.db, env: runtimeEnv(env), sync: this.sync };
    ctx.blockConcurrencyWhile(async () => {
      const initial = env.PREVIEW_SEED === '1' ? seedToConfig(seed as Parameters<typeof seedToConfig>[0]) : undefined;
      initializeSchema(this.db, initial);
      if (env.PREVIEW_SEED === '1') this.migration.markReady();
      if ((await ctx.storage.getAlarm()) === null) await ctx.storage.setAlarm(Date.now());
    });
  }

  private async recoveryRequest(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    const headers = { 'content-type': 'application/json', 'cache-control': 'no-store' };
    if (request.method === 'GET' && path === '/__cloud/recovery/bookmark') {
      return new Response(JSON.stringify({ bookmark: await this.recovery.getCurrentBookmark() }), { headers });
    }
    if (request.method === 'POST' && path === '/__cloud/recovery/restore') {
      const body = await request.json() as { timestamp?: unknown; confirm?: unknown };
      if (body.confirm !== 'RESTORE' || typeof body.timestamp !== 'string') return new Response(JSON.stringify({ error: 'confirmation and ISO timestamp required' }), { status: 400, headers });
      const timestamp = new Date(body.timestamp);
      if (!Number.isFinite(timestamp.getTime()) || timestamp.getTime() > Date.now()) return new Response(JSON.stringify({ error: 'invalid recovery timestamp' }), { status: 400, headers });
      const bookmark = await this.recovery.getBookmarkForTime(timestamp);
      await this.recovery.onNextSessionRestoreBookmark(bookmark);
      return new Response(JSON.stringify({ scheduled: true, bookmark }), { status: 202, headers });
    }
    return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers });
  }

  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (this.env.RECOVERY_ENABLED === '1') {
      if (path.startsWith('/__cloud/recovery/')) return this.recoveryRequest(request);
      if (path === '/__cloud/export') return this.migration.handle(request);
      return new Response('Maintenance', { status: 503, headers: { 'cache-control': 'no-store', 'retry-after': '60' } });
    }
    if (this.env.MIGRATION_ENABLED === '1') {
      if (path.startsWith('/__cloud/migration/') || path === '/__cloud/export') {
        const response = await this.migration.handle(request);
        if (response.ok && path === '/__cloud/migration/finalize') await this.ctx.storage.setAlarm(Date.now());
        return response;
      }
      return new Response('Maintenance', { status: 503, headers: { 'cache-control': 'no-store', 'retry-after': '60' } });
    }
    if (request.method === 'GET' && path === '/__cloud/usage') {
      return new Response(JSON.stringify(this.usage.report()), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
    }
    if (path.startsWith('/__cloud/')) return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } });
    if (!this.migration.ready()) return new Response('Maintenance', { status: 503, headers: { 'cache-control': 'no-store', 'retry-after': '60' } });
    if (!path.startsWith('/api/')) return withRuntime(this.runtime, () => handleAsNodeRequest(EXPRESS_PORT, request));
    const { result, meter } = await this.usage.track(routeKey(request.method, path), () =>
      withRuntime(this.runtime, () => handleAsNodeRequest(EXPRESS_PORT, request)));
    const response = new Response(result.body, result);
    response.headers.set('x-rows-read', String(meter.rowsRead));
    response.headers.set('x-rows-written', String(meter.rowsWritten));
    return response;
  }

  async alarm(): Promise<void> {
    const flags = { ready: this.migration.ready(), migrationEnabled: this.env.MIGRATION_ENABLED === '1', recoveryEnabled: this.env.RECOVERY_ENABLED === '1' };
    if (!canRunSync(flags)) {
      await this.ctx.storage.setAlarm(Date.now() + BLOCKED_RETRY_MS);
      return;
    }
    await this.usage.track('alarm:sync', () => withRuntime(this.runtime, () => this.sync.step()));
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      await verifyAccessJwt(accessToken(request), env);
    } catch {
      return accessRequired();
    }

    const url = new URL(request.url);
    if (unsafe.has(request.method)) {
      const origin = request.headers.get('origin');
      if (origin !== url.origin) return forbidden();
    }

    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/__cloud/')) {
      const id = env.BUDGET.idFromName('owner');
      const response = await env.BUDGET.get(id).fetch(request);
      const headers = new Headers(response.headers);
      headers.set('cache-control', 'no-store');
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
