import XLSX from 'xlsx';
import * as fs from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { db, requireWalletCurrency } from './db.ts';
import { runPipeline, spendSummary } from './pipeline.ts';
import { toCents, fmt } from '../../shared/src/money.ts';
import { athensLocalToUtc } from '../../shared/src/month.ts';

XLSX.set_fs(fs);

type Row = Record<string, string | number>;

// Wallet exports `date` as an Excel serial; its wall time is Europe/Athens local time.
const serialToIso = (n: number): string => {
  const d = XLSX.SSF.parse_date_code(n);
  return athensLocalToUtc(d.y, d.m, d.d, d.H ?? 0, d.M ?? 0, d.S ?? 0);
};

export function importFile(file: string): void {
  requireWalletCurrency();
  const rows = XLSX.utils.sheet_to_json<Row>(XLSX.readFile(file).Sheets.Records, { raw: true });
  const ins = db.prepare(
    `INSERT OR IGNORE INTO records (source, ext_id, account, category, amount_cents, type, payment_type, note, payee, date_utc, raw_json)
     VALUES ('import', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const seen = new Map<string, number>();
  db.exec('BEGIN');
  try {
    for (const r of rows) {
      if (r.currency !== 'EUR') throw new Error('Wallet exports must contain only EUR records; currency conversion is not supported');
      const h = createHash('sha1')
        .update(JSON.stringify([r.account, r.date, r.amount, r.note, r.type, r.payment_type, r.category]))
        .digest('hex');
      const n = seen.get(h) ?? 0;
      seen.set(h, n + 1);
      ins.run(
        `${h}#${n}`, String(r.account), String(r.category), toCents(Number(r.amount)), String(r.type),
        String(r.payment_type), String(r.note ?? ''), String(r.payee ?? ''), serialToIso(Number(r.date)), JSON.stringify(r),
      );
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  runPipeline();
}

export function report(): void {
  const s = spendSummary();
  const cols = ['Groceries', 'Takeout', 'Takeout#', 'Cafes & eating out', 'Kiosk', 'Kiosk#', 'Work food', 'Fuel', 'Transport'];
  console.log(['2026', ...cols.map((c) => (c.endsWith('#') ? c === 'Takeout#' ? 'Orders' : 'Visits' : c))].join(' | '));
  for (const [label, m] of [['Jul', '2026-07'], ['Aug', '2026-08'], ['Sep', '2026-09']]) {
    const cell = (g: string) => s[m]?.[g] ?? { cents: 0, count: 0 };
    console.log([label, ...cols.map((c) => (c.endsWith('#') ? cell(c.slice(0, -1)).count : fmt(cell(c).cents)))].join(' | '));
  }
  const c = db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(is_dup),0) AS d FROM records').get() as { n: number; d: number };
  console.log(`records: ${c.n}, duplicates: ${c.d}`);
}

if (import.meta.main) {
  const arg = process.argv[2];
  if (!arg) throw new Error('usage: import <file.xls>');
  importFile(resolve(process.env.INIT_CWD ?? process.cwd(), arg));
  report();
}
