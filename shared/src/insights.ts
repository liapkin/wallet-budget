import { savings } from './budget.ts';
import { athensDay } from './month.ts';
import type { Summary } from './summary.ts';
import type { Config, Rec } from './types.ts';

const DAY = 86_400_000;
const dayNum = (d: string): number => Date.parse(d) / DAY;
const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const addDays = (d: string, n: number): string => new Date((dayNum(d) + n) * DAY).toISOString().slice(0, 10);

// ---- recurring costs

// lowercase words only: drops card/terminal numbers, #refs and generic payment noise
const NOISE = new Set(['card', 'pos', 'terminal', 'tid', 'visa', 'mastercard', 'payment']);
const words = (note: string): string[] => note.toLowerCase().split(/[^a-zͰ-Ͽ]+/).filter((w) => w.length > 2 && !NOISE.has(w));
const merchantOf = (note: string): string => words(note).join(' ');

export type Recurring = {
  merchant: string;
  group: string;
  typicalCents: number;
  lastDate: string;
  nextDate: string;
  priceChange?: { fromCents: number; toCents: number };
};

export function recurring(recs: Rec[], groupOf: (r: Rec) => string): Recurring[] {
  const byMerchant = new Map<string, Rec[]>();
  for (const r of recs) {
    const m = merchantOf(r.note);
    if (r.type === 'Expenses' && m) byMerchant.set(m, [...(byMerchant.get(m) ?? []), r]);
  }
  const out: Recurring[] = [];
  for (const [merchant, all] of byMerchant) {
    const rs = all.sort((a, b) => a.dateUtc.localeCompare(b.dateUtc));
    const amounts = rs.map((r) => -r.amountCents);
    const typical = median(amounts.slice(0, -1).length ? amounts.slice(0, -1) : amounts); // history, not the latest charge
    const dates = rs.map((r) => athensDay(r.dateUtc));
    const gaps = dates.slice(1).map((d, i) => dayNum(d) - dayNum(dates[i]));
    const last = amounts[amounts.length - 1];
    // ~monthly: 25-35 days apart; history within 15% of typical, the latest charge within 50% (a price change)
    if (rs.length < 3 || gaps.some((g) => g < 25 || g > 35)) continue;
    if (amounts.slice(0, -1).some((a) => Math.abs(a - typical) > typical * 0.15) || Math.abs(last - typical) > typical * 0.5) continue;
    const lastDate = dates[dates.length - 1];
    out.push({
      merchant,
      group: groupOf(rs[rs.length - 1]),
      typicalCents: typical,
      lastDate,
      nextDate: addDays(lastDate, Math.round((dayNum(lastDate) - dayNum(dates[0])) / gaps.length)),
      ...(Math.abs(last - typical) > typical * 0.01 ? { priceChange: { fromCents: typical, toCents: last } } : {}),
    });
  }
  return out.sort((a, b) => b.typicalCents - a.typicalCents);
}

// ---- possible duplicates

export const pairKey = (a: number, b: number): string => `${Math.min(a, b)}-${Math.max(a, b)}`;

// decided: pairKey set of pairs already linked or ruled out; pass non-dup records
export function possibleDuplicates(recs: Rec[], decided = new Set<string>()): { a: Rec; b: Rec }[] {
  const rs = recs.filter((r) => r.type === 'Expenses').sort((x, y) => x.dateUtc.localeCompare(y.dateUtc));
  const out: { a: Rec; b: Rec }[] = [];
  for (let i = 0; i < rs.length; i++) {
    for (let j = i + 1; j < rs.length; j++) {
      const [a, b] = [rs[i], rs[j]];
      if (Date.parse(b.dateUtc) - Date.parse(a.dateUtc) > 7 * DAY) break;
      const diff = Math.abs(a.amountCents - b.amountCents);
      // within 10 cents and 1% of the larger amount
      if (diff > 10 || diff * 100 > Math.max(Math.abs(a.amountCents), Math.abs(b.amountCents))) continue;
      if (a.account === b.account && a.paymentType === b.paymentType) continue;
      if (!decided.has(pairKey(a.id, b.id))) out.push({ a, b });
    }
  }
  return out;
}

