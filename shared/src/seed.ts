import type { Config } from './types.ts';
import { toCents } from './money.ts';

const MONEY = new Set([
  'netSalaryPerMonth', 'plan', 'funPerMonth', 'sinkingFundTopUpPerMonth', 'bankSavings', 'cashSavings',
  'annualIrregulars', 'takeoutPerMonth', 'kioskPerMonth', 'tradingCostPerYear', 'propertyPrice', 'businessTarget', 'regularPrice', 'offerPrice',
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
  return { ...cfg, currency: cfg.currency ?? 'EUR' };
};
