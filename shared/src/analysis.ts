import { athensDay } from './month.ts';
import type { Config } from './types.ts';

/** Same rule as the server's spend summary; a refund in a spend group counts as negative spend. */
export const isSpend = (r: { isDup: boolean; type: string; grp: string }, cfg: Config): boolean =>
  !r.isDup && (r.type === 'Expenses' || !cfg.wallet.incomeGroups.includes(r.grp)) && !cfg.wallet.excludedGroups.includes(r.grp);

export function breakdown<T extends { amountCents: number }>(rows: T[], keyOf: (r: T) => string): { key: string; cents: number; count: number }[] {
  const m = new Map<string, { key: string; cents: number; count: number }>();
  for (const r of rows) {
    const e = m.get(keyOf(r)) ?? { key: keyOf(r), cents: 0, count: 0 };
    e.cents -= r.amountCents;
    e.count++;
    m.set(e.key, e);
  }
  return [...m.values()].sort((a, b) => b.cents - a.cents);
}

type Dated = { grp: string; amountCents: number; dateUtc: string };

/** Current month spend per group vs the average of earlier months up to the same Athens day-of-month. Rows must already be spend. */
export function trendToDay(cur: Dated[], prev: Dated[][], day: number): Record<string, { cents: number; avgCents: number }> {
  const out: Record<string, { cents: number; avgCents: number }> = {};
  for (const { key, cents } of breakdown(cur, (r) => r.grp)) out[key] = { cents, avgCents: 0 };
  const sums = new Map<string, number[]>();
  for (const month of prev) {
    const upTo = month.filter((r) => Number(athensDay(r.dateUtc).slice(8)) <= day);
    for (const { key, cents } of breakdown(upTo, (r) => r.grp)) sums.set(key, [...(sums.get(key) ?? []), cents]);
  }
  for (const [g, xs] of sums) {
    out[g] ??= { cents: 0, avgCents: 0 };
    out[g].avgCents = Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
  }
  return out;
}
