import { vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { mount } from './testing/fixtures';

const listeners: ((e: { matches: boolean }) => void)[] = [];
window.matchMedia = ((q: string) => ({
  matches: false, media: q,
  addEventListener: (_: string, l: (e: { matches: boolean }) => void) => listeners.push(l),
})) as unknown as typeof window.matchMedia;
const setPhone = (v: boolean) => listeners.forEach((l) => l({ matches: v }));

async function open(phone: boolean) {
  const { GroceriesComponent } = await import('./groceries');
  setPhone(phone);
  return mount(GroceriesComponent);
}
const rows = (el: HTMLElement) => [...el.querySelectorAll<HTMLLabelElement>('.shop-row')];
const click = (el: HTMLElement) => { el.click(); TestBed.tick(); };
const noRequests = () => expect(TestBed.inject(HttpTestingController).match(() => true)).toEqual([]);

describe('groceries shopping mode', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { setPhone(false); vi.restoreAllMocks(); });

  it('phone defaults to Shopping with rows', async () => {
    const el = await open(true);
    expect(rows(el).length).toBeGreaterThan(0);
    expect(el.querySelector('.modebar .seg')).toBeTruthy();
    expect(el.querySelector('.items-table')).toBeNull();
  });

  it('checking strikes the row, counts, and never writes', async () => {
    const el = await open(true);
    const total = rows(el).length;
    click(rows(el)[0].querySelector('input')!);
    expect(rows(el)[0].classList.contains('done')).toBe(true);
    expect(el.querySelector('.shop-head')?.textContent).toContain(`1 of ${total} checked`);
    expect(el.querySelector('.savebar')).toBeNull();
    noRequests();
    expect(JSON.parse(localStorage.getItem('grocery-checks')!)).toBeTruthy();
  });

  it('Reset list clears checks', async () => {
    const el = await open(true);
    click(rows(el)[0].querySelector('input')!);
    click([...el.querySelectorAll('button')].find((b) => b.textContent === 'Reset list')!);
    expect(el.querySelector('.shop-head')?.textContent).toContain('0 of');
    expect(rows(el).some((r) => r.classList.contains('done'))).toBe(false);
    expect(localStorage.getItem('grocery-checks')).toBeNull();
  });

  it('Edit and back keeps checks', async () => {
    const el = await open(true);
    click(rows(el)[0].querySelector('input')!);
    const [shop, edit] = [...el.querySelectorAll<HTMLButtonElement>('.modebar button')];
    edit.click(); TestBed.tick();
    expect(el.querySelector('.items-table')).toBeTruthy();
    shop.click(); TestBed.tick();
    expect(rows(el)[0].classList.contains('done')).toBe(true);
  });

  it('desktop shows the editor and no switch', async () => {
    const el = await open(false);
    expect(el.querySelector('.items-table')).toBeTruthy();
    expect(el.querySelector('.modebar')).toBeNull();
    expect(rows(el).length).toBe(0);
  });
});
