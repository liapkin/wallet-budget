import { db, getConfig, requireWalletCurrency, tx } from './db.ts';
import { get, RetryAfterError, secret } from './wallet.ts';
import { runPipeline } from './pipeline.ts';
import { fetchCryptoQuotes, fetchEtfMarket, rateToEur, saveHoldingQuotes, type Quotes } from './holdings.ts';
import { toDelete } from './reconcile.ts';
import { toCents } from '../../shared/src/money.ts';
import { athensDay } from '../../shared/src/month.ts';
import type { SyncJob } from '../../shared/src/sync-job.ts';
import type { SyncController } from './runtime.ts';

type Stage = 'accounts' | 'categories' | 'records' | 'edited' | 'deletions' | 'crypto' | 'etf' | 'pipeline';
type Cursor = {
  stage: Stage;
  full: boolean;
  startedAt: string;
  start: string;
  end: string;
  offset?: number;
  windowFrom: string;
  remoteIds?: string[];
  deleteFrom?: string;
  quotes?: Quotes;
  quoteIndex?: number;
  pendingEtf?: { symbol: string; price: number; prevClose: number; currency: string };
  inserted: number;
  updated: number;
  deleted: number;
  warnings?: string[];
};

// Pricing is best-effort: a failed quote source must not block classification.
const priceFailed = (cursor: Cursor, kind: string, error: unknown): void => {
  const message = (error as Error).message;
  console.error(`${kind} prices failed: ${message}`);
  (cursor.warnings ??= []).push(`${kind} prices failed: ${message}`);
};

const IDLE: SyncJob = { status: 'idle', inserted: 0, updated: 0, deleted: 0 };
const state = (key: string): string | undefined =>
  (db.prepare('SELECT value FROM sync_state WHERE key=?').get(key) as { value: string } | undefined)?.value;
const putState = (key: string, value: string): void => {
  db.prepare('INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)').run(key, value);
};
const deleteState = (key: string): void => {
  db.prepare('DELETE FROM sync_state WHERE key=?').run(key);
};
const readJob = (): SyncJob => {
  const raw = state('sync_job');
  return raw ? JSON.parse(raw) as SyncJob : IDLE;
};
const writeJob = (job: SyncJob): void => putState('sync_job', JSON.stringify(job));
const readCursor = (): Cursor | undefined => {
  const raw = state('sync_cursor');
  return raw ? JSON.parse(raw) as Cursor : undefined;
};
const runningJob = (cursor: Cursor, extra: Partial<SyncJob> = {}): SyncJob => ({
  status: 'running', inserted: cursor.inserted, updated: cursor.updated, deleted: cursor.deleted, ...extra,
});
const checkpoint = (cursor: Cursor, job = runningJob(cursor)): void => {
  putState('sync_cursor', JSON.stringify(cursor));
  writeJob(job);
};

const day = (d: Date): string => d.toISOString().slice(0, 10);
const nextWindow = (from: string, end: string): string =>
  day(new Date(Math.min(Date.UTC(new Date(from).getUTCFullYear() + 1, 0, 1), Date.parse(end))));

// API has no payment type: bank-feed records are TRANSFER, phone entries MOBILE_PAYMENT, rest CASH.
const paymentType = (r: any): string =>
  r.source === 'backend' || r.accountIsBankSync ? 'TRANSFER' : r.source === 'android' || r.source === 'ios' ? 'MOBILE_PAYMENT' : 'CASH';

export const CATEGORY_ALIAS: Record<string, string> = {
  'Restaurants & fast food': 'Restaurant, fast-food', 'Bar cafe': 'Bar, cafe', 'Holidays, trips, hotels': 'Holiday, trips, hotels',
  'Unknown expense': 'Unknown Expense', 'Phone, cell phones': 'Phone, cell phone', 'Electronics & accessories': 'Electronics, accessories',
  'Home & garden': 'Home, garden', 'Energy & utilities': 'Energy, utilities', Drugstore: 'Drug-store, chemist',
  'Charges, fees': 'Charges, Fees', 'Health care & doctor': 'Health care, doctor', 'Wellness & beauty': 'Wellness, beauty',
  'Gifts & joy': 'Gifts, joy', 'Education & development': 'Education, development',
  'Books, audio, subscription': 'Books, audio, subscriptions', 'Fin. investments': 'Financial investments',
};

