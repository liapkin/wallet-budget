import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, resource, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { athensDay } from '../../../shared/src/month.ts';
import { fmt, groupColor, monthLabel } from './format';
import { Icon } from './ui/icons';
import { Refresh } from './ui/refresh';

type YearData = {
  year: number; totalCents: number; prevTotalCents: number;
  groups: { group: string; cents: number; prevCents: number; deltaCents: number }[];
  best: { month: string; cents: number } | null; worst: { month: string; cents: number } | null;
};

@Component({
  selector: 'app-year',
  imports: [Icon],
  styles: `.kpis { grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); } td .dot { margin-right: var(--sp-2); } .neg { color: var(--good); } .up { color: var(--bad); }`,
  template: `
    <div class="page-head">
      <h1>Year</h1>
      <div class="actions">
        <button class="icon ghost" type="button" aria-label="Previous year" (click)="year.set(year() - 1)"><app-icon name="chevronLeft" /></button>
        <strong>{{ year() }}</strong>
        <button class="icon ghost" type="button" aria-label="Next year" (click)="year.set(year() + 1)"><app-icon name="chevronRight" /></button>
        <a class="ghost" role="button" [href]="'/api/year/' + year() + '?format=csv'" download>Download CSV</a>
      </div>
    </div>
    @if (data.error()) {
      <p class="err">Failed to load year summary.</p>
    } @else if (!data.value()) {
      <div class="card"><div class="skeleton" style="height: 200px"></div></div>
    } @else if (!data.value()!.totalCents && !data.value()!.prevTotalCents) {
      <div class="card empty"><strong>No spending in {{ year() }}</strong></div>
    } @else {
      @let d = data.value()!;
      <div class="kpis">
        <div class="kpi big">
          <div class="label">Spent in {{ d.year }}</div><div class="value">{{ fmt(d.totalCents) }}</div>
          <div class="delta" [class.down]="d.totalCents <= d.prevTotalCents" [class.up]="d.totalCents > d.prevTotalCents">
            {{ sign(d.totalCents - d.prevTotalCents) }}{{ fmt(abs(d.totalCents - d.prevTotalCents)) }} vs {{ fmt(d.prevTotalCents) }} in {{ d.year - 1 }}
          </div>
        </div>
        @if (d.best; as b) { <div class="kpi"><div class="label">Lowest month</div><div class="value">{{ fmt(b.cents) }}</div><div class="sub">{{ month(b.month) }}</div></div> }
        @if (d.worst; as w) { <div class="kpi"><div class="label">Highest month</div><div class="value">{{ fmt(w.cents) }}</div><div class="sub">{{ month(w.month) }}</div></div> }
      </div>
      <div class="scroll tall">
        <table>
          <thead><tr><th>Group</th><th class="num">{{ d.year }}</th><th class="num">{{ d.year - 1 }}</th><th class="num">Change</th></tr></thead>
          <tbody>
            @for (g of groups(); track g.group) {
              <tr>
                <td><span class="dot" [style.--dot]="color(g.group)"></span>{{ g.group }}</td>
                <td class="num">{{ fmt(g.cents) }}</td>
                <td class="num muted">{{ fmt(g.prevCents) }}</td>
                <td class="num" [class.pos]="g.deltaCents < 0" [class.err]="g.deltaCents > 0">{{ sign(g.deltaCents) }}{{ fmt(abs(g.deltaCents)) }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class Year {
  protected fmt = fmt;
  protected color = groupColor;
  protected month = monthLabel;
  protected abs = Math.abs;
  protected sign = (n: number) => (n > 0 ? '+' : n < 0 ? '-' : '');
  protected year = signal(+athensDay().slice(0, 4));
  private http = inject(HttpClient);
  private tick = inject(Refresh).tick;
  protected data = resource({
    params: () => ({ y: this.year(), t: this.tick() }),
    loader: ({ params }) => firstValueFrom(this.http.get<YearData>(`/api/year/${params.y}`)),
  });
  protected groups = computed(() => [...(this.data.value()?.groups ?? [])].sort((a, b) => b.cents - a.cents));
}
