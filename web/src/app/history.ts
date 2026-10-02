import { Component, computed, inject, resource, signal } from '@angular/core';
import { fmt } from '../../../shared/src/money.ts';
import { byYear, type Cell } from '../../../shared/src/summary.ts';
import { Api } from './api';

const COUNTED = ['Takeout', 'Kiosk'];
const FIRST_FEED = '2026-07';

@Component({
  selector: 'app-history',
  styles: '.sep { border-left: 2px solid var(--border); }',
  template: `
    <h1>History</h1>
    <div class="toolbar">
      <button [class.on]="!yearly()" (click)="yearly.set(false)">Month</button>
      <button [class.on]="yearly()" (click)="yearly.set(true)">Year</button>
    </div>
    @if (data.error()) {
      <p class="err">Failed to load summary.</p>
    }
    <div class="scroll">
      <table>
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
              <td>
                {{ r.period }}
                @if (r.lower) {
                  <span class="badge" title="no bank feed before Jul 2026">lower bound</span>
                }
              </td>
              @for (c of cols(); track c) {
                <td class="num">
                  {{ fmt(r.cells[c]?.cents ?? 0) }}
                  @if (counted.includes(c) && r.cells[c]) {
                    <small class="muted">({{ r.cells[c].count }})</small>
                  }
                </td>
              }
              <td class="num strong">{{ fmt(r.total) }}</td>
              <td class="num sep">{{ fmt(r.cells['Investing']?.cents ?? 0) }}</td>
              @if (yearly()) {
                <td class="num">{{ fmt(r.avg) }}</td>
              }
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class History {
  protected fmt = fmt;
  protected counted = COUNTED;
  protected yearly = signal(false);
  private api = inject(Api);
  protected data = resource({ loader: () => this.api.summary() });
  private meta = resource({ loader: () => this.api.meta() });
  private excluded = computed(() => this.meta.value()?.excludedGroups ?? []);
  protected cols = computed(() => (this.meta.value()?.groups ?? []).filter((g) => g !== 'Income' && !this.excluded().includes(g)));

  protected rows = computed(() => {
    const spend = this.data.value()?.spend ?? {};
    const src = this.yearly() ? byYear(spend) : spend;
    return Object.keys(src)
      .sort()
      .reverse()
      .map((period) => {
        const cells: Record<string, Cell> = src[period];
        const total = Object.entries(cells).reduce((a, [g, c]) => a + (this.excluded().includes(g) ? 0 : c.cents), 0);
        const months = Object.keys(spend).filter((m) => m.startsWith(period));
        return {
          period,
          cells,
          total,
          avg: Math.round(total / months.length),
          lower: months.some((m) => m < FIRST_FEED),
        };
      });
  });
}