/** Stores one Wallet record. Statements resolve against current runtime DB on every call. */
export function insertApiRecord(r: any): 'inserted' | 'updated' | 'same' {
  requireWalletCurrency();
  const c = r.convertedAmount;
  const eur = c?.currencyCode === 'EUR' && c.value != null ? c.value : r.amount.currencyCode === 'EUR' ? r.amount.value : null;
  if (eur == null) throw new Error(`no EUR amount for record in ${r.amount.currencyCode}`);
  const had = !!db.prepare('SELECT 1 FROM records WHERE ext_id=?').get(r.id);
  const changes = db.prepare(
    `INSERT INTO records (source, ext_id, account, category, amount_cents, type, payment_type, note, payee, date_utc, raw_json)
     VALUES ('api', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(ext_id) DO UPDATE SET account=excluded.account, category=excluded.category, amount_cents=excluded.amount_cents,
       type=excluded.type, payment_type=excluded.payment_type, note=excluded.note, payee=excluded.payee, date_utc=excluded.date_utc,
       raw_json=excluded.raw_json
     WHERE source='api' AND raw_json IS NOT excluded.raw_json`,
  ).run(
    r.id, r.accountName, CATEGORY_ALIAS[r.category?.name] ?? r.category?.name ?? '', toCents(eur), r.recordType === 'income' ? 'Income' : 'Expenses',
    paymentType(r), r.note ?? '', r.counterParty ?? '', new Date(r.recordDate).toISOString(), JSON.stringify(r),
  ).changes;
  return !changes ? 'same' : had ? 'updated' : 'inserted';
}

export const beginSync = (full = false): SyncJob => {
  requireWalletCurrency();
  const current = readJob();
  if (current.status === 'running' && readCursor()) return current;
  const startedAt = new Date().toISOString();
  const lastDate = state('last_date');
  const start = lastDate ? day(new Date(Date.parse(lastDate) - 8 * 864e5)) : '2017-01-01';
  const cursor: Cursor = {
    stage: 'accounts', full, startedAt, start, end: day(new Date(Date.now() + 864e5)), windowFrom: start,
    inserted: 0, updated: 0, deleted: 0,
  };
  const job = runningJob(cursor);
  tx(() => checkpoint(cursor, job));
  return job;
};

const page = async (path: string, key: string, params: Record<string, string | number | string[]>, offset?: number): Promise<{ rows: any[]; next?: number }> => {
  const result: any = await get(path, { ...params, limit: 200, offset: offset ?? 0 });
  return { rows: result[key] ?? [], next: typeof result.nextOffset === 'number' ? result.nextOffset : undefined };
};

