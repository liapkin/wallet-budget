export type ProjectionParams = {
  annualInvesting: number; // cents
  years?: number;
  grossReturn: number;
  ter: number;
  inflation: number;
  tradingCostPerYear: number; // cents
  netSalaryGrowth: number;
  houseFundFirst: boolean;
  houseFundReturn: number;
  houseCash: number; // cents
};

export type ProjectionRow = { year: number; contribution: number; etf: number; houseFund: number; total: number; real: number };

export function project(p: ProjectionParams): { rows: ProjectionRow[]; coversHouseYear: number | null } {
  const r = p.grossReturn - p.ter;
  // ponytail: floats inside the compounding (inherent); rounded to integer cents in returned rows.
  let etf = 0;
  let house = 0;
  let covers: number | null = null;
  const rows: ProjectionRow[] = [];
  for (let n = 1; n <= (p.years ?? 15); n++) {
    const c = p.annualInvesting * (1 + p.netSalaryGrowth) ** (n - 1) - p.tradingCostPerYear;
    const toHouse = p.houseFundFirst && house < p.houseCash;
    house = house * (1 + p.houseFundReturn) + (toHouse ? c * (1 + p.houseFundReturn / 2) : 0);
    etf = etf * (1 + r) + (toHouse ? 0 : c * (1 + r / 2));
    const total = etf + house;
    if (covers === null && total >= p.houseCash) covers = n;
    rows.push({
      year: n,
      contribution: Math.round(c),
      etf: Math.round(etf),
      houseFund: Math.round(house),
      total: Math.round(total),
      real: Math.round(total / (1 + p.inflation) ** n),
    });
  }
  return { rows, coversHouseYear: covers };
}
