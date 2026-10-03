import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { db, dbPath } from './db.ts';

const KEEP = 14;
const FILE = /^budget-\d{4}-\d{2}-\d{2}\.db$/;

/** Backup files to delete so only the newest `keep` remain (names sort by date). */
export const expired = (files: string[], keep = KEEP): string[] => {
  const all = files.filter((f) => FILE.test(f)).sort();
  return all.slice(0, Math.max(0, all.length - keep));
};

/** Writes data/backups/budget-YYYY-MM-DD.db once per day. Returns true if a file was created. */
export function backupToday(): boolean {
  if (process.env.DEMO === '1' || dbPath === ':memory:') return false;
  const dir = join(dirname(dbPath), 'backups');
  const file = join(dir, `budget-${new Date().toLocaleDateString('sv', { timeZone: 'Europe/Athens' })}.db`);
  if (existsSync(file)) return false;
  mkdirSync(dir, { recursive: true });
  db.prepare('VACUUM INTO ?').run(file);
  for (const f of expired(readdirSync(dir))) rmSync(join(dir, f));
  return true;
}
