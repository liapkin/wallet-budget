// Builds data/demo.db with deterministic mock data. Generic values only; nothing here comes from real accounts.
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..', '..');
const dbFile = join(root, 'data', 'demo.db');
for (const f of [dbFile, `${dbFile}-wal`, `${dbFile}-shm`]) if (existsSync(f)) rmSync(f);
process.env.BUDGET_DB = dbFile;
const { db, setConfig } = await import('./db.ts');
const { runPipeline } = await import('./pipeline.ts');
const { seedToConfig } = await import('../../shared/src/seed.ts');
const { athensLocalToUtc, athensMonth } = await import('../../shared/src/month.ts');

const cfg = seedToConfig(JSON.parse(readFileSync(join(root, 'config', 'seed-config.example.json'), 'utf8')));
cfg.allocation.savingsAccounts = ['Savings'];
cfg.allocation.investmentAccounts = ['Broker'];
cfg.allocation.payrollAccount = 'Main Bank';
setConfig(cfg);

const accounts: [string, number][] = [['Main Bank', 184050], ['Savings', 500000], ['Cash', 8500], ['Credit Card', -12030], ['Broker', 1420000]];
const insAcc = db.prepare("INSERT INTO accounts (id, name, balance_cents, currency, updated_at) VALUES (?, ?, ?, 'EUR', ?)");
accounts.forEach(([n, b], i) => insAcc.run(`demo-acc-${i}`, n, b, new Date().toISOString()));

let seed = 20260101;
const rnd = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const between = (a: number, b: number) => a + rnd() * (b - a);
const pick = <T>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)];

const now = new Date();
const today = Number(now.toLocaleDateString('en-CA', { timeZone: 'Europe/Athens' }).replaceAll('-', '').slice(0, 8));
const cur = athensMonth(now.toISOString());
const [cy, cm] = cur.split('-').map(Number);

const ins = db.prepare(
  `INSERT INTO records (source, ext_id, account, category, amount_cents, type, payment_type, note, payee, date_utc, raw_json)
   VALUES ('api', ?, ?, ?, ?, ?, ?, ?, '', ?, '{}')`,
);
let n = 0;
type Opt = { account?: string; pay?: string; income?: boolean };
function add(y: number, m: number, d: number, eur: number, category: string, note: string, o: Opt = {}) {
  const dim = new Date(y, m, 0).getDate();
  d = Math.min(d, dim);
  if (y * 10000 + m * 100 + d > today) return;
  const cents = Math.round(eur * 100);
  const date = athensLocalToUtc(y, m, d, Math.floor(between(8, 22)), Math.floor(between(0, 60)), 0);
  ins.run(`demo:${++n}`, o.account ?? 'Main Bank', category, o.income ? cents : -cents, o.income ? 'Income' : 'Expenses', o.pay ?? 'TRANSFER', note, date);
}
// card purchase that the bank feed also reports a few days later
function doubled(y: number, m: number, d: number, eur: number, category: string, note: string) {
  add(y, m, d, eur, category, note, { pay: 'MOBILE_PAYMENT' });
  add(y, m, d + 1 + Math.floor(rnd() * 5), eur, category, note);
}

