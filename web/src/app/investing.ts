import { HttpClient } from '@angular/common/http';
import { Component, computed, effect, inject, resource, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { annualInvesting } from '../../../shared/src/budget.ts';
import { fmt } from '../../../shared/src/money.ts';
import { project } from '../../../shared/src/projection.ts';
import type { Config } from '../../../shared/src/types.ts';

type Inv = Config['investing'];
type Field = { label: string; get: (i: Inv) => number; set: (i: Inv, v: number) => void };

const pct = (label: string, k: 'grossReturn' | 'ter' | 'inflation' | 'netSalaryGrowth' | 'houseFundReturn'): Field => ({
  label: `${label} %`,
  get: (i) => +(i[k] * 100).toFixed(4),
  set: (i, v) => (i[k] = v / 100),
});

const FIELDS: Field[] = [
  pct('Gross return', 'grossReturn'),
  pct('TER', 'ter'),
  pct('Inflation', 'inflation'),
  pct('Net salary growth', 'netSalaryGrowth'),
  { label: 'Trading cost / year €', get: (i) => i.tradingCostPerYear / 100, set: (i, v) => (i.tradingCostPerYear = Math.round(v * 100)) },
  pct('House fund return', 'houseFundReturn'),
  { label: 'Property price €', get: (i) => i.houseTarget.propertyPrice / 100, set: (i, v) => (i.houseTarget.propertyPrice = Math.round(v * 100)) },
  { label: 'Deposit %', get: (i) => +(i.houseTarget.depositShare * 100).toFixed(4), set: (i, v) => (i.houseTarget.depositShare = v / 100) },
  { label: 'Purchase costs %', get: (i) => +(i.houseTarget.purchaseCostsShare * 100).toFixed(4), set: (i, v) => (i.houseTarget.purchaseCostsShare = v / 100) },
];

@Component({
  selector: 'app-investing',
  styles: `
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 0.6rem; margin-bottom: 1rem; }
    label { display: flex; flex-direction: column; gap: 0.2rem; color: var(--muted); font-size: 0.8rem; }
    .kpis { display: flex; flex-wrap: wrap; gap: 1.5rem; margin: 1rem 0; }
    .kpis b { display: block; font-size: 1.2rem; }
    .note { padding: 0.5rem 0.75rem; border-left: 3px solid var(--accent); background: var(--badge); margin-bottom: 1rem; }
    tr.hit { background: var(--badge); font-weight: 600; }
    svg { width: 100%; max-width: 640px; height: auto; margin-bottom: 1rem; }
    .nom { stroke: var(--accent); } .real { stroke: var(--muted); stroke-dasharray: 4 3; }
  `,
  template: `
    <h1>Investing</h1>
    <p class="note"><strong>Returns are an assumption, not a forecast.</strong></p>
    @if (cfg(); as c) {
      <div class="grid">
        @for (f of fields; track f.label) {
          <label>
            {{ f.label }}
            <input type="number" step="any" [value]="f.get(c.investing)" (input)="edit(f, $any($event.target).valueAsNumber)" />
          </label>
        }
        <label>
          House fund first
          <input type="checkbox" [checked]="c.investing.houseFundFirst" (change)="toggleHouse($any($event.target).checked)" />
        </label>
      </div>
      <div class="toolbar">
        <button class="primary" (click)="save()">Save</button>
        @if (status()) {
          <span [class.err]="failed()">{{ status() }}</span>
        }
      </div>
      <div class="kpis">
        <div class="muted">Annual investing (from budget)<b>{{ fmt(annual()) }}</b></div>
        <div class="muted">House cash target<b>{{ fmt(houseCash()) }}</b></div>
        <div class="muted">Total after {{ rows().length }}y, nominal<b>{{ fmt(last().total) }}</b></div>
        <div class="muted">Total after {{ rows().length }}y, real<b>{{ fmt(last().real) }}</b></div>
        <div class="muted">House cash covered<b>{{ covers() ? 'year ' + covers() : 'not within ' + rows().length + 'y' }}</b></div>
      </div>
      <svg viewBox="0 0 300 120" role="img" aria-label="Total nominal vs real">
        <polyline class="nom" fill="none" stroke-width="2" [attr.points]="line('total')" />
        <polyline class="real" fill="none" stroke-width="2" [attr.points]="line('real')" />
        <text x="4" y="10" font-size="8" fill="currentColor">solid: nominal, dashed: real</text>
      </svg>
      <div class="scroll">
        <table>
          <thead>
            <tr>
              <th>Year</th><th class="num">Contribution</th><th class="num">ETF</th>
              <th class="num">House fund</th><th class="num">Total</th><th class="num">Real</th>
            </tr>
          </thead>
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
    } @else if (loaded.error()) {
      <p class="err">Failed to load config.</p>
    }
  `,
})
export class InvestingComponent {
  protected fmt = fmt;
  protected fields = FIELDS;
  private http = inject(HttpClient);
  protected loaded = resource({ loader: () => firstValueFrom(this.http.get<Config>('/api/config')) });
  protected cfg = signal<Config | null>(null);
  protected status = signal('');
  protected failed = signal(false);

  constructor() {
    effect(() => {
      const v = this.loaded.value();
      if (v) untracked(() => this.cfg.set(structuredClone(v)));
    });
  }

  protected annual = computed(() => annualInvesting(this.cfg()!));
  protected houseCash = computed(() => {
    const t = this.cfg()!.investing.houseTarget;
    return Math.round(t.propertyPrice * (t.depositShare + t.purchaseCostsShare));
  });
  private proj = computed(() => project({ ...this.cfg()!.investing, annualInvesting: this.annual(), houseCash: this.houseCash() }));
  protected rows = computed(() => this.proj().rows);
  protected covers = computed(() => this.proj().coversHouseYear);
  protected last = computed(() => this.rows()[this.rows().length - 1]);

  protected line(k: 'total' | 'real') {
    const rows = this.rows();
    const max = this.last().total || 1;
    return rows.map((r, i) => `${(i / (rows.length - 1)) * 300},${120 - (r[k] / max) * 105}`).join(' ');
  }

  protected edit(f: Field, v: number) {
    if (Number.isNaN(v)) return;
    this.cfg.update((c) => {
      const n = structuredClone(c!);
      f.set(n.investing, v);
      return n;
    });
  }

  protected toggleHouse(on: boolean) {
    this.cfg.update((c) => ({ ...c!, investing: { ...c!.investing, houseFundFirst: on } }));
  }

  protected async save() {
    try {
      await firstValueFrom(this.http.put('/api/config', this.cfg()));
      this.failed.set(false);
      this.status.set('Saved');
    } catch {
      this.failed.set(true);
      this.status.set('Save failed');
    }
  }
}
