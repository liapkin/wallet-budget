import { athensMonth } from '../../../shared/src/month.ts';
import { fmt as baseFmt } from '../../../shared/src/money.ts';
import { hidden } from './ui/privacy.ts';

export const fmt = (cents: number) => (hidden() ? '€ ••••' : baseFmt(cents));

const TZ = 'Europe/Athens';
const monthDate = (m: string) => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1, 1));
const monthFmt = (o: Intl.DateTimeFormatOptions) => (m: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...o }).format(monthDate(m));

export const monthLabel = monthFmt({ month: 'long', year: 'numeric' });
export const shortMonth = (m: string) => monthFmt({ month: 'short' })(m) + ' ' + m.slice(2, 4);

export const dayLabel = (isoUtc: string) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(isoUtc)).map((x) => [x.type, x.value]),
  );
  return `${p['weekday']} ${p['day']} ${p['month']}, ${p['hour']}:${p['minute']}`;
};

export const currentMonth = () => athensMonth(new Date().toISOString());

export const addMonths = (m: string, n: number) => {
  const d = monthDate(m);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
};

const GROUP_VAR: Record<string, number> = {
  Groceries: 1, Takeout: 2, 'Cafes & eating out': 3, Kiosk: 4, Fuel: 5, Transport: 6, Housing: 7, Shopping: 8,
};
export const groupColor = (group: string) => `var(${group in GROUP_VAR ? `--c${GROUP_VAR[group]}` : '--c-other'})`;

/** Resolved hex/rgb for Chart.js (canvas cannot use CSS vars). */
export const chartColor = (group: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(groupColor(group).slice(4, -1)).trim();
