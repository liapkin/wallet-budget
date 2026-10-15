import type { CryptoHolding } from './crypto.ts';

/** Quoted-CSV reader: handles "" escapes, commas and newlines inside quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') cell += c;
      else if (text[i + 1] === '"') cell += text[i++];
      else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows;
}

const num = (s: string): number => Number(s.replace(/[,%\s]/g, ''));
const near = (a: number, b: number): boolean => Math.abs(a - b) <= 1e-8 * Math.max(1, Math.abs(a));

type Buy = { date: string; amount: number };
type Token = { net: number; buys: Buy[] };

/** Table after the row whose first cell is `first`, as objects keyed by header name; stops at a blank row. */
function table(text: string, first: string): Record<string, string>[] {
  const rows = parseCsv(text);
  const at = rows.findIndex((r) => r[0]?.trim().startsWith(first));
  if (at < 0) throw new Error(`header row starting with "${first}" not found`);
  const head = rows[at].map((h) => h.trim());
  const out: Record<string, string>[] = [];
  for (const r of rows.slice(at + 1)) {
    if (r.every((c) => !c.trim())) break;
    out.push(Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
  }
  return out;
}

const col = (row: Record<string, string>, prefix: string): string => {
  const k = Object.keys(row).find((h) => h.startsWith(prefix));
  if (!k) throw new Error(`column "${prefix}" not found`);
  return row[k];
};

function tokens(transactions: string): Map<string, Token> {
  const out = new Map<string, Token>();
  for (const r of table(transactions, 'Date')) {
    const type = col(r, 'Type').toLowerCase();
    if (type !== 'buy' && type !== 'sell') throw new Error(`unknown transaction type "${col(r, 'Type')}"`);
    const symbol = col(r, 'Token').toUpperCase();
    const amount = num(col(r, 'Amount'));
    const t = out.get(symbol) ?? { net: 0, buys: [] };
    t.net += type === 'buy' ? amount : -amount;
    if (type === 'buy') t.buys.push({ date: col(r, 'Date').slice(0, 10), amount });
    out.set(symbol, t);
  }
  return out;
}

/** Unique YYYY-MM-DD dates of buys, i.e. the USD->EUR rates importCmc needs. */
export const buyDates = (transactions: string): string[] => [
  ...new Set([...tokens(transactions).values()].flatMap((t) => t.buys.map((b) => b.date))),
];

/**
 * Holdings from a CoinMarketCap portfolio export. Overview rows have names only, so each is matched to a
 * transaction token by net amount. Paid = CMC's average buy price x amount, converted to EUR at each buy
 * date's rate, weighted by buy size. Transaction price/total columns are not used.
 */
export function importCmc(overview: string, transactions: string, tag: string, usdToEur: Record<string, number>): CryptoHolding[] {
  const left = new Map(tokens(transactions));
  const out: CryptoHolding[] = [];
  const unmatched: string[] = [];
  for (const r of table(overview, 'Name')) {
    const amount = num(col(r, 'Amount'));
    const hit = [...left].find(([, t]) => near(t.net, amount));
    if (!hit) {
      unmatched.push(col(r, 'Name'));
      continue;
    }
    left.delete(hit[0]);
    const total = hit[1].buys.reduce((s, b) => s + b.amount, 0);
    if (!total) throw new Error(`${hit[0]} has no buys`);
    let rate = 0;
    for (const b of hit[1].buys) {
      const x = usdToEur[b.date];
      if (!x) throw new Error(`no USD->EUR rate for ${b.date}`);
      rate += (b.amount / total) * x;
    }
    out.push({ symbol: hit[0], amount, paid: Math.round(amount * num(col(r, 'Avg Buy Price')) * rate * 100), tag });
  }
  if (unmatched.length) throw new Error(`no transactions match the amount of: ${unmatched.join(', ')}`);
  return out;
}
