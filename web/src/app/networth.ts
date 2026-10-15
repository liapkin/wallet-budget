import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, resource } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { Account } from './api';
import { savingsAccounts } from '../../../shared/src/budget.ts';
import type { Config } from '../../../shared/src/types.ts';
import { axisEuro, currencySymbol, fmt } from './format';
import { ChartView } from './ui/chart';
import { Refresh } from './ui/refresh';
import { phone } from './ui/viewport';

type Snap = { day: string; account: string; balanceCents: number };

@Component({
  selector: 'app-networth',
  imports: [ChartView],
  styles: `.kpis { grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); } .card { min-width: 0; }`,
  template: `
    <div class="page-head"><h1>Net worth</h1></div>
    @if (data.error()) {
      <p class="err">Failed to load balances.</p>
    } @else if (!data.value()) {
      <div class="card"><div class="skeleton" style="height: 240px"></div></div>
    } @else {
      <div class="kpis">
        <div class="kpi"><div class="label">Savings</div><div class="value">{{ fmt(today().savings) }}</div></div>
        @for (n of invNames(); track n) {
          <div class="kpi"><div class="label">{{ n }}</div><div class="value">{{ fmt(today().inv[n]) }}</div></div>
        }
        <div class="kpi big"><div class="label">Total</div><div class="value">{{ fmt(today().total) }}</div></div>
      </div>
      @if (days().length > 1) {
        <section class="card"><div class="card-head"><h2>Balance over time</h2></div><app-chart [option]="chart()" [height]="chartH()" /></section>
      }
      <p class="muted">
        @if (days().length) { History starts on {{ days()[0] }}; a point is added on every fetch. } @else { No history yet; a point is added on every fetch. }
      </p>
    }
  `,
})
export class NetWorth {
  protected fmt = fmt;
  protected chartH = computed(() => (phone() ? 260 : 320));
  private http = inject(HttpClient);
  private tick = inject(Refresh).tick;
  protected data = resource({
    params: () => this.tick(),
    loader: async () => {
      const [accounts, history, cfg] = await Promise.all([
        firstValueFrom(this.http.get<Account[]>('/api/accounts')),
        firstValueFrom(this.http.get<Snap[]>('/api/balances/history')),
        firstValueFrom(this.http.get<Config>('/api/config')),
      ]);
      return { accounts, history, cfg };
    },
  });

  private split(rows: { name: string; cents: number }[]) {
    const cfg = this.data.value()!.cfg;
    const sum = (names: string[]) => rows.filter((r) => names.includes(r.name)).reduce((s, r) => s + r.cents, 0);
    return { savings: sum(savingsAccounts(cfg)), inv: Object.fromEntries(cfg.allocation.investmentAccounts.map((n) => [n, sum([n])])), total: rows.reduce((s, r) => s + r.cents, 0) };
  }

  protected today = computed(() =>
    this.split(this.data.value()!.accounts.map((a) => ({ name: a.name, cents: a.balanceCents ?? 0 }))),
  );
  protected invNames = computed(() => this.data.value()!.cfg.allocation.investmentAccounts);
  protected days = computed(() => [...new Set(this.data.value()?.history.map((h) => h.day))].sort());

  protected chart = computed(() => {
    const h = this.data.value()!.history;
    const days = this.days();
    const per = days.map((d) => this.split(h.filter((x) => x.day === d).map((x) => ({ name: x.account, cents: x.balanceCents }))));
    const symbol = currencySymbol();
    const line = (name: string, get: (p: (typeof per)[number]) => number) => ({ name, type: 'line', data: per.map(get) });
    return {
      grid: { left: 8, right: 16, top: 44, bottom: 8, containLabel: true },
      tooltip: {
        trigger: 'axis',
        formatter: (ps: { axisValue: string; seriesName: string; value: number; marker: string }[]) =>
          `<strong>${ps[0]?.axisValue ?? ''}</strong>` +
          ps.map((p) => `<div style="display:flex;justify-content:space-between;gap:16px">${p.marker}<span style="flex:1">${p.seriesName}</span><span>${fmt(p.value)}</span></div>`).join(''),
      },
      xAxis: { type: 'category', data: days },
      yAxis: {
        type: 'value',
        axisLabel: { formatter: axisEuro(symbol) },
        splitLine: { lineStyle: { type: 'dashed', opacity: 0.35 } },
      },
      series: [line('Savings', (p) => p.savings), ...this.invNames().map((n) => line(n, (p) => p.inv[n])), line('Total', (p) => p.total)],
    };
  });
}
