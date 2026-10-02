import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Config } from '../../shared/src/types.ts';
import { seedToConfig } from '../../shared/src/seed.ts';

const root = join(import.meta.dirname, '..', '..');
// relative BUDGET_DB resolves against the repo root so it works from any workspace
export const resolveDatabasePath = (env: NodeJS.ProcessEnv = process.env): string => {
  const configured = env.BUDGET_DB;
  const demoPath = resolve(root, 'data/demo.db');
  const path = configured === ':memory:' ? ':memory:' : resolve(root, configured ?? (env.DEMO === '1' ? demoPath : 'data/budget.db'));
  if (env.DEMO === '1' && path !== ':memory:' && path !== demoPath) {
    throw new Error('Demo mode refuses to open databases other than data/demo.db');
  }
  return path;
};

const path = resolveDatabasePath();
if (path !== ':memory:') mkdirSync(join(path, '..'), { recursive: true });

export const db = new DatabaseSync(path);

db.exec(`
CREATE TABLE IF NOT EXISTS records (
  id INTEGER PRIMARY KEY, source TEXT, ext_id TEXT UNIQUE, account TEXT, category TEXT,
  amount_cents INTEGER, type TEXT, payment_type TEXT, note TEXT, payee TEXT, date_utc TEXT,
  raw_json TEXT, group_override TEXT, is_dup INTEGER DEFAULT 0, dup_of INTEGER, grp TEXT, month TEXT);
CREATE TABLE IF NOT EXISTS config (id INTEGER PRIMARY KEY CHECK(id=1), json TEXT);
CREATE TABLE IF NOT EXISTS core_actuals (month TEXT, key TEXT, cents INTEGER, PRIMARY KEY(month, key));
CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, name TEXT, balance_cents INTEGER, currency TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, name TEXT, parent TEXT);
CREATE TABLE IF NOT EXISTS sync_state (key TEXT PRIMARY KEY, value TEXT);
`);

export const getConfig = (): Config =>
  JSON.parse((db.prepare('SELECT json FROM config WHERE id=1').get() as { json: string }).json);

export const setConfig = (cfg: Config): void => {
  db.prepare('INSERT OR REPLACE INTO config (id, json) VALUES (1, ?)').run(JSON.stringify(cfg));
};

if (!db.prepare('SELECT 1 FROM config').get()) {
  const personal = join(root, 'config', 'seed-config.json');
  const example = join(root, 'config', 'seed-config.example.json');
  const seed = process.env.DEMO === '1' || !existsSync(personal) ? example : personal;
  setConfig(seedToConfig(JSON.parse(readFileSync(seed, 'utf8'))));
}
