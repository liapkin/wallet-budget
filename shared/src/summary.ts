export type Cell = { cents: number; count: number };
export type Summary = Record<string, Record<string, Cell>>; // period -> group -> cell

export function summarize(rows: { month: string; grp: string; amountCents: number; isDup: boolean }[]): Summary {
  const out: Summary = {};
  for (const r of rows) {
    if (r.isDup) continue;
    const cell = ((out[r.month] ??= {})[r.grp] ??= { cents: 0, count: 0 });
    cell.cents -= r.amountCents;
    cell.count++;
  }
  return out;
}

export function byYear(s: Summary): Summary {
  const out: Summary = {};
  for (const [month, groups] of Object.entries(s)) {
    for (const [g, c] of Object.entries(groups)) {
      const cell = ((out[month.slice(0, 4)] ??= {})[g] ??= { cents: 0, count: 0 });
      cell.cents += c.cents;
      cell.count += c.count;
    }
  }
  return out;
}
