import { Component, computed, inject, resource } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { breakdown, isSpend } from '../../../shared/src/analysis.ts';
import { merchantOf } from '../../../shared/src/insights.ts';
import { Api } from './api';
import { addMonths, axisEuro, chartColor, currencySymbol, currentMonth, dayLabel, fmt, groupColor, monthLabel, shortMonth } from './format';
import { ChartView } from './ui/chart';
import { Pip } from './ui/pip';

const LIST_CAP = 50;

@Component({
  selector: 'app-analysis',
  imports: [ChartView, Pip, RouterLink],
  styles: `
    .dot { display: inline-block; width: 0.7em; height: 0.7em; border-radius: 50%; margin-right: var(--sp-2); }
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: var(--sp-4); margin-bottom: var(--sp-4); }
    .brow { display: grid; grid-template-columns: 1fr auto auto; gap: var(--sp-1) var(--sp-3); margin-bottom: var(--sp-3); }
    .brow .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .brow .bar { grid-column: 1 / -1; }
    .list { list-style: none; margin: 0; padding: 0; }
    .list li { display: grid; grid-template-columns: 1fr auto; gap: var(--sp-3); padding: var(--sp-2) 0; border-bottom: 1px solid var(--border); }
    .list li:last-child { border-bottom: 0; }
    .list .note { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
    .list small { display: block; }
  `,
  template: `
    <div class="page-head">
      <h1><span class="dot" [style.background]="color()"></span>{{ group }}</h1>
      <div class="actions">
        <button aria-label="Previous month" (click)="go(-1)">&larr;</button>
        <strong>{{ label() }}</strong>
        <button aria-label="Next month" (click)="go(1)">&rarr;</button>
      </div>
    </div>
    @if (data.error() || summary.error()) {
      <p class="err">Failed to load analysis. Check that the server is running.</p>
    } @else if (!data.value() || !summary.value()) {
      <div class="card"><div class="skeleton" style="height: 300px"></div></div>
    } @else {
      <section class="kpis">
        <div class="kpi big">
          <div class="label">Spent in {{ label() }}</div>
          <div class="value">{{ fmt(total()) }}</div>
          <div class="sub">{{ rows().length }} records</div>
        </div>
        @if (avg() !== null) {
          <div class="kpi">
            <div class="label">Average of previous 6 months</div>
            <div class="value">{{ fmt(avg()!) }}</div>
            <div class="sub">
              {{ total() >= avg()! ? '+' : '−' }}{{ fmt(abs(total() - avg()!)) }} vs avg
            </div>
          </div>
        }
      </section>
      <section class="card">
        <div class="card-head"><h2>Last 12 months</h2></div>
        <app-chart [option]="chart()" [height]="220" />
      </section>
      @if (!rows().length) {
        <div class="card empty"><app-pip scene="no-spending" /><strong>No spending</strong><span>Nothing in {{ group }} for {{ label() }}.</span></div>
      } @else {
        <div class="cards">
          @for (c of cards(); track c.title) {
            <section class="card">
              <div class="card-head"><h2>{{ c.title }}</h2></div>
              @for (e of c.rows; track e.key) {
                <div class="brow">
                  <span class="name">{{ e.key }}</span>
                  <span class="muted">{{ e.count }}</span>
                  <span class="num">{{ fmt(e.cents) }}</span>
                  <div class="bar"><i [style.width.%]="c.max > 0 ? (e.cents / c.max) * 100 : 0" [style.background]="color()"></i></div>
                </div>
              }
            </section>
          }
        </div>
        <section class="card">
          <div class="card-head">
            <h2>Records</h2>
            <a [routerLink]="['/records']" [queryParams]="{ month: month(), group }">Open in Records &rarr;</a>
          </div>
          <ul class="list">
            @for (r of shown(); track r.id) {
              <li>
                <div>
                  <div class="note">{{ r.note || '(no note)' }}</div>
                  <small class="muted">{{ day(r.dateUtc) }} / {{ r.account }}</small>
                </div>
                <span class="num">{{ fmt(-r.amountCents) }}</span>
              </li>
            }
          </ul>
          @if (rows().length > shown().length) {
            <p class="muted">Showing {{ shown().length }} of {{ rows().length }}.</p>
          }
        </section>
      }
    }
  `,
})
export class Analysis {
  private api = inject(Api);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  protected group = this.route.snapshot.paramMap.get('group') ?? '';
  private q = toSignal(this.route.queryParamMap, { requireSync: true });
  protected month = computed(() => this.q().get('month') ?? currentMonth());
  protected fmt = fmt;
  protected abs = Math.abs;
  protected color = () => groupColor(this.group);
  protected label = computed(() => monthLabel(this.month()));
  protected day = dayLabel;

  protected summary = resource({ loader: () => this.api.summary() });
  protected data = resource({
    params: () => this.month(),
    loader: async ({ params: month }) => {
      const [cfg, recs] = await Promise.all([this.api.config(), this.api.records({ month, group: this.group })]);
      return recs.filter((r) => isSpend(r, cfg)).sort((a, b) => b.dateUtc.localeCompare(a.dateUtc));
    },
  });

  protected rows = computed(() => this.data.value() ?? []);
  protected shown = computed(() => this.rows().slice(0, LIST_CAP));
  protected total = computed(() => this.rows().reduce((s, r) => s - r.amountCents, 0));
  private cents = (m: string) => this.summary.value()?.spend[m]?.[this.group]?.cents;
  protected avg = computed(() => {
    const xs = [1, 2, 3, 4, 5, 6].map((n) => this.cents(addMonths(this.month(), -n))).filter((c) => c !== undefined);
    return xs.length ? Math.round(xs.reduce((s, c) => s + c, 0) / xs.length) : null;
  });

  protected cards = computed(() => {
    const rows = this.rows();
    return [
      { title: 'By category', rows: breakdown(rows, (r) => r.category) },
      { title: 'Top merchants', rows: breakdown(rows, (r) => merchantOf(r.note) || '(no note)').slice(0, 8) },
      { title: 'By account', rows: breakdown(rows, (r) => r.account) },
    ].map((c) => ({ ...c, max: c.rows[0]?.cents ?? 0 }));
  });

  protected chart = computed(() => {
    const sel = this.month();
    const months = Array.from({ length: 12 }, (_, i) => addMonths(sel, i - 11));
    const avg = this.avg();
    const color = chartColor(this.group);
    return {
      grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: number) => fmt(v) },
      xAxis: { type: 'category', data: months.map(shortMonth) },
      yAxis: { type: 'value', axisLabel: { formatter: axisEuro(currencySymbol()) }, splitLine: { lineStyle: { type: 'dashed', opacity: 0.35 } } },
      series: [{
        type: 'bar',
        data: months.map((m) => ({ value: this.cents(m) ?? 0, itemStyle: { color, opacity: m === sel ? 1 : 0.45 } })),
        ...(avg !== null ? { markLine: { silent: true, symbol: 'none', label: { show: false }, data: [{ yAxis: avg }] } } : {}),
      }],
    };
  });

  protected go(n: number) {
    this.router.navigate([], { queryParams: { month: addMonths(this.month(), n) }, queryParamsHandling: 'merge', replaceUrl: true });
  }
}
