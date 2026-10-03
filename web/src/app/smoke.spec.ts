import { vi } from 'vitest';
import { Actuals } from './actuals';
import { BudgetEdit } from './budget-edit';
import { GroceriesComponent } from './groceries';
import { History } from './history';
import { Inbox } from './inbox';
import { InvestingComponent } from './investing';
import { MealsComponent } from './meals';
import { Month } from './month';
import { NetWorth } from './networth';
import { Recurring } from './recurring';
import { Records } from './records';
import { Settings } from './settings';
import { Year } from './year';
import { hidden, togglePrivacy } from './ui/privacy';
import { accounts, month, mount, row } from './testing/fixtures';

// jsdom has no canvas; chart rendering is not under test.
vi.mock('echarts/core', () => ({
  use() {}, registerTheme() {}, init: () => ({ setOption() {}, resize() {}, dispose() {} }),
}));

const y = +month.slice(0, 4);
const yearData = {
  year: y, totalCents: 90000, prevTotalCents: 80000,
  groups: [{ group: 'Groceries', cents: 90000, prevCents: 80000, deltaCents: 10000 }],
  best: { month, cents: 30000 }, worst: { month, cents: 60000 },
};
const unc = { ...row(3, { grp: 'Other' }), suggestion: { group: 'Groceries', confidence: 0.9 } };

describe('screen smoke tests', () => {
  afterEach(() => { if (hidden()) togglePrivacy(); });

  it('month', async () => {
    const el = await mount(Month);
    expect(el.querySelector('h1')?.textContent).toContain('Overview');
  });
  it('history', async () => {
    const el = await mount(History);
    expect(el.querySelector('h1')?.textContent).toContain('History');
    expect(el.textContent).toContain('Spend by group');
  });
  it('records', async () => {
    const el = await mount(Records);
    expect(el.textContent).toContain('Note 1');
  });
  it('budget-edit', async () => {
    const el = await mount(BudgetEdit);
    expect(el.querySelector('h1')?.textContent).toContain('Budget');
  });
  it('actuals', async () => {
    const el = await mount(Actuals);
    expect(el.querySelector('h1')?.textContent).toContain('Core actuals');
  });
  it('meals', async () => {
    const el = await mount(MealsComponent);
    expect(el.textContent).toContain('Edit ingredients');
  });
  it('groceries', async () => {
    const el = await mount(GroceriesComponent);
    expect(el.querySelector('h1')?.textContent).toContain('Grocery list');
  });
  it('investing', async () => {
    const el = await mount(InvestingComponent);
    expect(el.querySelector('h1')?.textContent).toContain('Investing');
  });
  it('settings', async () => {
    const el = await mount(Settings);
    expect(el.querySelector('h1')?.textContent).toContain('Settings');
  });
  it('recurring: table row', async () => {
    const items = [{ merchant: 'Streamco', group: 'Subscriptions', typicalCents: 999, lastDate: `${month}-01`, nextDate: `${month}-28` }];
    const el = await mount(Recurring, { '/api/recurring': { items, monthlyTotalCents: 999 } });
    expect(el.querySelector('tbody tr')?.textContent).toContain('Streamco');
  });
  it('recurring: empty state', async () => {
    expect((await mount(Recurring)).textContent).toContain('No recurring charges found');
  });
  it('networth', async () => {
    const el = await mount(NetWorth);
    expect(el.textContent).toContain('Total');
  });
  it('year: KPI', async () => {
    const el = await mount(Year, { [`/api/year/${y}`]: yearData });
    expect(el.querySelector('.kpi .value')?.textContent).toContain('900');
  });
  it('year: privacy mask hides money', async () => {
    togglePrivacy();
    const el = await mount(Year, { [`/api/year/${y}`]: yearData });
    expect(el.querySelector('.kpi .value')?.textContent).toContain('••••');
    expect(el.textContent).not.toContain('900');
  });
  it('inbox', async () => {
    const el = await mount(Inbox, { '/api/unclassified': [unc] });
    expect(el.querySelector('h1')?.textContent).toContain('Inbox');
    expect(el.textContent).toContain('Possible duplicates (0)');
    expect(el.textContent).toContain('No possible duplicates');
  });
});
