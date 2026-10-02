const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens', year: 'numeric', month: '2-digit' });

export const athensMonth = (isoUtc: string): string => {
  const p = f.formatToParts(new Date(isoUtc));
  return `${p.find((x) => x.type === 'year')!.value}-${p.find((x) => x.type === 'month')!.value}`;
};

export const athensLocalToUtc = (y: number, mo: number, d: number, h: number, mi: number, s: number): string => {
  const guess = new Date(Date.UTC(y, mo - 1, d, h, mi, Math.round(s)));
  const fmtDate = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Athens',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = fmtDate.formatToParts(guess);
  const getVal = (type: string) => parseInt(parts.find((x) => x.type === type)?.value ?? '0');
  const gy = getVal('year');
  const gmo = getVal('month');
  const gd = getVal('day');
  const gh = getVal('hour');
  const gmi = getVal('minute');
  const gs = getVal('second');
  const offset = Date.UTC(gy, gmo - 1, gd, gh, gmi, gs) - guess.getTime();
  let utc = new Date(guess.getTime() - offset);
  // Recompute offset at utc to handle DST edges
  const parts2 = fmtDate.formatToParts(utc);
  const getVal2 = (type: string) => parseInt(parts2.find((x) => x.type === type)?.value ?? '0');
  const gy2 = getVal2('year');
  const gmo2 = getVal2('month');
  const gd2 = getVal2('day');
  const gh2 = getVal2('hour');
  const gmi2 = getVal2('minute');
  const gs2 = getVal2('second');
  const offset2 = Date.UTC(gy2, gmo2 - 1, gd2, gh2, gmi2, gs2) - utc.getTime();
  if (offset2 !== offset) {
    utc = new Date(guess.getTime() - offset2);
  }
  return utc.toISOString();
};
