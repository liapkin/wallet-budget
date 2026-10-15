import { db, getConfig, setConfig, tx } from './db.ts';
import { athensDay } from '../../shared/src/month.ts';
import { buyDates, importCmc } from '../../shared/src/crypto-import.ts';
import type { Config } from '../../shared/src/types.ts';
import { secret } from './wallet.ts';

type Holdings = Config['investing']['crypto'];

export type Quotes = Record<string, { price: number; pct24h: number }>;

export const cryptoCents = (holdings: Holdings, quotes: Quotes): number =>
  holdings.reduce((sum, h) => {
    const q = quotes[h.symbol.toUpperCase()];
    if (!q) throw new Error(`no EUR price for ${h.symbol}`);
    return sum + Math.round(h.amount * q.price * 100);
  }, 0);

export const parseQuotes = (json: any): Quotes => {
  const out: Quotes = {};
  for (const [symbol, list] of Object.entries<any>(json?.data ?? {})) {
    const eur = list?.[0]?.quote?.EUR;
    if (typeof eur?.price === 'number') out[symbol] = { price: eur.price, pct24h: eur.percent_change_24h ?? 0 };
  }
  return out;
};

export type Kind = 'crypto' | 'etf';
const LOCAL = { crypto: { id: 'local:crypto', name: 'Crypto' }, etf: { id: 'local:etf', name: 'ETFs' } } as const;

export const parseYahoo = (json: any): { price: number; prevClose: number; currency: string } => {
  const m = json?.chart?.result?.[0]?.meta;
  if (typeof m?.regularMarketPrice !== 'number' || typeof m?.chartPreviousClose !== 'number' || typeof m?.currency !== 'string') throw new Error('unexpected Yahoo response');
  return { price: m.regularMarketPrice, prevClose: m.chartPreviousClose, currency: m.currency };
};

export const pct24h = (price: number, prevClose: number): number => (price / prevClose - 1) * 100;

export async function rateToEur(from: string, date = 'latest'): Promise<number> {
  const res = await fetch(`https://api.frankfurter.app/${date}?from=${from}&to=EUR`);
  if (!res.ok) throw new Error(`Frankfurter ${res.status} ${res.statusText} for ${date}`);
  return ((await res.json()) as { rates: { EUR: number } }).rates.EUR;
}

export async function fetchEtfMarket(symbol: string): Promise<{ price: number; prevClose: number; currency: string }> {
  const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  if (!res.ok) throw new Error(`Yahoo ${res.status} ${res.statusText} for ${symbol}`);
  let { price, prevClose, currency } = parseYahoo(await res.json());
  if (currency === 'GBp') [price, prevClose, currency] = [price / 100, prevClose / 100, 'GBP'];
  return { price, prevClose, currency };
}

export async function fetchEtfQuote(symbol: string): Promise<{ price: number; pct24h: number }> {
  const { price, prevClose, currency } = await fetchEtfMarket(symbol);
  const rate = currency === 'EUR' ? 1 : await rateToEur(currency);
  return { price: price * rate, pct24h: pct24h(price, prevClose) };
}

async function etfQuotes(symbols: string[]): Promise<Quotes> {
  const out: Quotes = {};
  for (const symbol of symbols) {
    out[symbol.toUpperCase()] = await fetchEtfQuote(symbol);
  }
  return out;
}

export async function fetchCryptoQuotes(key: string, symbols: string[]): Promise<Quotes> {
  const res = await fetch(`https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest?symbol=${encodeURIComponent(symbols.join(','))}&convert=EUR`, {
    headers: { 'X-CMC_PRO_API_KEY': key },
  });
  if (!res.ok) throw new Error(`CoinMarketCap ${res.status} ${res.statusText}`);
  return parseQuotes(await res.json());
}

export async function refreshHoldings(kind: Kind): Promise<void> {
  const key = secret('COINMARKETCAP_API_KEY');
  const cfg = getConfig().investing;
  const holdings = kind === 'crypto' ? cfg.crypto : cfg.etfs;
  const local = LOCAL[kind];
  if (kind === 'crypto' && !key) return;
  if (!holdings.length) {
    db.prepare('DELETE FROM accounts WHERE id=?').run(local.id);
    return;
  }
  const symbols = [...new Set(holdings.map((h) => h.symbol.toUpperCase()))];
  const quotes = kind === 'crypto' ? await fetchCryptoQuotes(key!, symbols) : await etfQuotes(symbols);
  saveHoldingQuotes(kind, quotes);
}

export function saveHoldingQuotes(kind: Kind, quotes: Quotes): void {
  const cfg = getConfig().investing;
  const holdings = kind === 'crypto' ? cfg.crypto : cfg.etfs;
  const local = LOCAL[kind];
  if (!holdings.length) {
    db.prepare('DELETE FROM accounts WHERE id=?').run(local.id);
    return;
  }
  const cents = cryptoCents(holdings, quotes);
  const ts = new Date().toISOString();
  const snap = db.prepare('INSERT OR REPLACE INTO crypto_snapshots (ts, symbol, amount, price_cents, pct24h, kind) VALUES (?, ?, ?, ?, ?, ?)');
  // the same symbol can sit under several tags; snapshots are one row per symbol
  const amounts = new Map<string, number>();
  for (const h of holdings) amounts.set(h.symbol.toUpperCase(), (amounts.get(h.symbol.toUpperCase()) ?? 0) + h.amount);
  tx(() => {
    for (const [symbol, amount] of amounts) snap.run(ts, symbol, amount, Math.round(quotes[symbol].price * 100), quotes[symbol].pct24h, kind);
    db.prepare('INSERT OR REPLACE INTO accounts (id, name, balance_cents, currency, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(local.id, local.name, cents, 'EUR', ts);
    db.prepare('INSERT OR REPLACE INTO balance_snapshots (day, account, balance_cents) VALUES (?, ?, ?)').run(athensDay(), local.name, cents);
  });
}

export async function usdToEur(dates: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const d of new Set(dates)) out[d] = await rateToEur('USD', d);
  return out;
}

/** Replaces holdings with this tag by the CoinMarketCap export; other tags are kept. */
export async function importCrypto({ overview, transactions, tag }: { overview: string; transactions: string; tag: string }): Promise<void> {
  const holdings = importCmc(overview, transactions, tag, await usdToEur(buyDates(transactions)));
  const cfg = getConfig();
  setConfig({ ...cfg, investing: { ...cfg.investing, crypto: [...cfg.investing.crypto.filter((h) => h.tag !== tag), ...holdings] } });
  await refreshHoldings('crypto');
}
