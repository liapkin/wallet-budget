const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens', year: 'numeric', month: '2-digit' });

export const athensMonth = (isoUtc: string): string => {
  const p = f.formatToParts(new Date(isoUtc));
  return `${p.find((x) => x.type === 'year')!.value}-${p.find((x) => x.type === 'month')!.value}`;
};

const full = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Athens', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens' });

/** Athens calendar day (YYYY-MM-DD) of an ISO instant, default now. */
export const athensDay = (iso?: string): string => dayFmt.format(iso ? new Date(iso) : new Date());

// Athens wall clock minus UTC, in ms, at instant t.
const offsetAt = (t: number): number => {
  const v = Object.fromEntries(full.formatToParts(new Date(t)).map((x) => [x.type, parseInt(x.value)]));
  return Date.UTC(v['year'], v['month'] - 1, v['day'], v['hour'], v['minute'], v['second']) - t;
};

export const athensLocalToUtc = (y: number, mo: number, d: number, h: number, mi: number, s: number): string => {
  const guess = Date.UTC(y, mo - 1, d, h, mi, Math.round(s));
  const offset = offsetAt(guess);
  const offset2 = offsetAt(guess - offset); // recompute at the result to handle DST edges
  return new Date(guess - (offset2 !== offset ? offset2 : offset)).toISOString();
};
