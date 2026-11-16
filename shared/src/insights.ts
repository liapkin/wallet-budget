import type { Summary } from './summary.ts';
import type { Config, Rec } from './types.ts';

const DAY = 86_400_000;

// ---- merchant matching

// lowercase words only: drops card/terminal numbers, #refs and generic payment noise
const NOISE = new Set(['card', 'pos', 'terminal', 'tid', 'visa', 'mastercard', 'payment']);
const words = (note: string): string[] => note.toLowerCase().split(/[^a-zͰ-Ͽ]+/).filter((w) => w.length > 2 && !NOISE.has(w));
// banks mix Greek capitals that look Latin (Μ, Ν, Υ, Χ...) into Latin words; lowercased they render as odd glyphs, so fold them back
const LOOKALIKE: Record<string, string> = { α: 'a', β: 'b', ε: 'e', ζ: 'z', η: 'h', ι: 'i', κ: 'k', μ: 'm', ν: 'n', ο: 'o', ρ: 'p', τ: 't', υ: 'y', χ: 'x' };
const foldWord = (w: string): string => (/[a-z]/.test(w) ? w.replace(/[α-ω]/g, (c) => LOOKALIKE[c] ?? c) : w);
export const merchantOf = (note: string): string => words(note).map(foldWord).join(' ');

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

// ---- month-end close

export type Transfer = { key: 'emergency' | 'sinking' | 'business' | 'invest'; label: string; from: string; to: string; cents: number; gap?: number };

// Priority order; each step is capped by its gap, its monthly cap and what is left on the payroll account.
export function monthClose(cfg: Config, balances: Record<string, number>, status: { investingSoFar: number }): Transfer[] {
  const { payrollAccount: from, investmentAccounts, goals } = cfg.allocation;
  if (!from) return [];
  let left = Math.max(0, balances[from] ?? 0);
  const out: Transfer[] = [];
  const step = (key: Transfer['key'], label: string, to: string, want: number, gap?: number) => {
    if (!to || to === from) return;
    const cents = Math.max(0, Math.min(want, left));
    left -= cents;
    out.push({ key, label, from, to, cents, ...(gap === undefined ? {} : { gap }) });
  };
  const goal = (key: 'emergency' | 'sinking' | 'business', label: string) => {
    const g = goals[key];
    const gap = Math.max(0, g.target - g.accounts.reduce((s, n) => s + (balances[n] ?? 0), 0));
    step(key, label, g.depositTo, Math.min(gap, g.perMonth || Infinity), gap);
  };
  goal('emergency', 'Emergency fund');
  goal('sinking', 'Sinking fund');
  goal('business', 'Business account');
  step('invest', 'Invest the remainder', investmentAccounts[0] ?? '', status.investingSoFar);
  return out;
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