for (let i = 17; i >= 0; i--) {
  const idx = cy * 12 + cm - 1 - i;
  const y = Math.floor(idx / 12), m = (idx % 12) + 1;
  const summer = m >= 6 && m <= 8;
  const recent = i < 7;

  for (let w = 0; w < 4; w++)
    for (let k = 0, c = 2 + Math.floor(rnd() * 2); k < c; k++) {
      const d = w * 7 + 1 + Math.floor(rnd() * 7), eur = between(14, 48);
      const note = pick(['LIDL', 'SKLAVENITIS', 'MY MARKET', 'MASOUTIS']) + ' ATHENS';
      if (recent && rnd() < 0.08) doubled(y, m, d, eur, 'Groceries', note);
      else add(y, m, d, eur, 'Groceries', note);
    }
  for (let k = 0, c = 3 + Math.floor(rnd() * 3); k < c; k++) {
    const eur = between(9, 24), d = 1 + Math.floor(rnd() * 28);
    if (recent && k === 0) doubled(y, m, d, eur, 'Restaurant, fast-food', pick(['EFOOD ORDER', 'WOLT ORDER']));
    else add(y, m, d, eur, 'Restaurant, fast-food', pick(['EFOOD ORDER', 'WOLT ORDER']));
  }
  for (let k = 0, c = 4 + Math.floor(rnd() * 4); k < c; k++) add(y, m, 1 + Math.floor(rnd() * 28), between(2.5, 14), pick(['Bar, cafe', 'Restaurant, fast-food']), pick(['CAFE CENTRAL', 'BAKERY CORNER', 'BISTRO NORTH', 'TAVERNA PLAKA']), rnd() < 0.3 ? { pay: 'MOBILE_PAYMENT' } : {});
  for (let k = 0, c = 6 + Math.floor(rnd() * 5); k < c; k++) add(y, m, 1 + Math.floor(rnd() * 28), between(1.5, 6), 'Food & Drinks', 'KIOSK ' + pick(['CENTRAL', 'SQUARE', 'STATION']), { account: 'Cash', pay: 'CASH' });
  for (const d of [6, 20]) add(y, m, d, between(30, 48), 'Fuel', pick(['FUEL STATION NORTH', 'FUEL STATION RING']), { account: 'Credit Card' });
  add(y, m, 2, 20, 'Public transport', 'MONTHLY TRANSPORT TICKET');
  add(y, m, 1, 500, 'Rent', 'RENT');
  add(y, m, 8, between(summer ? 85 : 45, summer ? 120 : 80), 'Energy, utilities', 'ELECTRICITY PROVIDER');
  add(y, m, 9, 14, 'Energy, utilities', 'WATER UTILITY');
  add(y, m, 10, 29.9, 'Internet', 'HOME INTERNET');
  add(y, m, 12, 20, 'Phone, cell phone', 'MOBILE PLAN');
  add(y, m, 3, 40, 'Active sport, fitness', 'GYM MEMBERSHIP');
  add(y, m, 5, 11.99, 'Books, audio, subscriptions', 'STREAMING SERVICE', { account: 'Credit Card' });
  add(y, m, 5, 9.99, 'Software, apps, games', 'CLOUD STORAGE', { account: 'Credit Card' });
  if (rnd() < 0.5) add(y, m, 1 + Math.floor(rnd() * 28), between(25, 110), pick(['Clothes & shoes', 'Electronics, accessories', 'Home, garden', 'Gifts, joy']), pick(['FASHION STORE', 'TECH SHOP', 'HOME STORE', 'GIFT SHOP']), { account: 'Credit Card' });
  if (rnd() < 0.3) add(y, m, 1 + Math.floor(rnd() * 28), between(20, 70), pick(['Health care, doctor', 'Drug-store, chemist']), pick(['PHARMACY', 'MEDICAL CENTER']));
  if (rnd() < 0.35) add(y, m, 1 + Math.floor(rnd() * 28), between(10, 40), 'Culture, sport events', pick(['CINEMA', 'CONCERT TICKETS']));
  if (summer || m === 12) add(y, m, 10 + Math.floor(rnd() * 15), between(120, 380), 'Holiday, trips, hotels', summer ? 'SEASIDE HOTEL' : 'FESTIVE TRIP');
  if (m === 3) add(y, m, 15, 180, 'Insurances', 'CAR INSURANCE');
  if (rnd() < 0.15) add(y, m, 1 + Math.floor(rnd() * 28), between(40, 120), 'Vehicle maintenance', 'GARAGE SERVICE');

  add(y, m, 28, 2000, 'Salary', 'SALARY ACME LTD', { income: true });
  const bonus = Object.entries(cfg.income.bonusMonths).find(([k]) => new Date(2000, m - 1).toLocaleString('en', { month: 'long' }).toLowerCase() === k)?.[1];
  if (bonus) add(y, m, 28, 2000 * bonus, 'Salary', 'BONUS ACME LTD', { income: true });
  add(y, m, 29, 250 + 2000 * (bonus ?? 0), 'Financial investments', 'BROKER MONTHLY TRANSFER');
  if (rnd() < 0.4) add(y, m, 14, 150, 'Withdrawal', 'ATM 4471 ATHENS', { account: 'Main Bank' });
  if (m % 3 === 0) {
    add(y, m, 16, 300, 'Transfer', 'Top-Up by Main Bank');
    add(y, m, 16, 300, 'Transfer', 'Top-Up by Main Bank', { account: 'Savings', income: true });
  }
  if (rnd() < 0.4) add(y, m, 1 + Math.floor(rnd() * 28), between(5, 40), 'Unknown Expense', pick(['MISC PAYMENT', 'CARD PAYMENT 0042']));
}

const act = db.prepare('INSERT OR REPLACE INTO core_actuals (month, key, cents) VALUES (?, ?, ?)');
for (let i = 17; i >= 1; i--) {
  const idx = cy * 12 + cm - 1 - i;
  const month = `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
  const m = (idx % 12) + 1;
  act.run(month, 'rent', 50000);
  act.run(month, 'utilities', Math.round(between(m >= 6 && m <= 8 ? 11000 : 8000, m >= 6 && m <= 8 ? 14000 : 10500)));
  act.run(month, 'household', Math.round(between(1800, 3800)));
  act.run(month, 'gym', 4000);
  act.run(month, 'phone', 2000);
  if (rnd() < 0.25) act.run(month, 'training', 6000);
}

runPipeline();
const c = db.prepare('SELECT COUNT(*) AS n, SUM(is_dup) AS d, SUM(grp=\'Other\') AS o FROM records').get() as { n: number; d: number; o: number };
console.log(`demo.db: ${c.n} records, ${c.d} duplicates, ${c.o} unclassified, ${accounts.length} accounts`);
