import type { Config } from './types.ts';

type Cents = Record<string, number>;

export const coreLines = (cfg: Config) => cfg.coreExpenses.filter((l) => l.inPlan !== false);
export const corePlan = (cfg: Config): number => coreLines(cfg).reduce((a, l) => a + l.plan, 0);

export function allocation(cfg: Config) {
  const { funPerMonth: fun, sinkingFundTopUpPerMonth: sinking } = cfg.allocation;
  const salary = cfg.income.netSalaryPerMonth;
  const core = corePlan(cfg);
  return { salary, core, fun, sinking, investing: salary - core - fun - sinking };
}

export function annualInvesting(cfg: Config): number {
  const bonuses = Object.values(cfg.income.bonusMonths).reduce((a, b) => a + b, 0);
  return allocation(cfg).investing * 12 + (cfg.income.bonusesGoToInvesting ? Math.round(cfg.income.netSalaryPerMonth * bonuses) : 0);
}

export function savings(cfg: Config, balances: Cents) {
  const a = cfg.allocation;
  const total =
    !a.savingsAccounts.length && !a.cashSavings
      ? a.bankSavings
      : a.savingsAccounts.reduce((s, n) => s + (balances[n] ?? 0), 0) + a.cashSavings;
  const emergencyFund = corePlan(cfg) * a.emergencyFundMonthsOfCore;
  return { total, emergencyFund, sinkingFund: Math.max(0, total - emergencyFund) };
}

// month is 'YYYY-MM'; caps.applyFrom is a date 'YYYY-MM-DD'
export function capsFor(month: string, cfg: Config): { Takeout: number; Kiosk: number } | null {
  const c = cfg.caps;
  if ((c.bufferMonth && month === c.bufferMonth) || month < c.applyFrom.slice(0, 7)) return null;
  return { Takeout: c.takeoutPerMonth, Kiosk: c.kioskPerMonth };
}

const walletGroups = (source: string): string[] | null => (source.startsWith('wallet:') ? source.slice(7).split('+') : null);

export function coreActuals(cfg: Config, groupSpend: Cents, typed: Cents) {
  return cfg.coreExpenses
    .filter((l) => l.standing !== false || typed[l.key] !== undefined)
    .map((l) => {
      const groups = walletGroups(l.source);
      const t = typed[l.key];
      const actual = groups ? groups.reduce((s, g) => s + (groupSpend[g] ?? 0), t ?? 0) : (t ?? null);
      return { key: l.key, label: l.label, plan: l.plan, wallet: !!groups, actual };
    });
}

export function monthStatus(cfg: Config, groupSpend: Cents, typed: Cents) {
  const a = cfg.allocation;
  const lines = coreActuals(cfg, groupSpend, typed);
  const sum = (gs: string[]) => gs.reduce((s, g) => s + (groupSpend[g] ?? 0), 0);
  const fed = cfg.coreExpenses.flatMap((l) => walletGroups(l.source) ?? []);
  const skip = new Set([...fed, ...a.funGroups, ...a.coveredByCoreGroups, ...cfg.wallet.excludedGroups, 'Income']);
  const fun = sum(a.funGroups);
  const unplanned = sum(Object.keys(groupSpend).filter((g) => !skip.has(g)));
  const core = lines.reduce((s, l) => s + (l.actual ?? 0), 0);
  const investingSoFar = cfg.income.netSalaryPerMonth - core - fun - unplanned - a.sinkingFundTopUpPerMonth;
  return { lines, core, fun, unplanned, investingSoFar };
}
