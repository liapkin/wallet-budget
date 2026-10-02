import { Component, computed, inject, signal } from '@angular/core';
import { annualInvesting } from '../../../shared/src/budget.ts';
import { fmt } from './format.ts';
import { project } from '../../../shared/src/projection.ts';
import type { Config } from '../../../shared/src/types.ts';
import { Api } from './api';
import { ChartView } from './ui/chart';
import { MoneyInput } from './ui/money-input';
import { Toast } from './ui/toast';

type Inv = Config['investing'];
type Field = { label: string; unit: '%' | '€'; get: (i: Inv) => number; set: (i: Inv, v: number) => void };

const p = (x: number) => +(x * 100).toFixed(4);
const pct = (label: string, k: 'grossReturn' | 'ter' | 'inflation' | 'netSalaryGrowth' | 'houseFundReturn'): Field => ({
  label, unit: '%', get: (i) => p(i[k]), set: (i, v) => (i[k] = v / 100),
});
const target = (label: string, k: 'depositShare' | 'purchaseCostsShare'): Field => ({
  label, unit: '%', get: (i) => p(i.houseTarget[k]), set: (i, v) => (i.houseTarget[k] = v / 100),
});

const MARKET: Field[] = [
  pct('Gross return', 'grossReturn'),
  pct('TER', 'ter'),
  pct('Inflation', 'inflation'),
  pct('Salary growth', 'netSalaryGrowth'),
  { label: 'Trading cost / year', unit: '€', get: (i) => i.tradingCostPerYear / 100, set: (i, v) => (i.tradingCostPerYear = Math.round(v * 100)) },
];
const HOUSE: Field[] = [
  pct('House fund return', 'houseFundReturn'),
  { label: 'Property price', unit: '€', get: (i) => i.houseTarget.propertyPrice / 100, set: (i, v) => (i.houseTarget.propertyPrice = Math.round(v * 100)) },
  target('Deposit', 'depositShare'),
  target('Purchase costs', 'purchaseCostsShare'),
];

@Component({
  selector: 'app-investing',
  imports: [ChartView, MoneyInput],
  host: { '(window:keydown)': 'key($event)', '(window:beforeunload)': 'unload($event)' },
  styles: `
    .callout { padding: var(--sp-3) var(--sp-4); border: 1px solid var(--accent); border-left-width: 4px; border-radius: var(--r); background: var(--accent-soft); margin-bottom: var(--sp-4); }
    .layout { display: grid; grid-template-columns: 19rem 1fr; gap: var(--sp-4); align-items: start; }
    .layout > aside { position: sticky; top: var(--sp-4); }
    aside .field { margin-bottom: var(--sp-3); }
    aside .affix { display: flex; }
    aside .affix input { flex: 1; width: auto; }
    aside h3 { margin-top: var(--sp-4); }
    aside h3:first-of-type { margin-top: 0; }
    .kpis { grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); }
    .kpi .value { font-size: var(--fs-lg); }
    details { margin-top: var(--sp-3); }
    summary { cursor: pointer; font-weight: 600; margin-bottom: var(--sp-3); }
    tr.hit td { background: var(--accent-soft); font-weight: 600; }
    @media (max-width: 900px) { .layout { grid-template-columns: 1fr; } .layout > aside { position: static; } }
  `,
  template: `
    <div class="page-head"><h1>Investing</h1></div>
    <div class="callout"><strong>Returns are an assumption, not a forecast.</strong></div>
    @if (draft(); as c) {
      <div class="layout">
        <aside class="card">
          <h3>Market</h3>
          @for (f of market; track f.label) {
            <label class="field">{{ f.label }}
              <span class="affix" [attr.data-suf]="f.unit" [attr.data-pre]="f.unit === '€' ? '€' : null">
                <input type="text" appMoney [value]="f.get(c.investing)" (change)="editVal(f, $event)" />
              </span>
            </label>
          }
          <h3>House</h3>
          <label class="switch" style="margin-bottom:var(--sp-3)"><input type="checkbox" [checked]="c.investing.houseFundFirst" (change)="toggleHouse($any($event.target).checked)" /> House fund first</label>
          @for (f of house; track f.label) {
            <label class="field">{{ f.label }}
              <span class="affix" [attr.data-suf]="f.unit === '%' ? '%' : null" [attr.data-pre]="f.unit === '€' ? '€' : null">
                <input type="text" appMoney [value]="f.get(c.investing)" (change)="editVal(f, $event)" />
              </span>
            </label>
          }
        </aside>

        <div>
          <div class="kpis">
            <div class="kpi"><span class="label">Annual investing</span><span class="value">{{ fmt(annual()) }}</span><span class="sub">from budget</span></div>
            <div class="kpi"><span class="label">After {{ rows().length }}y, nominal</span><span class="value">{{ fmt(last().total) }}</span></div>
            <div class="kpi"><span class="label">After {{ rows().length }}y, real</span><span class="value">{{ fmt(last().real) }}</span></div>
            <div class="kpi" [class.good]="covers()"><span class="label">House cash covered</span><span class="value">{{ covers() ? 'Year ' + covers() : 'Not within ' + rows().length + 'y' }}</span><span class="sub">target {{ fmt(houseCash()) }}</span></div>
          </div>

          <div class="card"><app-chart [option]="chart()" [height]="300" /></div>

          <div class="card">
            <details>
              <summary>Yearly breakdown</summary>
              <div class="scroll tall" style="box-shadow:none">
                <table>
                  <thead><tr><th>Year</th><th class="num">Contribution</th><th class="num">ETF</th><th class="num">House fund</th><th class="num">Total</th><th class="num">Real</th></tr></thead>
                  <tbody>
                    @for (r of rows(); track r.year) {
                      <tr [class.hit]="r.year === covers()">
                        <td>{{ r.year }}</td>
                        <td class="num">{{ fmt(r.contribution) }}</td>
                        <td class="num">{{ fmt(r.etf) }}</td>
                        <td class="num">{{ fmt(r.houseFund) }}</td>
                        <td class="num">{{ fmt(r.total) }}</td>
                        <td class="num">{{ fmt(r.real) }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </details>
          </div>

          @if (dirty()) {
            <div class="savebar" role="status">
              <span class="muted grow">Unsaved changes</span>
              <button class="ghost" (click)="discard()" [disabled]="saving()">Discard</button>
              <button class="primary" (click)="save()" [disabled]="saving()">{{ saving() ? 'Saving…' : 'Save' }}</button>
            </div>
          }
        </div>
      </div>
    } @else if (failed()) {
      <p class="err">Failed to load config.</p>
    } @else {
      <span class="skeleton" style="height:12rem"></span>
    }
  `,
})
export class InvestingComponent {
  protected fmt = fmt;
  protected market = MARKET;
  protected house = HOUSE;
  private api = inject(Api);
  private toast = inject(Toast);
  private saved = signal<Config | null>(null);
  protected draft = signal<Config | null>(null);
  protected failed = signal(false);
  protected saving = signal(false);
  protected dirty = computed(() => JSON.stringify(this.draft()) !== JSON.stringify(this.saved()));

