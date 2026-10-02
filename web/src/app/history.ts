import { Component, computed, inject, resource, signal } from '@angular/core';
import { fmt } from '../../../shared/src/money.ts';
import { byYear, type Cell } from '../../../shared/src/summary.ts';
import { Api } from './api';
import { chartColor, shortMonth } from './format';
import { ChartView } from './ui/chart';
import { Refresh } from './ui/refresh';

const COUNTED = ['Takeout', 'Kiosk'];
const FIRST_FEED = '2026-07';
const FIXED = ['Groceries', 'Takeout', 'Cafes & eating out', 'Kiosk', 'Fuel', 'Transport', 'Housing', 'Shopping'];
const RANGES = [{ label: '12 mo', n: 12 }, { label: '24 mo', n: 24 }, { label: 'All', n: 0 }];

@Component({
  selector: 'app-history',
  imports: [ChartView],
  styles: `
    .sep { border-left: 2px solid var(--border); }
    td small { display: block; font-size: var(--fs-xs); line-height: 1.2; }
    tfoot td { font-weight: 600; border-top: 2px solid var(--border); background: var(--surface-2); }
    tfoot tr:last-child td { border-bottom: 0; }
    .sticky-first tfoot td:first-child { background: var(--surface-2); }
    .badge { cursor: help; }
  `,
  template: `
    <div class="page-head">
      <h1>History</h1>
      <div class="actions">
        @if (!yearly()) {
          <div class="seg" role="group" aria-label="Range">
            @for (r of ranges; track r.label) {
              <button [class.on]="range() === r.n" (click)="range.set(r.n)">{{ r.label }}</button>
            }
          </div>
        }
        <div class="seg" role="group" aria-label="Grouping">
          <button [class.on]="!yearly()" (click)="yearly.set(false)">Month</button>
          <button [class.on]="yearly()" (click)="yearly.set(true)">Year</button>
        </div>
      </div>
    </div>
    @if (data.error() || meta.error()) {
      <p class="err">Failed to load history. Check that the server is running, then try Fetch again.</p>
    } @else if (!data.value() || !meta.value()) {
      <div class="card"><div class="skeleton" style="height: 300px"></div></div>
      <div class="card"><div class="skeleton" style="height: 220px"></div></div>
    } @else if (!rows().length) {
      <div class="card empty"><strong>No history yet</strong><span>Fetch from Wallet or import a file to see spending over time.</span></div>
    } @else {
      <section class="card">
        <div class="card-head"><h2>Spend by group</h2></div>
        <app-chart [option]="chart()" [height]="320" />
      </section>

      <div class="scroll tall">
        <table class="sticky-first">
          <thead>
            <tr>
              <th>{{ yearly() ? 'Year' : 'Month' }}</th>
              @for (c of cols(); track c) {
                <th class="num">{{ c }}</th>
              }
              <th class="num">Total spend</th>
              <th class="num sep">Invested</th>
              @if (yearly()) {
                <th class="num">Avg / month</th>
              }
            </tr>
          </thead>
          <tbody>
            @for (r of rows(); track r.period) {
              <tr>
                <td class="nowrap">
                  {{ r.label }}
                  @if (r.lower) {
                    <span class="badge" title="no bank feed before Jul 2026">lower bound</span>
                  }
                </td>
                @for (c of cols(); track c) {
                  <td class="num" [style.background]="tint(r.cells[c]?.cents ?? 0, c)">
                    {{ fmt(r.cells[c]?.cents ?? 0) }}
                    @if (counted.includes(c) && r.cells[c]) {
                      <small class="muted">{{ r.cells[c].count }} {{ c === 'Takeout' ? 'orders' : 'visits' }}</small>
                    }
                  </td>
                }
                <td class="num strong">{{ fmt(r.total) }}</td>
                <td class="num sep">{{ fmt(r.invested) }}</td>
                @if (yearly()) {
                  <td class="num">{{ fmt(r.avg) }}</td>
                }
              </tr>
            }
          </tbody>
          <tfoot>
            @for (f of foot(); track f.label) {
              <tr>
                <td class="nowrap">{{ f.label }}</td>
                @for (c of cols(); track c) {
                  <td class="num">{{ fmt(f.cells[c] ?? 0) }}</td>
                }
                <td class="num">{{ fmt(f.total) }}</td>
                <td class="num sep">{{ fmt(f.invested) }}</td>
                @if (yearly()) {
                  <td class="num"></td>
                }
              </tr>
            }
          </tfoot>
        </table>
      </div>
    }
  `,
})
export class History {
  protected fmt = fmt;
  protected counted = COUNTED;
  protected ranges = RANGES;
  protected yearly = signal(false);
  protected range = signal(12);
  private api = inject(Api);
  private tick = inject(Refresh).tick;
  protected data = resource({ params: () => this.tick(), loader: () => this.api.summary() });
  protected meta = resource({ params: () => this.tick(), loader: () => this.api.meta() });
  private excluded = computed(() => new Set([...(this.meta.value()?.excludedGroups ?? []), 'Income']));
  protected cols = computed(() => (this.meta.value()?.groups ?? []).filter((g) => !this.excluded().has(g)));

