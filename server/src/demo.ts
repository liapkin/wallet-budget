// Builds data/demo.db with deterministic mock data. Generic values only; nothing here comes from real accounts.
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..', '..');
const dbFile = join(root, 'data', 'demo.db');
for (const f of [dbFile, `${dbFile}-wal`, `${dbFile}-shm`]) if (existsSync(f)) rmSync(f);
process.env.DEMO = '1';
process.env.BUDGET_DB = dbFile;
const { db, setConfig } = await import('./db.ts');
const { runPipeline } = await import('./pipeline.ts');
const { seedToConfig } = await import('../../shared/src/seed.ts');
const { athensLocalToUtc, athensMonth } = await import('../../shared/src/month.ts');

const cfg = seedToConfig(JSON.parse(readFileSync(join(root, 'config', 'seed-config.example.json'), 'utf8')));
cfg.currency = 'USD';
cfg.income = { netSalaryPerMonth: 800000, salariesPerYear: 12, bonusMonths: { december: 0.25 }, bonusesGoToInvesting: true };
cfg.coreExpenses = [
  { key: 'rent', label: 'Rent', plan: 210000, source: 'manual' },
  { key: 'utilities', label: 'Utilities & internet', plan: 30000, source: 'manual' },
  { key: 'household', label: 'Household supplies', plan: 8000, source: 'manual' },
  { key: 'groceries', label: 'Groceries', plan: 65000, source: 'wallet:Groceries' },
  { key: 'gym', label: 'Gym', plan: 6000, source: 'manual', standing: true },
  { key: 'phone', label: 'Mobile plans', plan: 9000, source: 'manual' },
  { key: 'transport', label: 'Fuel & transit', plan: 24000, source: 'wallet:Fuel+Transport' },
  { key: 'car', label: 'Car payment & insurance', plan: 62000, source: 'manual' },
  { key: 'health', label: 'Health care', plan: 25000, source: 'manual' },
  { key: 'studentLoan', label: 'Student loan', plan: 30000, source: 'manual' },
  { key: 'training', label: 'Extra classes', plan: 9000, source: 'manual', standing: false, inPlan: false },
];
cfg.allocation.funPerMonth = 60000;
cfg.allocation.sinkingFundTopUpPerMonth = 50000;
cfg.allocation.bankSavings = 2400000;
cfg.allocation.annualIrregulars = 400000;
cfg.allocation.coveredByCoreGroups = ['Housing', 'Car', 'Health', 'Taxes & insurance', 'Loan'];
cfg.caps = { ...cfg.caps, applyFrom: '2025-01-01', takeoutPerMonth: 18000, kioskPerMonth: 6000, note: 'Fictional US household. Both caps come out of Fun.' };
cfg.investing.houseTarget = { propertyPrice: 35000000, depositShare: 0.2, purchaseCostsShare: 0.04, note: 'Fictional US starter-home target' };
cfg.investing.tradingCostPerYear = 0;
cfg.wallet.merchantKeywords = [
  { keyword: 'DELIVERY ORDER', group: 'Takeout' },
  { keyword: 'MARKET', group: 'Groceries' },
  { keyword: 'CONVENIENCE', group: 'Kiosk' },
  { keyword: 'ATM ', group: 'Cash withdrawal' },
  { keyword: 'Top-Up by', group: 'Transfer' },
];
for (const item of [...cfg.groceryList.weekly, ...cfg.groceryList.pantryMonthly]) {
  item.regularPrice = Math.round(item.regularPrice * 1.5);
  if (item.offerPrice !== null) item.offerPrice = Math.round(item.offerPrice * 1.5);
  item.where = item.where === 'Market' ? 'Farmers market' : item.where;
  item.note = 'Fictional US price estimate';
}
cfg.allocation.savingsAccounts = ['Savings'];
cfg.allocation.investmentAccounts = ['Broker'];
cfg.allocation.payrollAccount = 'Main Bank';
setConfig(cfg);
const monthlyInvesting = cfg.income.netSalaryPerMonth - cfg.coreExpenses.filter((line) => line.inPlan !== false).reduce((sum, line) => sum + line.plan, 0) - cfg.allocation.funPerMonth - cfg.allocation.sinkingFundTopUpPerMonth;

