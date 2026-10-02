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

/*
 * Group colour tokens (UI dots/chips). The 8 chart groups use their base chart slot; the rest are shades (-l light, -d dark) of a related slot.
 * c1 Groceries, Phone(l), Fees & services(d) | c2 Takeout, Work food(d) | c3 Cafes & eating out, Travel(l), Education(d)
 * c4 Kiosk, Entertainment(l), Subscriptions(d) | c5 Fuel, Car(d), Sport(l) | c6 Transport, Health(d), Personal care(l)
 * c7 Housing, Rent(d), Utilities(l) | c8 Shopping, Gifts & charity(l), Taxes & insurance(d) | income = --good | Other = --c-other
 * Non-spend groups (HOLLOW) use --c-other and render as a ring. Unknown names hash to one of the 24 tokens.
 */
const GROUP_TOKEN: Record<string, string> = {
  Groceries: 'c1', Takeout: 'c2', 'Cafes & eating out': 'c3', Kiosk: 'c4', Fuel: 'c5', Transport: 'c6', Housing: 'c7', Shopping: 'c8',
  'Work food': 'c2-d', Car: 'c5-d', Health: 'c6-d', 'Personal care': 'c6-l', Rent: 'c7-d', Utilities: 'c7-l', Phone: 'c1-l',
  'Gifts & charity': 'c8-l', Entertainment: 'c4-l', Subscriptions: 'c4-d', Sport: 'c5-l', Travel: 'c3-l', Education: 'c3-d',
  'Fees & services': 'c1-d', 'Taxes & insurance': 'c8-d', Income: 'c-income', Other: 'c-other',
};
export const HOLLOW = new Set(['Investing', 'Transfer', 'Cash withdrawal', 'Loan', 'Business tax']);
const TOKENS = [1, 2, 3, 4, 5, 6, 7, 8].flatMap((n) => [`c${n}`, `c${n}-l`, `c${n}-d`]);
const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);

export const groupColor = (group: string) =>
  `var(--${HOLLOW.has(group) ? 'c-other' : (GROUP_TOKEN[group] ?? TOKENS[hash(group) % TOKENS.length])})`;
/** Spread into ComboOption. */
export const groupDot = (group: string) => ({ dot: groupColor(group), hollow: HOLLOW.has(group) });

const CHART_VAR: Record<string, string> = {
  Groceries: 'c1', Takeout: 'c2', 'Cafes & eating out': 'c3', Kiosk: 'c4', Fuel: 'c5', Transport: 'c6', Housing: 'c7', Shopping: 'c8',
};
/** Resolved hex/rgb for Chart.js (canvas cannot use CSS vars). Only the 8 base hues; everything else is Other. */
export const chartColor = (group: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(`--${CHART_VAR[group] ?? 'c-other'}`).trim();
