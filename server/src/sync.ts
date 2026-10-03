import { db, requireWalletCurrency } from './db.ts';
import { get, pages } from './wallet.ts';
import { runPipeline } from './pipeline.ts';
import { toDelete } from './reconcile.ts';
import { toCents } from '../../shared/src/money.ts';

const athensDay = (): string => new Date().toLocaleDateString('sv', { timeZone: 'Europe/Athens' });
const day = (d: Date): string => d.toISOString().slice(0, 10);

// The API has no payment type: bank-feed records are TRANSFER, phone entries MOBILE_PAYMENT, the rest CASH.
const paymentType = (r: any): string =>
  r.source === 'backend' || r.accountIsBankSync ? 'TRANSFER' : r.source === 'android' || r.source === 'ios' ? 'MOBILE_PAYMENT' : 'CASH';

// The API renames some categories the export names differently; keep the export names so the category map matches.
export const CATEGORY_ALIAS: Record<string, string> = {
  'Restaurants & fast food': 'Restaurant, fast-food', 'Bar cafe': 'Bar, cafe', 'Holidays, trips, hotels': 'Holiday, trips, hotels',
  'Unknown expense': 'Unknown Expense', 'Phone, cell phones': 'Phone, cell phone', 'Electronics & accessories': 'Electronics, accessories',
  'Home & garden': 'Home, garden', 'Energy & utilities': 'Energy, utilities', Drugstore: 'Drug-store, chemist',
  'Charges, fees': 'Charges, Fees', 'Health care & doctor': 'Health care, doctor', 'Wellness & beauty': 'Wellness, beauty',
  'Gifts & joy': 'Gifts, joy', 'Education & development': 'Education, development',
  'Books, audio, subscription': 'Books, audio, subscriptions', 'Fin. investments': 'Financial investments',
};

// group_override is never touched; unchanged rows (same raw_json) report 0 changes.
const ins = db.prepare(
  `INSERT INTO records (source, ext_id, account, category, amount_cents, type, payment_type, note, payee, date_utc, raw_json)
   VALUES ('api', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
   ON CONFLICT(ext_id) DO UPDATE SET account=excluded.account, category=excluded.category, amount_cents=excluded.amount_cents,
     type=excluded.type, payment_type=excluded.payment_type, note=excluded.note, payee=excluded.payee, date_utc=excluded.date_utc,
     raw_json=excluded.raw_json
   WHERE source='api' AND raw_json IS NOT excluded.raw_json`,
);
const exists = db.prepare('SELECT 1 FROM records WHERE ext_id=?');

// Shared by sync and by record creation, so a Wallet id is stored once (ext_id is UNIQUE) whichever arrives first.
// Returns 'inserted' | 'updated' | 'same'.
export function insertApiRecord(r: any): 'inserted' | 'updated' | 'same' {
  requireWalletCurrency();
  const c = r.convertedAmount;
  const eur = c?.currencyCode === 'EUR' && c.value != null ? c.value : r.amount.currencyCode === 'EUR' ? r.amount.value : null;
  if (eur == null) throw new Error(`no EUR amount for record in ${r.amount.currencyCode}`);
  const had = !!exists.get(r.id);
  const changes = ins.run(
    r.id, r.accountName, CATEGORY_ALIAS[r.category?.name] ?? r.category?.name ?? '', toCents(eur), r.recordType === 'income' ? 'Income' : 'Expenses',
    paymentType(r), r.note ?? '', r.counterParty ?? '', new Date(r.recordDate).toISOString(), JSON.stringify(r),
  ).changes;
  return !changes ? 'same' : had ? 'updated' : 'inserted';
}