const accounts: [string, number][] = [['Main Bank', 645050], ['Savings', 2400000], ['Cash', 15000], ['Credit Card', -86430], ['Broker', 5200000]];
const insAcc = db.prepare("INSERT INTO accounts (id, name, balance_cents, currency, updated_at) VALUES (?, ?, ?, 'USD', ?)");
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
function add(y: number, m: number, d: number, dollars: number, category: string, note: string, o: Opt = {}) {
  const dim = new Date(y, m, 0).getDate();
  d = Math.min(d, dim);
  if (y * 10000 + m * 100 + d > today) return;
  const cents = Math.round(dollars * 100);
  const date = athensLocalToUtc(y, m, d, Math.floor(between(8, 22)), Math.floor(between(0, 60)), 0);
  ins.run(`demo:${++n}`, o.account ?? 'Main Bank', category, o.income ? cents : -cents, o.income ? 'Income' : 'Expenses', o.pay ?? 'TRANSFER', note, date);
}
// card purchase that the bank feed also reports a few days later
function doubled(y: number, m: number, d: number, dollars: number, category: string, note: string) {
  add(y, m, d, dollars, category, note, { pay: 'MOBILE_PAYMENT' });
  add(y, m, d + 1 + Math.floor(rnd() * 5), dollars, category, note);
}

