import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import type { Config } from '../../../shared/src/types.ts';
import { Api } from './api';
import { App } from './app';
import { BudgetEdit } from './budget-edit';
import { routes } from './app.routes';
import { currency, currencySymbol, fmt } from './format';
import { Settings } from './settings';
import { hidden, togglePrivacy } from './ui/privacy';
import { Refresh } from './ui/refresh';
import { setTheme, theme } from './ui/theme';
import { Toast } from './ui/toast';

describe('Settings', () => {
  let stored: Config;
  let api: { config: ReturnType<typeof vi.fn>; saveConfig: ReturnType<typeof vi.fn>; meta: ReturnType<typeof vi.fn>; accounts: () => Promise<[]> };
  let refresh: Refresh;

  beforeEach(() => {
    currency.set('EUR');
    setTheme('light');
    if (hidden()) togglePrivacy();
    stored = { currency: 'EUR', income: { netSalaryPerMonth: 123400 }, diet: { nutritionNote: 'Example note' }, wallet: { groups: ['Other'] } } as Config;
    api = {
      config: vi.fn(async () => structuredClone(stored)),
      saveConfig: vi.fn(async (config: Config) => { stored = structuredClone(config); return structuredClone(stored); }),
      meta: vi.fn(async () => ({ groups: [], excludedGroups: [], accounts: [], months: [], currency: stored.currency, currencyLocked: false, demo: false })),
      accounts: async () => [],
    };
    TestBed.configureTestingModule({ providers: [
      provideRouter(routes), { provide: Api, useValue: api }, { provide: Toast, useValue: { show: vi.fn(), items: () => [] } },
    ] });
    refresh = TestBed.inject(Refresh);
    refresh.applyMeta({ groups: [], excludedGroups: [], accounts: [], months: [], currency: 'EUR', currencyLocked: false, demo: false });
  });

  afterEach(() => {
    currency.set('EUR');
    setTheme('light');
    if (hidden()) togglePrivacy();
  });

  async function mount() {
    const fixture = TestBed.createComponent(Settings);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const select = (id: string, value: string) => {
      const el = fixture.nativeElement.querySelector(`#${id}`) as HTMLSelectElement;
      el.value = value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      fixture.detectChanges();
      return el;
    };
    return { fixture, component: fixture.componentInstance as any, select };
  }

  it('keeps EUR visible and disabled when metadata locks currency; demo shows locked USD', async () => {
    refresh.currencyLocked.set(true);
    const { fixture, component } = await mount();
    const select = fixture.nativeElement.querySelector('#currency') as HTMLSelectElement;
    expect(select.options.length).toBe(2);
    expect(select.value).toBe('EUR');
    expect(select.disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Current database currency: EUR');
    await component.save();
    expect(api.saveConfig).not.toHaveBeenCalled();
    stored.currency = 'USD';
    refresh.applyMeta({ groups: [], excludedGroups: [], accounts: [], months: [], currency: 'USD', currencyLocked: false, demo: true });
    const demo = await mount();
    expect(demo.fixture.nativeElement.querySelector('#currency').value).toBe('USD');
    expect(demo.fixture.nativeElement.querySelector('#currency').disabled).toBe(true);
    expect(demo.fixture.nativeElement.textContent).toContain('Current database currency: USD');
  });

  it('blocks selection during config loading and after load failure', async () => {
    api.config.mockRejectedValueOnce(new Error('offline'));
    const fixture = TestBed.createComponent(Settings);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#currency').disabled).toBe(true);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#currency').disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Failed to load');
  });

  it('blocks currency until metadata confirms normal mode', async () => {
    refresh.demo.set(null);
    const { fixture, component, select } = await mount();
    select('currency', 'USD');
    await component.save();
    expect(component.selected()).toBe('EUR');
    expect(fixture.nativeElement.querySelector('#currency').disabled).toBe(true);
    expect(api.saveConfig).not.toHaveBeenCalled();
  });

  it('saves only on explicit save, preserves latest full config, and reloads saved currency', async () => {
    const { fixture, component, select } = await mount();
    select('currency', 'USD');
    expect(currency()).toBe('EUR');
    expect(api.saveConfig).not.toHaveBeenCalled();
    stored.income.netSalaryPerMonth = 987600;
    const expected = { ...structuredClone(stored), currency: 'USD' };
    let finish!: (config: Config) => void;
    api.saveConfig.mockImplementationOnce((config: Config) => {
      stored = structuredClone(config);
      return new Promise<Config>((resolve) => { finish = resolve; });
    });
    const saving = component.save();
    await Promise.resolve();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#currency').disabled).toBe(true);
    expect(currencySymbol()).toBe('€');
    finish(structuredClone(stored));
    await saving;
    fixture.detectChanges();
    expect(api.saveConfig).toHaveBeenCalledWith(expected);
    expect(currency()).toBe('USD');
    expect(currencySymbol()).toBe('$');
    expect(fmt(100)).toContain('$');
    expect(refresh.walletAvailable()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Current database currency: USD');
    const reloaded = await mount();
    expect(reloaded.fixture.nativeElement.querySelector('#currency').value).toBe('USD');
  });

  it('retains failed choice and actual currency; server lock error remains visible', async () => {
    const { fixture, component, select } = await mount();
    select('currency', 'USD');
    api.saveConfig.mockRejectedValueOnce({ error: { error: 'Currency is locked' } });
    await component.save();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#currency').value).toBe('USD');
    expect(currency()).toBe('EUR');
    expect(currencySymbol()).toBe('€');
    expect(fixture.nativeElement.textContent).toContain('Current database currency: EUR');
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Currency is locked');
    expect(api.config).toHaveBeenCalledTimes(2);
  });

  it('shares immediate persistent theme/privacy with header controls and keyboard shortcuts', async () => {
    const { fixture, select } = await mount();
    const shell = TestBed.createComponent(App);
    shell.detectChanges();
    await shell.whenStable();
    select('theme', 'dark');
    expect(theme()).toBe('dark');
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
    const checkbox = fixture.nativeElement.querySelector('input[type="checkbox"]') as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    shell.detectChanges();
    expect(hidden()).toBe(true);
    expect(localStorage.getItem('privacy')).toBe('1');
    expect(document.body.classList.contains('privacy')).toBe(true);
    expect(shell.nativeElement.querySelector('.topbar .eye[aria-pressed]').getAttribute('aria-pressed')).toBe('true');
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyT', shiftKey: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyH', shiftKey: true }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#theme').value).toBe('light');
    expect(checkbox.checked).toBe(false);
    shell.detectChanges();
    shell.nativeElement.querySelector('.topbar .eye').click();
    shell.nativeElement.querySelector('.topbar .eye[aria-pressed]').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#theme').value).toBe('dark');
    expect(checkbox.checked).toBe(true);
    expect(api.saveConfig).not.toHaveBeenCalled();
  });

  it('exposes Settings navigation and renders the settings route', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const link = fixture.nativeElement.querySelector('nav a[href="/settings"]') as HTMLAnchorElement;
    expect(link.textContent).toContain('Settings');
    link.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/settings');
    expect(fixture.nativeElement.querySelector('app-settings h1').textContent).toBe('Settings');
  });

  it('removes currency controls and local currency navigation from Budget', async () => {
    Object.assign(stored, {
      income: { netSalaryPerMonth: 123400, bonusMonths: {}, bonusesGoToInvesting: false },
      coreExpenses: [],
      allocation: { funPerMonth: 0, sinkingFundTopUpPerMonth: 0, bankSavings: 0, cashSavings: 0, annualIrregulars: 0, emergencyFundMonthsOfCore: 3, funGroups: [], coveredByCoreGroups: [] },
      caps: { applyFrom: '2026-01-01', bufferMonth: null, takeoutPerMonth: 0, kioskPerMonth: 0 },
      wallet: { groups: ['Other'], excludedGroups: [], merchantKeywords: [], categoryMap: [] },
    });
    const fixture = TestBed.createComponent(BudgetEdit);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#currency')).toBeNull();
    const labels = Array.from(fixture.nativeElement.querySelectorAll('nav button'), (button: any) => button.textContent.trim());
    expect(labels).not.toContain('Currency');
    expect(fixture.nativeElement.textContent).not.toContain('Database currency');
  });
});
