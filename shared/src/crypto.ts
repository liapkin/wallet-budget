import type { Config } from './types.ts';

export type CryptoHolding = Config['investing']['crypto'][number];
/** Latest quote per uppercase symbol; price in integer cents, pct24h as a plain number (4.35 = 4.35%). */
export type CryptoQuotes = Record<string, { priceCents: number; pct24h: number }>;
export type CryptoSnapshotRow = { ts: string; symbol: string; amount: number; priceCents: number };

export type CryptoCoin = {
  symbol: string; tag: string; amount: number; paidCents: number;
  priceCents: number | null; valueCents: number | null; pct24h: number | null;
  profitCents: number | null; profitPct: number | null; allocationPct: number | null;
};
export type CryptoTag = { tag: string; valueCents: number; paidCents: number; profitCents: number; profitPct: number | null };
export type CryptoSummary = {
  coins: CryptoCoin[];
  totals: { valueCents: number; paidCents: number; profitCents: number; profitPct: number | null; pct24h: number | null };
  best: CryptoCoin | null;
  worst: CryptoCoin | null;
  tags: CryptoTag[];
};

const pct = (part: number, whole: number): number | null => (whole ? (part / whole) * 100 : null);

export function holdingsSummary(holdings: CryptoHolding[], latest: CryptoQuotes): CryptoSummary {
  const coins: CryptoCoin[] = holdings.map((h) => {
    const q = latest[h.symbol.toUpperCase()];
    const valueCents = q ? Math.round(h.amount * q.priceCents) : null;
    const profitCents = valueCents === null ? null : valueCents - h.paid;
    return {
      symbol: h.symbol, tag: h.tag || 'Untagged', amount: h.amount, paidCents: h.paid,
      priceCents: q?.priceCents ?? null, valueCents, pct24h: q?.pct24h ?? null,
      profitCents, profitPct: profitCents === null ? null : pct(profitCents, h.paid), allocationPct: null,
    };
  });
  const priced = coins.filter((c) => c.valueCents !== null);
  const valueCents = priced.reduce((s, c) => s + c.valueCents!, 0);
  const pricedPaid = priced.reduce((s, c) => s + c.paidCents, 0);
  for (const c of priced) c.allocationPct = pct(c.valueCents!, valueCents);
  // Value-weighted: previous value of a coin is value / (1 + pct/100).
  const prev = priced.reduce((s, c) => s + c.valueCents! / (1 + c.pct24h! / 100), 0);
  const ranked = priced.filter((c) => c.paidCents > 0).sort((a, b) => b.profitPct! - a.profitPct!);
  const tags = new Map<string, CryptoTag>();
  for (const c of priced) {
    const t = tags.get(c.tag) ?? { tag: c.tag, valueCents: 0, paidCents: 0, profitCents: 0, profitPct: null };
    t.valueCents += c.valueCents!;
    t.paidCents += c.paidCents;
    t.profitCents += c.profitCents!;
    tags.set(c.tag, t);
  }
  for (const t of tags.values()) t.profitPct = pct(t.profitCents, t.paidCents);
  return {
    coins,
    totals: {
      valueCents, paidCents: coins.reduce((s, c) => s + c.paidCents, 0), profitCents: valueCents - pricedPaid,
      profitPct: pct(valueCents - pricedPaid, pricedPaid), pct24h: prev ? (valueCents / prev - 1) * 100 : null,
    },
    best: ranked[0] ?? null,
    worst: ranked.length ? ranked[ranked.length - 1] : null,
    tags: [...tags.values()],
  };
}

export function holdingsHistory(rows: CryptoSnapshotRow[]): { ts: string; cents: number }[] {
  const byTs = new Map<string, number>();
  for (const r of rows) byTs.set(r.ts, (byTs.get(r.ts) ?? 0) + Math.round(r.amount * r.priceCents));
  return [...byTs].map(([ts, cents]) => ({ ts, cents })).sort((a, b) => (a.ts < b.ts ? -1 : 1));
}