// ---- classification suggestion

const tokens = (note: string): Set<string> => new Set(words(note));

// Jaccard overlap of note words against already classified records; null when nothing overlaps
export function suggestGroup(rec: Rec, classified: { note: string; group: string }[]): { group: string; confidence: number } | null {
  const t = tokens(rec.note);
  let best: { group: string; confidence: number } | null = null;
  for (const c of classified) {
    if (c.group === 'Other') continue;
    const u = tokens(c.note);
    const shared = [...t].filter((w) => u.has(w)).length;
    const score = shared / (t.size + u.size - shared || 1);
    if (shared && score > (best?.confidence ?? 0)) best = { group: c.group, confidence: score };
  }
  return best;
}

// ---- budget alerts

export type AlertLine = { key: string; label: string; spentCents: number; capCents: number };

export function budgetAlerts(lines: AlertLine[], daysLeft: number) {
  return lines.map((l) => {
    const left = l.capCents - l.spentCents;
    const level = l.spentCents >= l.capCents ? 'over' : l.spentCents * 100 >= l.capCents * 80 ? 'near' : 'ok'; // near from 80%
    return { ...l, level: level as 'ok' | 'near' | 'over', perDayCents: left > 0 && daysLeft > 0 ? Math.floor(left / daysLeft) : 0 };
  });
}

// ---- month-end close

export type Transfer = { key: 'invest' | 'business' | 'sinking' | 'emergency'; label: string; from: string; to: string; cents: number };

export function monthClose(cfg: Config, balances: Record<string, number>, status: { investingSoFar: number }): Transfer[] {
  const m = cfg.allocation.monthClose;
  if (!m) return [];
  const t = (key: Transfer['key'], label: string, to: string, cents: number): Transfer => ({ key, label, from: m.payroll, to, cents: Math.max(0, cents) });
  return [
    t('invest', 'Invest the remainder', m.investAccount, status.investingSoFar),
    t('business', 'Top up business account', m.businessAccount, m.businessTarget - (balances[m.businessAccount] ?? 0)),
    t('sinking', 'Sinking fund', m.savingsAccount, cfg.allocation.sinkingFundTopUpPerMonth),
    t('emergency', 'Emergency fund gap', m.emergencyAccount, savings(cfg, balances).emergencyFund - (balances[m.emergencyAccount] ?? 0)),
  ];
}

// ---- year in review

export function yearReview(summary: Summary, year: number, exclude: string[]) {
  const totals = (y: number) => {
    const groups: Record<string, number> = {};
    const months: Record<string, number> = {};
    for (const [month, gs] of Object.entries(summary)) {
      if (!month.startsWith(`${y}-`)) continue;
      for (const [g, c] of Object.entries(gs)) {
        if (exclude.includes(g)) continue;
        groups[g] = (groups[g] ?? 0) + c.cents;
        months[month] = (months[month] ?? 0) + c.cents;
      }
    }
    return { groups, months };
  };
  const cur = totals(year);
  const prev = totals(year - 1);
  const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
  const names = new Set([...Object.keys(cur.groups), ...Object.keys(prev.groups)]);
  const groups = [...names]
    .map((group) => {
      const cents = cur.groups[group] ?? 0;
      const prevCents = prev.groups[group] ?? 0;
      return { group, cents, prevCents, deltaCents: cents - prevCents };
    })
    .sort((a, b) => b.cents - a.cents);
  const ms = Object.entries(cur.months).map(([month, cents]) => ({ month, cents })).sort((a, b) => a.cents - b.cents);
  return {
    year,
    totalCents: sum(cur.groups),
    prevTotalCents: sum(prev.groups),
    groups,
    best: ms[0] ?? null,
    worst: ms[ms.length - 1] ?? null,
  };
}
