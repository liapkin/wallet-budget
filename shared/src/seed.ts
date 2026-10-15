import type { Config } from './types.ts';
import { toCents } from './money.ts';

const MONEY = new Set([
  'netSalaryPerMonth', 'plan', 'funPerMonth', 'target', 'perMonth', 'bankSavings', 'cashSavings',
  'annualIrregulars', 'paid', 'takeoutPerMonth', 'kioskPerMonth', 'tradingCostPerYear', 'propertyPrice', 'regularPrice', 'offerPrice',
]);

const walk = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(walk);
  if (v && typeof v === 'object')
    return Object.fromEntries(
      Object.entries(v).map(([k, x]) => [k, MONEY.has(k) && typeof x === 'number' ? toCents(x) : walk(x)]),
    );
  return v;
};

export const seedToConfig = (json: unknown): Config => {
  const cfg = walk(json) as Config;
  return { ...cfg, currency: cfg.currency ?? 'EUR', investing: cfg.investing && { ...cfg.investing, crypto: (cfg.investing.crypto ?? []).map((h) => ({ ...h, paid: h.paid ?? 0 })), etfs: (cfg.investing.etfs ?? []).map((h) => ({ ...h, paid: h.paid ?? 0 })) }, allocation: cfg.allocation && { ...cfg.allocation, hiddenAccounts: cfg.allocation.hiddenAccounts ?? [] }, wallet: cfg.wallet && { ...cfg.wallet, incomeGroups: cfg.wallet.incomeGroups ?? ['Income'] } };
};