  constructor() {
    this.api.config().then(
      (c) => this.load(c),
      () => this.failed.set(true),
    );
  }

  private load(c: Config) {
    this.saved.set(c);
    this.draft.set(structuredClone(c));
  }

  protected annual = computed(() => annualInvesting(this.draft()!));
  protected houseCash = computed(() => {
    const t = this.draft()!.investing.houseTarget;
    return Math.round(t.propertyPrice * (t.depositShare + t.purchaseCostsShare));
  });
  private proj = computed(() => project({ ...this.draft()!.investing, annualInvesting: this.annual(), houseCash: this.houseCash() }));
  protected rows = computed(() => this.proj().rows);
  protected covers = computed(() => this.proj().coversHouseYear);
  protected last = computed(() => this.rows()[this.rows().length - 1]);

  protected chart = computed(() => {
    const rows = this.rows();
    const eur = (v: number) => fmt(Math.round(v * 100));
    const line = (name: string, k: 'total' | 'real', extra: object = {}) => ({
      name, type: 'line', data: rows.map((r) => r[k] / 100), ...extra,
    });
    return {
      grid: { left: 8, right: 16, top: 36, bottom: 8, containLabel: true },
      tooltip: { trigger: 'axis', valueFormatter: (v: number) => eur(v) },
      xAxis: { type: 'category', data: rows.map((r) => 'Y' + r.year), boundaryGap: false },
      yAxis: { type: 'value', axisLabel: { formatter: (v: number) => (v >= 1000 ? v / 1000 + 'k' : v) + ' €' } },
      series: [
        line('Nominal', 'total', {
          markLine: {
            symbol: 'none',
            silent: true,
            lineStyle: { type: 'dashed' },
            label: { formatter: 'House cash', position: 'insideEndTop' },
            data: [{ yAxis: this.houseCash() / 100 }],
          },
        }),
        line('Real', 'real'),
      ],
    };
  });

  protected edit(f: Field, v: number) {
    if (Number.isNaN(v)) return;
    this.draft.update((c) => {
      const n = structuredClone(c!);
      f.set(n.investing, v);
      return n;
    });
  }

  protected editVal(f: Field, e: Event) {
    const val = (e.target as HTMLInputElement).value.trim().replace(',', '.');
    const v = Number(val) || 0;
    if (Number.isNaN(v)) return;
    this.draft.update((c) => {
      const n = structuredClone(c!);
      f.set(n.investing, v);
      return n;
    });
  }

  protected toggleHouse(on: boolean) {
    this.draft.update((c) => ({ ...c!, investing: { ...c!.investing, houseFundFirst: on } }));
  }

  protected discard() {
    this.draft.set(structuredClone(this.saved()!));
  }

  protected async save() {
    if (!this.dirty() || this.saving()) return;
    this.saving.set(true);
    try {
      this.load(await this.api.saveConfig(this.draft()!));
      this.toast.show('Investing assumptions saved');
    } catch (e: any) {
      this.toast.show(e?.error?.error ?? 'Save failed', 'err');
    } finally {
      this.saving.set(false);
    }
  }

  protected key(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      void this.save();
    }
  }

  protected unload(e: BeforeUnloadEvent) {
    if (this.dirty()) e.preventDefault();
  }
}