export async function sync({ full = false } = {}): Promise<{ inserted: number; updated: number; deleted: number }> {
  requireWalletCurrency();
  const startedAt = new Date().toISOString();
  const state = db.prepare("SELECT value FROM sync_state WHERE key='last_date'").get() as { value: string } | undefined;
  const start = state ? new Date(Date.parse(state.value) - 8 * 864e5) : new Date('2017-01-01');
  const end = new Date(Date.now() + 864e5);

  let accounts = 0;
  const snap = db.prepare('INSERT OR REPLACE INTO balance_snapshots (day, account, balance_cents) VALUES (?, ?, ?)');
  const upAcc = db.prepare('INSERT OR REPLACE INTO accounts (id, name, balance_cents, currency, updated_at) VALUES (?, ?, ?, ?, ?)');
  for await (const a of pages<any>('/v1/api/accounts', 'accounts')) {
    requireWalletCurrency();
    accounts++;
    const bal = a.balance?.currentBalance;
    upAcc.run(a.id, a.name, bal == null ? null : toCents(bal), a.currencyCode, new Date().toISOString());
    if (bal != null) snap.run(athensDay(), a.name, toCents(bal));
  }

  const save = db.prepare("INSERT OR REPLACE INTO sync_state (key, value) VALUES ('last_date', ?)");
  let categories = 0;
  const upCat = db.prepare('INSERT OR REPLACE INTO categories (id, name, parent) VALUES (?, ?, ?)');
  for await (const c of pages<any>('/v1/api/categories', 'categories')) {
    categories++;
    upCat.run(c.id, CATEGORY_ALIAS[c.name] ?? c.name, c.group?.name ?? c.parentName ?? '');
  }

  let windows = 0, inserted = 0, updated = 0, deleted = 0;
  const tally = (r: ReturnType<typeof insertApiRecord>) => {
    if (r === 'inserted') inserted++;
    else if (r === 'updated') updated++;
  };
  for (let from = start; from < end; ) {
    const to = new Date(Math.min(Date.UTC(from.getUTCFullYear() + 1, 0, 1), end.getTime()));
    windows++;
    db.exec('BEGIN');
    try {
      for await (const r of pages<any>('/v1/api/records', 'records', {
        recordDate: [`gte.${day(from)}`, `lt.${day(to)}`],
        convertTo: 'EUR',
        sortBy: '+recordDate',
      })) {
        tally(insertApiRecord(r));
      }
      save.run(day(new Date(Math.min(to.getTime(), Date.now()))));
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    from = to;
  }

  // Edits to records outside the walked window. Wallet defaults recordDate to 3 months unless a bound is given.
  const since = db.prepare("SELECT value FROM sync_state WHERE key='last_updated_at'").get() as { value: string } | undefined;
  if (since) {
    windows++;
    for await (const r of pages<any>('/v1/api/records', 'records', { updatedAt: `gte.${since.value}`, recordDate: 'gte.2017-01-01', convertTo: 'EUR' })) {
      tally(insertApiRecord(r));
    }
  }
  db.prepare("INSERT OR REPLACE INTO sync_state (key, value) VALUES ('last_updated_at', ?)").run(startedAt);

  // Deletions: compare ids in a window (all local history with --full) against Wallet.
  const from = full
    ? (db.prepare("SELECT MIN(date_utc) AS d FROM records WHERE source='api'").get() as { d: string | null }).d?.slice(0, 10)
    : day(new Date(Date.now() - 90 * 864e5));
  let glitches = 0;
  if (from) {
    windows++;
    const remote = new Set<string>();
    for await (const r of pages<any>('/v1/api/records', 'records', { recordDate: `gte.${from}` })) remote.add(r.id);
    const local = (db.prepare("SELECT ext_id FROM records WHERE source='api' AND date_utc >= ?").all(from) as { ext_id: string }[]).map((r) => r.ext_id);
    if (local.length && !remote.size) glitches++;
    const del = db.prepare("DELETE FROM records WHERE source='api' AND ext_id=?");
    for (const id of toDelete(local, remote)) deleted += Number(del.run(id).changes);
  }
  db.prepare("INSERT OR REPLACE INTO sync_state (key, value) VALUES ('last_sync', ?)").run(new Date().toISOString());
  runPipeline();
  console.log(`windows ${windows}, inserted ${inserted}, updated ${updated}, deleted ${deleted}, accounts ${accounts}, categories ${categories}${glitches ? `, WARNING ${glitches} empty window(s) skipped` : ''}`);
  return { inserted, updated, deleted };
}

let running: ReturnType<typeof sync> | undefined;
// Manual Fetch and the scheduler share one in-flight sync.
export const syncOnce = (): ReturnType<typeof sync> => (running ??= sync().finally(() => (running = undefined)));

export const lastSync = (): string | null =>
  (db.prepare("SELECT value FROM sync_state WHERE key='last_sync'").get() as { value: string } | undefined)?.value ?? null;

if (import.meta.main) await sync({ full: process.argv.includes('--full') });
