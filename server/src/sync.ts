import { db } from './db.ts';
import { get, pages } from './wallet.ts';
import { runPipeline } from './pipeline.ts';
import { toCents } from '../../shared/src/money.ts';

const day = (d: Date): string => d.toISOString().slice(0, 10);

// The API has no payment type: bank-feed records are TRANSFER, phone entries MOBILE_PAYMENT, the rest CASH.
const paymentType = (r: any): string =>
  r.source === 'backend' || r.accountIsBankSync ? 'TRANSFER' : r.source === 'android' || r.source === 'ios' ? 'MOBILE_PAYMENT' : 'CASH';

// The API renames some categories the export names differently; keep the export names so the category map matches.
const CATEGORY_ALIAS: Record<string, string> = {
  'Restaurants & fast food': 'Restaurant, fast-food', 'Bar cafe': 'Bar, cafe', 'Holidays, trips, hotels': 'Holiday, trips, hotels',
  'Unknown expense': 'Unknown Expense', 'Phone, cell phones': 'Phone, cell phone', 'Electronics & accessories': 'Electronics, accessories',
  'Home & garden': 'Home, garden', 'Energy & utilities': 'Energy, utilities', Drugstore: 'Drug-store, chemist',
  'Charges, fees': 'Charges, Fees', 'Health care & doctor': 'Health care, doctor', 'Wellness & beauty': 'Wellness, beauty',
  'Gifts & joy': 'Gifts, joy', 'Education & development': 'Education, development',
  'Books, audio, subscription': 'Books, audio, subscriptions', 'Fin. investments': 'Financial investments',
};

export async function sync(): Promise<{ inserted: number }> {
  const state = db.prepare("SELECT value FROM sync_state WHERE key='last_date'").get() as { value: string } | undefined;
  const start = state ? new Date(Date.parse(state.value) - 8 * 864e5) : new Date('2017-01-01');
  const end = new Date(Date.now() + 864e5);

  let accounts = 0;
  const upAcc = db.prepare('INSERT OR REPLACE INTO accounts (id, name, balance_cents, currency, updated_at) VALUES (?, ?, ?, ?, ?)');
  for await (const a of pages<any>('/v1/api/accounts', 'accounts')) {
    accounts++;
    const bal = a.balance?.currentBalance;
    upAcc.run(a.id, a.name, bal == null ? null : toCents(bal), a.currencyCode, new Date().toISOString());
  }

  const ins = db.prepare(
    `INSERT OR IGNORE INTO records (source, ext_id, account, category, amount_cents, type, payment_type, note, payee, date_utc, raw_json)
     VALUES ('api', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const save = db.prepare("INSERT OR REPLACE INTO sync_state (key, value) VALUES ('last_date', ?)");
  let windows = 0, fetched = 0, inserted = 0;
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
        fetched++;
        const c = r.convertedAmount;
        const eur = c?.currencyCode === 'EUR' && c.value != null ? c.value : r.amount.currencyCode === 'EUR' ? r.amount.value : null;
        if (eur == null) throw new Error(`no EUR amount for record in ${r.amount.currencyCode}`);
        inserted += ins.run(
          r.id, r.accountName, CATEGORY_ALIAS[r.category?.name] ?? r.category?.name ?? '', toCents(eur), r.recordType === 'income' ? 'Income' : 'Expenses',
          paymentType(r), r.note ?? '', r.counterParty ?? '', new Date(r.recordDate).toISOString(), JSON.stringify(r),
        ).changes as number;
      }
      save.run(day(new Date(Math.min(to.getTime(), Date.now()))));
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    from = to;
  }
  runPipeline();
  console.log(`windows ${windows}, fetched ${fetched}, inserted ${inserted}, accounts ${accounts}`);
  return { inserted };
}

if (import.meta.main) await sync();
