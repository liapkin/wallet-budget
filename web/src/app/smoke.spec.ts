import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { Api } from './api';
import { Actuals } from './actuals';
import { BudgetEdit } from './budget-edit';
import { CryptoComponent } from './crypto';
import { GroceriesComponent } from './groceries';
import { History } from './history';
import { Inbox } from './inbox';
import { InvestingComponent } from './investing';
import { GoalsComponent } from './goals';
import { MealsComponent } from './meals';
import { Month } from './month';
import { App } from './app';
import { NetWorth } from './networth';
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
  it('balance chip sums EUR accounts', async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), { provide: Api, useValue: { accounts: async () => accounts, meta: () => new Promise(() => {}) } }],
    });
    const f = TestBed.createComponent(App);
    f.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    f.detectChanges();
    const el: HTMLElement = f.nativeElement;
    expect(el.querySelector('.bal')?.textContent).toContain('1,500');
    expect(el.querySelector('#balances')?.textContent).toContain('Abroad');
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
  it('goals', async () => {
    const el = await mount(GoalsComponent);
    expect(el.querySelector('h1')?.textContent).toContain('Goals');
  });
  it('crypto', async () => {
    const el = await mount(CryptoComponent, {}, { kind: 'crypto', title: 'Crypto', configKey: 'crypto', import: true });
    expect(el.querySelector('h1')?.textContent).toContain('Crypto');
    expect(el.textContent).toContain('No priced holdings yet');
  });
  it('etfs', async () => {
    const el = await mount(CryptoComponent, {}, { kind: 'etf', title: 'ETFs', configKey: 'etfs', import: false });
    expect(el.querySelector('h1')?.textContent).toContain('ETFs');
  });
  it('settings', async () => {
    const el = await mount(Settings);
    expect(el.querySelector('h1')?.textContent).toContain('Settings');
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
