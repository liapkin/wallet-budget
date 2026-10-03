import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, resource } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { Account } from './api';
import { axisEuro, currencySymbol, fmt } from './format';
import { ChartView } from './ui/chart';
import { Refresh } from './ui/refresh';

type Snap = { day: string; account: string; balanceCents: number };
type Alloc = { savingsAccounts: string[]; investmentAccounts: string[] };

@Component({
  selector: 'app-networth',
  imports: [ChartView],
  styles: `.kpis { grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); }`,
  template: `
    <div class="page-head"><h1>Net worth</h1></div>
    @if (data.error()) {
      <p class="err">Failed to load balances.</p>
    } @else if (!data.value()) {
      <div class="card"><div class="skeleton" style="height: 240px"></div></div>
    } @else {
      <div class="kpis">
        <div class="kpi"><div class="label">Savings</div><div class="value">{{ fmt(today().savings) }}</div></div>
        <div class="kpi"><div class="label">Invested</div><div class="value">{{ fmt(today().invested) }}</div></div>
        <div class="kpi big"><div class="label">Total</div><div class="value">{{ fmt(today().total) }}</div></div>
      </div>
      @if (days().length > 1) {
        <section class="card"><div class="card-head"><h2>Balance over time</h2></div><app-chart [option]="chart()" [height]="320" /></section>
      }
      <p class="muted">
        @if (days().length) { History starts on {{ days()[0] }}; a point is added on every fetch. } @else { No history yet; a point is added on every fetch. }
      </p>
    }
  `,
})
export class NetWorth {
  protected fmt = fmt;
  private http = inject(HttpClient);
  private tick = inject(Refresh).tick;
  protected data = resource({
    params: () => this.tick(),
    loader: async () => {
      const [accounts, history, cfg] = await Promise.all([
        firstValueFrom(this.http.get<Account[]>('/api/accounts')),
        firstValueFrom(this.http.get<Snap[]>('/api/balances/history')),
        firstValueFrom(this.http.get<{ allocation: Alloc }>('/api/config')),
      ]);
      return { accounts, history, alloc: cfg.allocation };
    },
  });

  private split(rows: { name: string; cents: number }[]) {
    const a = this.data.value()!.alloc;
    const sum = (names: string[]) => rows.filter((r) => names.includes(r.name)).reduce((s, r) => s + r.cents, 0);
    return { savings: sum(a.savingsAccounts), invested: sum(a.investmentAccounts), total: rows.reduce((s, r) => s + r.cents, 0) };
  }

  protected today = computed(() =>
    this.split(this.data.value()!.accounts.map((a) => ({ name: a.name, cents: a.balanceCents ?? 0 }))),
  );
  protected days = computed(() => [...new Set(this.data.value()?.history.map((h) => h.day))].sort());

  protected chart = computed(() => {
    const h = this.data.value()!.history;
    const days = this.days();
    const per = days.map((d) => this.split(h.filter((x) => x.day === d).map((x) => ({ name: x.account, cents: x.balanceCents }))));
    const symbol = currencySymbol();
    const line = (name: string, k: 'savings' | 'invested' | 'total') => ({ name, type: 'line', data: per.map((p) => p[k]) });
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
      series: [line('Savings', 'savings'), line('Invested', 'invested'), line('Total', 'total')],
    };
  });
}
