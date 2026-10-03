import { Type } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import seed from '../../../../config/seed-config.example.json';
import { seedToConfig } from '../../../../shared/src/seed.ts';
import { currentMonth } from '../format';

export const config = () => structuredClone(seedToConfig(seed));
export const month = currentMonth();
const group = config().wallet.groups[0];

export const row = (id: number, over: Record<string, unknown> = {}) => ({
  id, source: 'api', account: 'Main', category: 'Food', amountCents: -1250, type: 'Expenses', paymentType: 'Card',
  note: `Note ${id}`, dateUtc: `${month}-05T10:00:00Z`, groupOverride: null, isDup: false, dupOf: null, grp: group, month, ...over,
});

export const meta = { groups: [group], excludedGroups: [], accounts: ['Main'], months: [month], demo: false, lastSync: null, currency: 'EUR', currencyLocked: true };
export const summary = { spend: { [month]: { [group]: { cents: 12500, count: 3 } } }, income: { [month]: 200000 } };
export const accounts = [{ id: 'a1', name: 'Main', balanceCents: 100000, currency: 'EUR', updatedAt: `${month}-01T00:00:00Z` }];

/** Default responses keyed by URL path (query string ignored). Override per test. */
export const responses = (): Record<string, unknown> => ({
  '/api/config': config(),
  '/api/meta': meta,
  '/api/summary': summary,
  '/api/actuals': {},
  '/api/accounts': accounts,
  '/api/wallet-categories': [],
  '/api/records': [row(1), row(2)],
  '/api/alerts': [],
  '/api/possible-duplicates': [],
  '/api/unclassified': [],
  [`/api/month-close/${month}`]: { transfers: [], done: [] },
  '/api/recurring': { items: [], monthlyTotalCents: 0 },
  '/api/balances/history': [],
  [`/api/year/${month.slice(0, 4)}`]: { year: +month.slice(0, 4), totalCents: 0, prevTotalCents: 0, groups: [], best: null, worst: null },
});

// Not fixture.whenStable(): it waits on the HTTP requests we have not flushed yet.
const tick = () => new Promise((r) => setTimeout(r, 0));
// jsdom lacks ResizeObserver, which ChartView uses.
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };

/** Creates the component, answers every GET with a fixture (unknown URL throws), and settles. */
export async function mount<T>(type: Type<T>, over: Record<string, unknown> = {}) {
  TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
  const data = { ...responses(), ...over };
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(type);
  for (let i = 0; i < 5; i++) {
    fixture.detectChanges();
    await tick();
    for (const req of http.match(() => true)) {
      const path = req.request.url;
      if (!(path in data)) throw new Error(`Unmocked ${req.request.method} ${req.request.urlWithParams}`);
      req.flush(data[path] as object);
    }
  }
  fixture.detectChanges();
  await tick();
  fixture.detectChanges();
  http.verify();
  return fixture.nativeElement as HTMLElement;
}