/** Performs at most `maxRequests` outbound calls and persists after every page/price. */
export async function runSyncStep({ maxRequests = 20 }: { maxRequests?: number } = {}): Promise<SyncJob> {
  let cursor = readCursor();
  if (!cursor || readJob().status !== 'running') return readJob();
  const delayed = readJob().nextRetryAt;
  if (delayed && Date.parse(delayed) > Date.now()) return readJob();
  if (delayed) tx(() => checkpoint(cursor!));
  let requests = 0;

  try {
    while (requests < maxRequests) {
      if (cursor.stage === 'accounts') {
        const result = await page('/v1/api/accounts', 'accounts', {}, cursor.offset); requests++;
        tx(() => {
          const snap = db.prepare('INSERT OR REPLACE INTO balance_snapshots (day, account, balance_cents) VALUES (?, ?, ?)');
          const up = db.prepare('INSERT OR REPLACE INTO accounts (id, name, balance_cents, currency, updated_at) VALUES (?, ?, ?, ?, ?)');
          for (const a of result.rows) {
            const balance = a.balance?.currentBalance;
            up.run(a.id, a.name, balance == null ? null : toCents(balance), a.currencyCode, cursor!.startedAt);
            if (balance != null) snap.run(athensDay(), a.name, toCents(balance));
          }
          cursor!.offset = result.next;
          if (result.next === undefined) { cursor!.stage = 'categories'; delete cursor!.offset; }
          checkpoint(cursor!);
        });
        continue;
      }
      if (cursor.stage === 'categories') {
        const result = await page('/v1/api/categories', 'categories', {}, cursor.offset); requests++;
        tx(() => {
          const up = db.prepare('INSERT OR REPLACE INTO categories (id, name, parent) VALUES (?, ?, ?)');
          for (const c of result.rows) up.run(c.id, CATEGORY_ALIAS[c.name] ?? c.name, c.group?.name ?? c.parentName ?? '');
          cursor!.offset = result.next;
          if (result.next === undefined) { cursor!.stage = 'records'; delete cursor!.offset; }
          checkpoint(cursor!);
        });
        continue;
      }
      if (cursor.stage === 'records') {
        if (cursor.windowFrom >= cursor.end) {
          cursor.stage = 'edited'; delete cursor.offset; tx(() => checkpoint(cursor!)); continue;
        }
        const to = nextWindow(cursor.windowFrom, cursor.end);
        const result = await page('/v1/api/records', 'records', {
          recordDate: [`gte.${cursor.windowFrom}`, `lt.${to}`], convertTo: 'EUR', sortBy: '+recordDate',
        }, cursor.offset); requests++;
        tx(() => {
          for (const record of result.rows) {
            const outcome = insertApiRecord(record);
            if (outcome === 'inserted') cursor!.inserted++;
            else if (outcome === 'updated') cursor!.updated++;
          }
          cursor!.offset = result.next;
          if (result.next === undefined) {
            putState('last_date', day(new Date(Math.min(Date.parse(to), Date.now()))));
            cursor!.windowFrom = to;
            delete cursor!.offset;
          }
          checkpoint(cursor!);
        });
        continue;
      }
      if (cursor.stage === 'edited') {
        const since = state('last_updated_at');
        if (!since) {
          putState('last_updated_at', cursor.startedAt); cursor.stage = 'deletions'; tx(() => checkpoint(cursor!)); continue;
        }
        const result = await page('/v1/api/records', 'records', {
          updatedAt: `gte.${since}`, recordDate: 'gte.2017-01-01', convertTo: 'EUR',
        }, cursor.offset); requests++;
        tx(() => {
          for (const record of result.rows) {
            const outcome = insertApiRecord(record);
            if (outcome === 'inserted') cursor!.inserted++;
            else if (outcome === 'updated') cursor!.updated++;
          }
          cursor!.offset = result.next;
          if (result.next === undefined) {
            putState('last_updated_at', cursor!.startedAt);
            cursor!.stage = 'deletions'; delete cursor!.offset;
          }
          checkpoint(cursor!);
        });
        continue;
      }
      if (cursor.stage === 'deletions') {
        if (cursor.deleteFrom === undefined) {
          cursor.deleteFrom = cursor.full
            ? (db.prepare("SELECT MIN(date_utc) AS d FROM records WHERE source='api'").get() as { d: string | null }).d?.slice(0, 10) ?? ''
            : day(new Date(Date.now() - 90 * 864e5));
          cursor.remoteIds = [];
          tx(() => checkpoint(cursor!));
        }
        if (!cursor.deleteFrom) { cursor.stage = 'crypto'; tx(() => checkpoint(cursor!)); continue; }
        const result = await page('/v1/api/records', 'records', { recordDate: `gte.${cursor.deleteFrom}` }, cursor.offset); requests++;
        tx(() => {
          cursor!.remoteIds!.push(...result.rows.map((record) => record.id));
          cursor!.offset = result.next;
          if (result.next === undefined) {
            const remote = new Set(cursor!.remoteIds);
            const local = (db.prepare("SELECT ext_id FROM records WHERE source='api' AND date_utc >= ?").all(cursor!.deleteFrom) as { ext_id: string }[]).map((r) => r.ext_id);
            if (!local.length || remote.size) {
              const delDecision = db.prepare("DELETE FROM dup_decisions WHERE a IN (SELECT id FROM records WHERE ext_id=?) OR b IN (SELECT id FROM records WHERE ext_id=?)");
              const del = db.prepare("DELETE FROM records WHERE source='api' AND ext_id=?");
              for (const id of toDelete(local, remote)) {
                delDecision.run(id, id);
                cursor!.deleted += Number(del.run(id).changes);
              }
            }
            cursor!.stage = 'crypto'; delete cursor!.offset; delete cursor!.remoteIds;
          }
          checkpoint(cursor!);
        });
        continue;
      }
      if (cursor.stage === 'crypto') {
        try {
        const holdings = getConfig().investing.crypto;
        const key = secret('COINMARKETCAP_API_KEY');
        if (key && holdings.length) {
          const symbols = [...new Set(holdings.map((h) => h.symbol.toUpperCase()))];
          const quotes = await fetchCryptoQuotes(key, symbols); requests++;
          saveHoldingQuotes('crypto', quotes);
        } else if (!holdings.length) saveHoldingQuotes('crypto', {});
        } catch (error) { priceFailed(cursor, 'crypto', error); }
        cursor.stage = 'etf'; cursor.quotes = {}; cursor.quoteIndex = 0; tx(() => checkpoint(cursor!));
        continue;
      }
      if (cursor.stage === 'etf') {
        try {
        const holdings = getConfig().investing.etfs;
        const symbols = [...new Set(holdings.map((h) => h.symbol.toUpperCase()))];
        const index = cursor.quoteIndex ?? 0;
        if (index >= symbols.length) {
          saveHoldingQuotes('etf', cursor.quotes ?? {});
          cursor.stage = 'pipeline'; delete cursor.quotes; delete cursor.quoteIndex; delete cursor.pendingEtf;
          tx(() => checkpoint(cursor!)); continue;
        }
        if (!cursor.pendingEtf) {
          cursor.pendingEtf = { symbol: symbols[index], ...await fetchEtfMarket(symbols[index]) }; requests++;
          tx(() => checkpoint(cursor!));
          if (requests >= maxRequests) break;
        }
        const pending = cursor.pendingEtf;
        const rate = pending.currency === 'EUR' ? 1 : await rateToEur(pending.currency);
        if (pending.currency !== 'EUR') requests++;
        cursor.quotes![pending.symbol] = { price: pending.price * rate, pct24h: pending.price / pending.prevClose * 100 - 100 };
        cursor.quoteIndex = index + 1; delete cursor.pendingEtf;
        tx(() => checkpoint(cursor!));
        continue;
        } catch (error) {
          priceFailed(cursor, 'etf', error);
          cursor.stage = 'pipeline'; delete cursor.quotes; delete cursor.quoteIndex; delete cursor.pendingEtf;
          tx(() => checkpoint(cursor!)); continue;
        }
      }
      runPipeline();
      const done: SyncJob = { status: 'succeeded', inserted: cursor.inserted, updated: cursor.updated, deleted: cursor.deleted, ...(cursor.warnings && { warnings: cursor.warnings }) };
      tx(() => { putState('last_sync', new Date().toISOString()); deleteState('sync_cursor'); writeJob(done); });
      return done;
    }
    return readJob();
  } catch (error) {
    if (error instanceof RetryAfterError) {
      const job = runningJob(cursor, { nextRetryAt: error.retryAt });
      tx(() => checkpoint(cursor!, job));
      return job;
    }
    const failed: SyncJob = { status: 'failed', inserted: cursor.inserted, updated: cursor.updated, deleted: cursor.deleted, error: (error as Error).message };
    tx(() => { deleteState('sync_cursor'); writeJob(failed); });
    return failed;
  }
}

export async function sync({ full = false } = {}): Promise<{ inserted: number; updated: number; deleted: number }> {
  beginSync(full);
  while (readJob().status === 'running') {
    const job = await runSyncStep();
    const retryAt = job.nextRetryAt;
    if (retryAt) await new Promise((resolve) => setTimeout(resolve, Math.max(0, Date.parse(retryAt) - Date.now())));
  }
  const job = readJob();
  if (job.status === 'failed') throw new Error(job.error);
  return { inserted: job.inserted, updated: job.updated, deleted: job.deleted };
}

let running: ReturnType<typeof sync> | undefined;
export const syncOnce = (): ReturnType<typeof sync> => (running ??= sync().finally(() => (running = undefined)));
export const lastSync = (): string | null => state('last_sync') ?? null;

export const localSyncController: SyncController = {
  start: () => {
    const job = beginSync();
    if (job.status === 'running' && !running) void syncOnce().catch(() => undefined);
    return job;
  },
  status: readJob,
};

if (import.meta.main) await sync({ full: process.argv.includes('--full') });
