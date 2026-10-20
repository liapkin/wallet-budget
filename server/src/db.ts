import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Config } from '../../shared/src/types.ts';
import { seedToConfig } from '../../shared/src/seed.ts';
import { bumpVersion } from './memo.ts';
import { currentRuntime, type Database, type Statement } from './runtime.ts';

const localRoot = (): string => join(import.meta.dirname, '..', '..');
// relative BUDGET_DB resolves against the repo root so it works from any workspace
export const resolveDatabasePath = (env: NodeJS.ProcessEnv = process.env): string => {
  const configured = env.BUDGET_DB;
  const root = localRoot();
  const demoPath = resolve(root, 'data/demo.db');
  const path = configured === ':memory:' ? ':memory:' : resolve(root, configured ?? (env.DEMO === '1' ? demoPath : 'data/budget.db'));
  if (env.DEMO === '1' && path !== ':memory:' && path !== demoPath) {
    throw new Error('Demo mode refuses to open databases other than data/demo.db');
  }
  return path;
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS records (
  id INTEGER PRIMARY KEY, source TEXT, ext_id TEXT UNIQUE, account TEXT, category TEXT,
  amount_cents INTEGER, type TEXT, payment_type TEXT, note TEXT, payee TEXT, date_utc TEXT,
  raw_json TEXT, group_override TEXT, is_dup INTEGER DEFAULT 0, dup_of INTEGER, grp TEXT, month TEXT);
CREATE TABLE IF NOT EXISTS config (id INTEGER PRIMARY KEY CHECK(id=1), json TEXT);
CREATE TABLE IF NOT EXISTS core_actuals (month TEXT, key TEXT, cents INTEGER, PRIMARY KEY(month, key));
CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, name TEXT, balance_cents INTEGER, currency TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, name TEXT, parent TEXT);
CREATE TABLE IF NOT EXISTS sync_state (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS balance_snapshots (day TEXT, account TEXT, balance_cents INTEGER, PRIMARY KEY(day, account));
CREATE TABLE IF NOT EXISTS crypto_snapshots (ts TEXT, symbol TEXT, amount REAL, price_cents INTEGER, pct24h REAL, PRIMARY KEY(ts, symbol));
CREATE TABLE IF NOT EXISTS dup_decisions (a INTEGER, b INTEGER, decision TEXT CHECK(decision IN ('dup','not')), PRIMARY KEY(a, b));
CREATE TABLE IF NOT EXISTS month_close (month TEXT PRIMARY KEY, json TEXT);
CREATE TABLE IF NOT EXISTS habit_log (day TEXT, habit TEXT, PRIMARY KEY(day, habit));
CREATE TABLE IF NOT EXISTS push_subscriptions (endpoint TEXT PRIMARY KEY, json TEXT);
CREATE INDEX IF NOT EXISTS records_month ON records(month);
CREATE INDEX IF NOT EXISTS records_source_date ON records(source, date_utc);
CREATE INDEX IF NOT EXISTS records_grp ON records(grp);
`;

const normalizeConfig = (cfg: Config): Config => ({
  ...cfg,
  currency: cfg.currency ?? 'EUR',
  habits: cfg.habits ?? [],
  investing: {
    ...cfg.investing,
    crypto: (cfg.investing.crypto ?? []).map((h) => ({ ...h, paid: h.paid ?? 0 })),
    etfs: (cfg.investing.etfs ?? []).map((h) => ({ ...h, paid: h.paid ?? 0 })),
  },
  allocation: { ...cfg.allocation, hiddenAccounts: cfg.allocation.hiddenAccounts ?? [] },
  wallet: { ...cfg.wallet, incomeGroups: cfg.wallet.incomeGroups ?? ['Income'] },
});

/** Creates/migrates schema without reading local files. Cloud callers pass their seed explicitly. */
export function initializeSchema(database: Database, initialConfig?: Config): void {
  database.exec(SCHEMA);
  if (!(database.prepare('PRAGMA table_info(records)').all() as { name: string }[]).some((c) => c.name === 'created_in_app')) {
    database.exec('ALTER TABLE records ADD COLUMN created_in_app INTEGER DEFAULT 0');
  }
  if (!(database.prepare('PRAGMA table_info(crypto_snapshots)').all() as { name: string }[]).some((c) => c.name === 'kind')) {
    database.exec("ALTER TABLE crypto_snapshots ADD COLUMN kind TEXT DEFAULT 'crypto'");
  }
  if (initialConfig && !database.prepare('SELECT 1 FROM config').get()) {
    database.prepare('INSERT INTO config (id, json) VALUES (1, ?)').run(JSON.stringify(normalizeConfig(initialConfig)));
  }
}

let local: Database | undefined;
let localPath: string | undefined;

const openLocal = (): Database => {
  if (local) return local;
  const path = resolveDatabasePath();
  if (path !== ':memory:') mkdirSync(join(path, '..'), { recursive: true });
  const sqlite = new DatabaseSync(path);
  const database: Database = {
    prepare: (sql) => sqlite.prepare(sql) as Statement,
    exec: (sql) => sqlite.exec(sql),
    transaction: (fn) => {
      sqlite.exec('BEGIN');
      try {
        const result = fn();
        sqlite.exec('COMMIT');
        return result;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
    close: () => sqlite.close(),
  };
  initializeSchema(database);
  if (!database.prepare('SELECT 1 FROM config').get()) {
    const root = localRoot();
    const personal = join(root, 'config', 'seed-config.json');
    const example = join(root, 'config', 'seed-config.example.json');
    const seed = process.env.DEMO === '1' || !existsSync(personal) ? example : personal;
    const cfg = seedToConfig(JSON.parse(readFileSync(seed, 'utf8')));
    if (process.env.DEMO === '1') cfg.currency = 'USD';
    database.prepare('INSERT INTO config (id, json) VALUES (1, ?)').run(JSON.stringify(normalizeConfig(cfg)));
  }
  localPath = path;
  local = database;
  return database;
};

const activeDatabase = (): Database => currentRuntime()?.db ?? openLocal();

/** Existing imports stay valid; each operation resolves DB from current async runtime. */
export const db: Database & { close(): void } = new Proxy({} as Database & { close(): void }, {
  get(_target, property) {
    if (property === 'close' && !activeDatabase().close) return () => undefined;
    const active = activeDatabase();
    // every write goes through exec/run/transaction here, so the read memo is invalidated centrally
    if (property === 'exec') return (sql: string) => { try { return active.exec(sql); } finally { bumpVersion(); } };
    if (property === 'transaction') return (fn: () => unknown) => { try { return active.transaction(fn); } finally { bumpVersion(); } };
    if (property === 'prepare') {
      return (sql: string) => {
        const st = active.prepare(sql);
        return { get: (...a: any[]) => st.get(...a), all: (...a: any[]) => st.all(...a), run: (...a: any[]) => { try { return st.run(...a); } finally { bumpVersion(); } } };
      };
    }
    const value = (active as any)[property];
    return typeof value === 'function' ? value.bind(active) : value;
  },
});

export const databasePath = (): string => localPath ?? resolveDatabasePath();

export const getConfig = (): Config => {
  const cfg = JSON.parse((db.prepare('SELECT json FROM config WHERE id=1').get() as { json: string }).json) as Config;
  return normalizeConfig(cfg);
};

export const currencyLocked = (): boolean => !!db.prepare(
  'SELECT 1 FROM records UNION ALL SELECT 1 FROM core_actuals UNION ALL SELECT 1 FROM accounts LIMIT 1',
).get();

export const requireWalletCurrency = (): void => {
  if ((currentRuntime()?.env ?? process.env).DEMO === '1') throw new Error('Disabled in demo mode');
  if (getConfig().currency !== 'EUR') throw new Error('Wallet sync, import and writes support EUR databases only');
};

export const setConfig = (cfg: Config): void => {
  const current = db.prepare('SELECT json FROM config WHERE id=1').get() ? getConfig().currency : 'EUR';
  const currency = cfg.currency === undefined ? current : cfg.currency;
  if (currency !== 'EUR' && currency !== 'USD') throw new Error('currency must be EUR or USD');
  if (currency !== current && currencyLocked()) throw new Error('Database currency cannot change while records, actuals or accounts exist');
  db.prepare('INSERT OR REPLACE INTO config (id, json) VALUES (1, ?)').run(JSON.stringify({ ...cfg, currency }));
};

export function tx<T>(fn: () => T): T {
  return db.transaction(fn);
}
