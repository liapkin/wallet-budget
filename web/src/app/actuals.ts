import { Component, computed, effect, inject, resource, signal } from '@angular/core';
import { coreActuals } from '../../../shared/src/budget.ts';
import { fmt, toCents } from '../../../shared/src/money.ts';
import { Api, type Actuals as Typed } from './api';
import { currentMonth, monthLabel } from './format';
import { Icon } from './ui/icons';
import { MonthPicker } from './ui/month-picker';
import { Refresh } from './ui/refresh';
import { Toast } from './ui/toast';

const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));

@Component({
  selector: 'app-actuals',
  imports: [Icon, MonthPicker],
  template: `
    <div class="page-head">
      <h1>Core actuals</h1>
      <div class="actions"><app-month-picker [(month)]="month" /></div>
    </div>

    @if (cfg.value(); as cfg) {
      <div class="cards">
        @for (a of lines(); track a.key) {
          <div class="card line">
            <div class="top">
              <strong>{{ a.label }}</strong>
              @if (a.wallet) { <span class="badge" title="Fed from Wallet, read-only">W · {{ sources(a.key) }}</span> } @else { <span class="badge">typed</span> }
            </div>
            <div class="amt">
              <span class="big" [class.bad]="over(a)">{{ fmt(a.actual ?? 0) }}</span>
              <span class="muted">of {{ fmt(a.plan) }}</span>
            </div>
            <div class="progress"><i [class.over]="over(a)" [style.width.%]="pct(a)"></i></div>
            <label class="entry">
              <span class="muted sm">{{ a.wallet ? '+ cash' : 'Actual' }}</span>
              <span class="affix" data-pre="€">
                <input inputmode="decimal" [placeholder]="a.wallet ? '0' : ''" [value]="eur(typed()[month()]?.[a.key])" (change)="save(month(), a.key, $event)" (keydown.enter)="blur($event)" />
              </span>
              @if (saved() === month() + a.key) { <span class="ok"><app-icon name="check" [size]="14" /> saved</span> }
            </label>
          </div>
        } @empty {
          <div class="empty"><strong>No core lines</strong></div>
        }
      </div>

      <h2>{{ year() }} by month</h2>
      <div class="scroll">
        <table class="sticky-first">
          <thead>
            <tr>
              <th>Month</th>
              @for (l of cfg.coreExpenses; track l.key) { <th class="num">{{ l.label }}</th> }
            </tr>
          </thead>
          <tbody>
            @for (m of yearMonths(); track m) {
              <tr [class.cur]="m === now">
                <td class="strong">{{ short(m) }}</td>
                @for (l of cfg.coreExpenses; track l.key) {
                  <td class="num" [class.walletcell]="wallet(l.source)">
                    @if (wallet(l.source)) { <span class="wsum">{{ fmt(walletSum(l.source, m)) }}</span> }
                    <input class="cell" [placeholder]="wallet(l.source) ? '+ cash' : ''" [value]="eur(typed()[m]?.[l.key])" (change)="save(m, l.key, $event)" (keydown.enter)="blur($event)" [attr.aria-label]="l.label + ' ' + m" />
                    @if (saved() === m + l.key) { <app-icon name="check" [size]="12" /> }
                  </td>
                }
              </tr>
            }
          </tbody>
        </table>
      </div>
    } @else {
      <div class="skeleton" style="height: 10rem"></div>
    }
  `,
  styles: `
    .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr)); gap: var(--sp-4); margin-bottom: var(--sp-5); }
    .line { margin: 0; display: flex; flex-direction: column; gap: var(--sp-2); padding: var(--sp-4); }
    .top { display: flex; justify-content: space-between; align-items: center; gap: var(--sp-2); }
    .top .badge { margin: 0; cursor: default; }
    .amt { display: flex; align-items: baseline; gap: var(--sp-2); }
    .big { font-size: var(--fs-lg); font-weight: 650; }
    .big.bad { color: var(--bad); }
    .entry { display: flex; align-items: center; gap: var(--sp-2); margin-top: var(--sp-1); }
    .entry .affix { margin-left: auto; }
    .sm { font-size: var(--fs-xs); }
    .ok { color: var(--good); font-size: var(--fs-xs); display: inline-flex; align-items: center; gap: 2px; }
    td.walletcell { color: var(--muted); }
    .wsum { display: block; }
    td input.cell { width: 5.5rem; }
    td .app-icon, td app-icon { color: var(--good); vertical-align: middle; }
    tr.cur td, tr.cur td:first-child { background: var(--accent-soft); }
  `,
})
export class Actuals {
  protected fmt = fmt;
  protected now = currentMonth();
  private api = inject(Api);
  private toast = inject(Toast);
  private refresh = inject(Refresh);
  protected month = signal(currentMonth());
  protected year = computed(() => this.month().slice(0, 4));
  protected yearMonths = computed(() => MONTHS.map((m) => `${this.year()}-${m}`));
  protected short = (m: string) => monthLabel(m).split(' ')[0].slice(0, 3);
  protected cfg = resource({ params: () => this.refresh.tick(), loader: () => this.api.config() });
  private summary = resource({ params: () => this.refresh.tick(), loader: () => this.api.summary() });
  protected typed = signal<Typed>({});
  protected saved = signal('');

  constructor() {
    effect(() => {
      this.refresh.tick();
      this.api.actuals().then((a) => this.typed.set(a), (e) => this.toast.show(e?.error?.error ?? 'Load failed', 'err'));
    });
  }

  protected lines = computed(() => {
    const cfg = this.cfg.value();
    const m = this.month();
    if (!cfg) return [];
    const spend = Object.fromEntries(Object.entries(this.summary.value()?.spend[m] ?? {}).map(([g, c]) => [g, c.cents]));
    return coreActuals(cfg, spend, this.typed()[m] ?? {});
  });

  protected wallet = (src: string) => src.startsWith('wallet:');
  protected sources = (key: string) => this.cfg.value()?.coreExpenses.find((l) => l.key === key)?.source.slice(7).split('+').join(', ');
  protected walletSum = (src: string, m: string) =>
    src.slice(7).split('+').reduce((s, g) => s + (this.summary.value()?.spend[m]?.[g]?.cents ?? 0), 0);
  protected eur = (c?: number) => (c === undefined ? '' : String(c / 100));
  protected over = (a: { plan: number; actual: number | null }) => (a.actual ?? 0) > a.plan;
  protected pct = (a: { plan: number; actual: number | null }) => (a.plan > 0 ? Math.min(100, ((a.actual ?? 0) / a.plan) * 100) : 0);
  protected blur = (e: Event) => (e.target as HTMLInputElement).blur();

  protected async save(m: string, key: string, e: Event) {
    const raw = (e.target as HTMLInputElement).value.trim().replace(',', '.');
    const n = Number(raw);
    if (raw !== '' && !Number.isFinite(n)) {
      (e.target as HTMLInputElement).value = this.eur(this.typed()[m]?.[key]);
      return void this.toast.show('Not a number: ' + raw, 'err');
    }
    const cents = raw === '' ? null : toCents(n);
    try {
      await this.api.setActual(m, key, cents);
    } catch (err: any) {
      return void this.toast.show(err?.error?.error ?? 'Save failed', 'err');
    }
    this.typed.update((t) => {
      const row = { ...t[m] };
      if (cents === null) delete row[key];
      else row[key] = cents;
      return { ...t, [m]: row };
    });
    this.saved.set(m + key);
    setTimeout(() => this.saved() === m + key && this.saved.set(''), 1500);
  }
}