  /** Periods in range, ascending, each with its months. */
  private periods = computed(() => {
    const spend = this.data.value()?.spend ?? {};
    const src = this.yearly() ? byYear(spend) : spend;
    let keys = Object.keys(src).sort();
    if (!this.yearly() && this.range()) keys = keys.slice(-this.range());
    const months = Object.keys(spend);
    return keys.map((period) => ({
      period,
      cells: src[period] as Record<string, Cell>,
      months: months.filter((m) => m.startsWith(period)),
    }));
  });

  protected rows = computed(() => {
    const ex = this.excluded();
    return this.periods()
      .map(({ period, cells, months }) => {
        const total = Object.entries(cells).reduce((a, [g, c]) => a + (ex.has(g) ? 0 : c.cents), 0);
        return {
          period, cells, total,
          label: this.yearly() ? period : shortMonth(period),
          invested: cells['Investing']?.cents ?? 0,
          avg: Math.round(total / months.length),
          lower: months.some((m) => m < FIRST_FEED),
        };
      })
      .reverse();
  });

  private colMax = computed(() => {
    const out: Record<string, number> = {};
    for (const c of this.cols()) out[c] = Math.max(0, ...this.rows().map((r) => r.cells[c]?.cents ?? 0));
    return out;
  });

  protected tint(cents: number, col: string) {
    const max = this.colMax()[col];
    return max > 0 && cents > 0 ? `color-mix(in srgb, var(--accent) ${Math.round((cents / max) * 22)}%, transparent)` : null;
  }

  protected foot = computed(() => {
    const rows = this.rows();
    const n = this.periods().reduce((s, p) => s + p.months.length, 0) || 1;
    const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((s, r) => s + f(r), 0);
    const total = {
      label: 'Total',
      cells: Object.fromEntries(this.cols().map((c) => [c, sum((r) => r.cells[c]?.cents ?? 0)])),
      total: sum((r) => r.total),
      invested: sum((r) => r.invested),
    };
    const avg = (v: number) => Math.round(v / n);
    return [
      total,
      {
        label: 'Avg / month',
        cells: Object.fromEntries(Object.entries(total.cells).map(([c, v]) => [c, avg(v)])),
        total: avg(total.total),
        invested: avg(total.invested),
      },
    ];
  });

  protected chart = computed(() => {
    const ps = this.periods();
    const cols = this.cols();
    const fixed = FIXED.filter((g) => cols.includes(g));
    const other = cols.filter((g) => !FIXED.includes(g));
    const val = (cells: Record<string, Cell>, gs: string[]) => gs.reduce((s, g) => s + (cells[g]?.cents ?? 0), 0);
    const series = [
      ...fixed.map((g) => ({ name: g, color: chartColor(g), gs: [g] })),
      ...(other.length ? [{ name: 'Other', color: chartColor('Other'), gs: other }] : []),
    ].map((s) => ({
      name: s.name,
      type: 'bar',
      stack: 'spend',
      color: s.color,
      itemStyle: { borderRadius: 0 },
      data: ps.map((p) => val(p.cells, s.gs)),
    }));
    return {
      grid: { left: 8, right: 16, top: 40, bottom: 8, containLabel: true },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (c: number) => fmt(c) },
      xAxis: { type: 'category', data: ps.map((p) => (this.yearly() ? p.period : shortMonth(p.period))) },
      yAxis: { type: 'value', axisLabel: { formatter: (c: number) => '€' + Math.round(c / 100) } },
      series,
    };
  });
}
