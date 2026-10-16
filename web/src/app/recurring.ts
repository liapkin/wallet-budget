import { HttpClient } from '@angular/common/http';
import { Component, inject, resource } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { fmt, groupColor } from './format';
import { Pip } from './ui/pip';
import { Refresh } from './ui/refresh';

type Item = { merchant: string; group: string; typicalCents: number; lastDate: string; nextDate: string; priceChange?: { fromCents: number; toCents: number } };

@Component({
  selector: 'app-recurring',
  imports: [Pip],
  styles: `.kpis { grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); } td .dot { margin-right: var(--sp-2); }`,
  template: `
    <div class="page-head"><h1>Recurring</h1></div>
    @if (data.error()) {
      <p class="err">Failed to load recurring charges.</p>
    } @else if (!data.value()) {
      <div class="card"><div class="skeleton" style="height: 200px"></div></div>
    } @else if (!data.value()!.items.length) {
      <div class="card empty"><app-pip scene="no-history" /><strong>No recurring charges found</strong><span>A charge shows up here after 3 or more monthly occurrences.</span></div>
    } @else {
      <div class="kpis">
        <div class="kpi"><div class="label">Fixed costs per month</div><div class="value">{{ fmt(data.value()!.monthlyTotalCents) }}</div></div>
      </div>
      <div class="scroll tall">
        <table class="stack">
          <thead><tr><th>Merchant</th><th>Group</th><th class="num">Typical</th><th>Next expected</th><th></th></tr></thead>
          <tbody>
            @for (i of items(); track i.merchant) {
              <tr>
                <td class="stack-title"><span class="dot" [style.--dot]="color(i.group)"></span>{{ i.merchant }}</td>
                <td class="muted" data-label="Group">{{ i.group }}</td>
                <td class="num" data-label="Typical">{{ fmt(i.typicalCents) }}</td>
                <td class="nowrap" data-label="Next expected">{{ date(i.nextDate) }}</td>
                <td>
                  @if (i.priceChange; as c) {
                    <span class="badge" [class.bad]="c.toCents > c.fromCents" [class.pos]="c.toCents < c.fromCents">
                      Price {{ c.toCents > c.fromCents ? 'up' : 'down' }} {{ fmt(c.fromCents) }} to {{ fmt(c.toCents) }}
                    </span>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class Recurring {
  protected fmt = fmt;
  protected color = groupColor;
  private http = inject(HttpClient);
  private tick = inject(Refresh).tick;
  protected data = resource({
    params: () => this.tick(),
    loader: () => firstValueFrom(this.http.get<{ items: Item[]; monthlyTotalCents: number }>('/api/recurring')),
  });
  protected items = () => [...(this.data.value()?.items ?? [])].sort((a, b) => b.typicalCents - a.typicalCents);
  protected date = (d: string) =>
    new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(d.slice(0, 10)));
}