for (let i = 17; i >= 0; i--) {
  const idx = cy * 12 + cm - 1 - i;
  const y = Math.floor(idx / 12), m = (idx % 12) + 1;
  const summer = m >= 6 && m <= 8;
  const recent = i < 7;

  for (let w = 0; w < 4; w++)
    for (let k = 0, c = 2 + Math.floor(rnd() * 2); k < c; k++) {
      const d = w * 7 + 1 + Math.floor(rnd() * 7), dollars = between(35, 85);
      const note = pick(['NEIGHBORHOOD MARKET', 'RIVER MARKET', 'VALUE MARKET', 'CENTRAL MARKET']) + ' RIVERDALE';
      if (recent && rnd() < 0.08) doubled(y, m, d, dollars, 'Groceries', note);
      else add(y, m, d, dollars, 'Groceries', note);
    }
  for (let k = 0, c = 3 + Math.floor(rnd() * 3); k < c; k++) {
    const dollars = between(25, 48), d = 1 + Math.floor(rnd() * 28);
    if (recent && k === 0) doubled(y, m, d, dollars, 'Restaurant, fast-food', pick(['PIZZA DELIVERY ORDER', 'BURGER DELIVERY ORDER']));
    else add(y, m, d, dollars, 'Restaurant, fast-food', pick(['PIZZA DELIVERY ORDER', 'BURGER DELIVERY ORDER']));
  }
  for (let k = 0, c = 4 + Math.floor(rnd() * 4); k < c; k++) add(y, m, 1 + Math.floor(rnd() * 28), between(6, 32), pick(['Bar, cafe', 'Restaurant, fast-food']), pick(['CAFE CENTRAL', 'CORNER BAKERY', 'NORTHSIDE DINER', 'RIVER GRILL']), rnd() < 0.3 ? { pay: 'MOBILE_PAYMENT' } : {});
  for (let k = 0, c = 6 + Math.floor(rnd() * 5); k < c; k++) add(y, m, 1 + Math.floor(rnd() * 28), between(3, 9), 'Food & Drinks', 'CONVENIENCE ' + pick(['CENTRAL', 'SQUARE', 'STATION']), { account: 'Cash', pay: 'CASH' });
  for (const d of [6, 20]) add(y, m, d, between(65, 90), 'Fuel', pick(['FUEL STATION NORTH', 'FUEL STATION RING']), { account: 'Credit Card' });
  add(y, m, 2, 75, 'Public transport', 'MONTHLY TRANSIT PASS');
  add(y, m, 1, 2100, 'Rent', 'RIVERDALE APARTMENT RENT');
  add(y, m, 8, between(summer ? 160 : 110, summer ? 215 : 165), 'Energy, utilities', 'ELECTRICITY PROVIDER');
  add(y, m, 9, 45, 'Energy, utilities', 'WATER UTILITY');
  add(y, m, 10, 70, 'Internet', 'HOME INTERNET');
  add(y, m, 12, 90, 'Phone, cell phone', 'MOBILE PLANS');
  add(y, m, 3, 60, 'Active sport, fitness', 'GYM MEMBERSHIP');
  add(y, m, 5, 17.99, 'Books, audio, subscriptions', 'STREAMING SERVICE', { account: 'Credit Card' });
  add(y, m, 5, 9.99, 'Software, apps, games', 'CLOUD STORAGE', { account: 'Credit Card' });
  add(y, m, 4, 450, 'Vehicle', 'CAR PAYMENT');
  add(y, m, 7, 170, 'Insurances', 'CAR INSURANCE');
  add(y, m, 11, 300, 'Loan, interests', 'STUDENT LOAN PAYMENT');
  add(y, m, 13, 250, 'Health care, doctor', 'HEALTH COVERAGE');
  if (rnd() < 0.5) add(y, m, 1 + Math.floor(rnd() * 28), between(45, 180), pick(['Clothes & shoes', 'Electronics, accessories', 'Home, garden', 'Gifts, joy']), pick(['FASHION STORE', 'TECH SHOP', 'HOME STORE', 'GIFT SHOP']), { account: 'Credit Card' });
  if (rnd() < 0.3) add(y, m, 1 + Math.floor(rnd() * 28), between(25, 95), pick(['Health care, doctor', 'Drug-store, chemist']), pick(['PHARMACY', 'MEDICAL CENTER']));
  if (rnd() < 0.35) add(y, m, 1 + Math.floor(rnd() * 28), between(25, 80), 'Culture, sport events', pick(['MOVIE THEATER', 'CONCERT TICKETS']));
  if (summer || m === 12) add(y, m, 10 + Math.floor(rnd() * 15), between(250, 700), 'Holiday, trips, hotels', summer ? 'LAKESIDE HOTEL' : 'HOLIDAY ROAD TRIP');
  if (rnd() < 0.15) add(y, m, 1 + Math.floor(rnd() * 28), between(80, 250), 'Vehicle maintenance', 'GARAGE SERVICE');

  add(y, m, 14, 4000, 'Salary', 'HOUSEHOLD PAYCHECK ACME INC', { income: true });
  add(y, m, 28, 4000, 'Salary', 'HOUSEHOLD PAYCHECK ACME INC', { income: true });
  const bonus = Object.entries(cfg.income.bonusMonths).find(([k]) => new Date(2000, m - 1).toLocaleString('en', { month: 'long' }).toLowerCase() === k)?.[1];
  if (bonus) add(y, m, 28, 8000 * bonus, 'Salary', 'BONUS ACME INC', { income: true });
  add(y, m, 29, monthlyInvesting / 100 + 8000 * (bonus ?? 0), 'Financial investments', 'BROKER MONTHLY TRANSFER');
  if (rnd() < 0.4) add(y, m, 14, 200, 'Withdrawal', 'ATM 4471 RIVERDALE', { account: 'Main Bank' });
  if (m % 3 === 0) {
    add(y, m, 16, 500, 'Transfer', 'Top-Up by Main Bank');
    add(y, m, 16, 500, 'Transfer', 'Top-Up by Main Bank', { account: 'Savings', income: true });
  }
  if (rnd() < 0.4) add(y, m, 1 + Math.floor(rnd() * 28), between(5, 40), 'Unknown Expense', pick(['MISC PAYMENT', 'CARD PAYMENT 0042']));
}

const act = db.prepare('INSERT OR REPLACE INTO core_actuals (month, key, cents) VALUES (?, ?, ?)');
for (let i = 17; i >= 1; i--) {
  const idx = cy * 12 + cm - 1 - i;
  const month = `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
  const m = (idx % 12) + 1;
  act.run(month, 'rent', 210000);
  act.run(month, 'utilities', Math.round(between(m >= 6 && m <= 8 ? 27500 : 22500, m >= 6 && m <= 8 ? 33000 : 28500)));
  act.run(month, 'household', Math.round(between(6000, 11000)));
  act.run(month, 'gym', 6000);
  act.run(month, 'phone', 9000);
  act.run(month, 'car', 62000);
  act.run(month, 'health', 25000);
  act.run(month, 'studentLoan', 30000);
  if (rnd() < 0.25) act.run(month, 'training', 9000);
}

runPipeline();
const c = db.prepare('SELECT COUNT(*) AS n, SUM(is_dup) AS d, SUM(grp=\'Other\') AS o FROM records').get() as { n: number; d: number; o: number };
console.log(`demo.db: ${c.n} records, ${c.d} duplicates, ${c.o} unclassified, ${accounts.length} accounts`);
