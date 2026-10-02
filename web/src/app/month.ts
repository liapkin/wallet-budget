import { Component, computed, inject, resource, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { allocation, capsFor, monthStatus, savings } from '../../../shared/src/budget.ts';
import { fmt } from './format.ts';
import { athensMonth } from '../../../shared/src/month.ts';
import { Api } from './api';
import { dayLabel, groupColor, HOLLOW } from './format';
import { ChartView } from './ui/chart';
import { Icon } from './ui/icons';
import { MonthPicker } from './ui/month-picker';
import { Refresh } from './ui/refresh';

const TZ = 'Europe/Athens';
const pct = (a: number, b: number) => (b > 0 ? Math.max(0, Math.min(100, (a / b) * 100)) : 0);

@Component({
  selector: 'app-month',
  imports: [Icon, MonthPicker, ChartView, RouterLink],
  styles: `
    .hero { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: var(--sp-3); margin-bottom: var(--sp-4); }
    .hero .kpi.big { grid-column: span 2; }
    .hero .kpi .over { color: var(--bad); }
    .progress > i { background: var(--dot, var(--accent)); }
    .progress > i.over { background: var(--bad); }
    .rows { display: grid; gap: var(--sp-3); }
    .row { display: grid; grid-template-columns: 1fr auto; gap: var(--sp-1) var(--sp-3); align-items: center; }
    .row .name { display: flex; align-items: center; gap: var(--sp-2); min-width: 0; }
    .row .progress { grid-column: 1 / -1; }
    .latest { list-style: none; margin: 0; padding: 0; }
    .latest li { display: grid; grid-template-columns: 1fr auto auto; gap: var(--sp-3); align-items: center; padding: var(--sp-2) 0; border-bottom: 1px solid var(--border); }
    .latest li:last-child { border-bottom: 0; }
    .latest .note { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
    .latest small { display: block; margin-top: var(--sp-1); }
    .latest .chip { font-size: var(--fs-sm); }
    .sk-kpi { height: 6.5rem; border-radius: var(--r-lg); }
    .sk-card { height: 16rem; border-radius: var(--r-lg); margin-bottom: var(--sp-4); }
    .src { display: inline-flex; align-items: center; margin-left: 6px; vertical-align: middle; color: var(--accent); }
    .src.muted { color: var(--muted); }
    @media (max-width: 640px) { .hero .kpi.big { grid-column: auto; } }
  `,
  template: `
    <div class="page-head">
      <h1>{{ label() }}</h1>
      <app-month-picker [(month)]="month" />
    </div>
    @if (error()) {
      <p class="err">Failed to load data. Check that the server is running, then try Fetch again.</p>
    }
    @if (v(); as v) {
      <div class="hero">
        <div class="kpi big" [class.good]="v.st.investingSoFar >= 0" [class.bad]="v.st.investingSoFar < 0">
          <span class="label">Investing remainder so far</span>
          <span class="value">{{ fmt(v.st.investingSoFar) }}</span>
          <div class="progress" [class.over]="v.st.investingSoFar < 0"><i [class.over]="v.st.investingSoFar < 0" [style.width.%]="v.invPct"></i></div>
          <span class="sub">plan {{ fmt(v.alloc.investing) }}</span>
        </div>
        <div class="kpi">
          <span class="label">Spend this month</span>
          <span class="value">{{ fmt(v.spend) }}</span>
          <div class="progress"><i [class.over]="v.spend > v.budget" [style.width.%]="v.spendPct"></i></div>
          <span class="sub">of {{ fmt(v.budget) }} (core {{ fmt(v.alloc.core) }} + fun {{ fmt(v.alloc.fun) }})</span>
        </div>
        <div class="kpi" [class.bad]="v.funLeft < 0" [class.good]="v.funLeft >= 0">
          <span class="label">Fun left</span>
          <span class="value">{{ fmt(v.funLeft) }}</span>
          <span class="sub">
            @if (daysLeft() > 0 && v.funLeft > 0) { {{ fmt(v.funPerDay) }}/day for {{ daysLeft() }} days left }
            @else if (v.funLeft < 0) { over by {{ fmt(-v.funLeft) }} }
            @else { {{ fmt(v.st.fun) }} of {{ fmt(v.alloc.fun) }} used }
          </span>
        </div>
        <div class="kpi" [class.bad]="v.takeoutOver">
          <span class="label">Takeout</span>
          @if (v.caps) {
            <span class="value">{{ fmt(v.takeout.cents) }}</span>
            <div class="progress"><i [class.over]="v.takeoutOver" [style.width.%]="v.takeoutPct"></i></div>
            <span class="sub">of {{ fmt(v.caps.Takeout) }} cap</span>
            <span class="sub">{{ v.takeout.count }} orders</span>
          } @else {
            <span class="value">{{ fmt(v.takeout.cents) }}</span>
            <span class="sub">No cap this month</span>
            <span class="sub">{{ v.takeout.count }} orders</span>
          }
        </div>
        <div class="kpi">
          <span class="label">Savings</span>
          <span class="value">{{ fmt(v.sav.total) }}</span>
          <dl class="sub" style="display:grid; grid-template-columns:1fr 1fr; gap:var(--sp-2); font-size:var(--fs-sm)">
            <dt class="muted">Emergency target</dt>
            <dd class="num" style="text-align:right">{{ fmt(v.sav.emergencyFund) }}</dd>
            <dt class="muted">Sinking fund</dt>
            <dd class="num" style="text-align:right">{{ fmt(v.sav.sinkingFund) }}</dd>
          </dl>
        </div>
        @for (a of v.extra; track a.label) {
          <div class="kpi">
            <span class="label">{{ a.label }}</span>
            <span class="value">{{ fmt(a.cents) }}</span>
          </div>
        }
      </div>

      <section class="card">
        <div class="card-head">
          <h2>Cumulative spend vs pace</h2>
          <span class="muted">{{ daysLeft() }} days left</span>
        </div>
        @if (records.error()) {
          <p class="err">Failed to load records.</p>
        } @else if (records.value()) {
          @if (daily().hasData) {
            <app-chart [option]="chart()" [height]="280" />
          } @else {
            <div class="empty"><strong>No spending yet</strong><span>Nothing recorded for {{ label() }}.</span></div>
          }
        } @else {
          <div class="skeleton" style="height: 280px"></div>
        }
      </section>

      <div class="cols">
        <section class="card">
          <div class="card-head"><h2>Spend by group</h2></div>
          @if (!v.caps) {
            <p class="muted">{{ month() === cfg.value()!.caps.bufferMonth ? 'Buffer month, no target' : 'No caps before ' + cfg.value()!.caps.applyFrom }}</p>
          }
          @if (!v.bars.length) {
            <div class="empty"><strong>No spending yet</strong><span>Nothing recorded for {{ label() }}.</span></div>
          }
          <div class="rows">
            @for (b of v.bars; track b.group) {
              <div class="row" [style.--dot]="b.color">
                <span class="name"><span class="dot" [class.hollow]="b.hollow"></span>{{ b.group }}</span>
                <span class="num" [class.err]="b.over">{{ fmt(b.cents) }}@if (b.target) { <span class="muted"> / {{ fmt(b.target) }}</span> }</span>
                <div class="progress"><i [class.over]="b.over" [style.width.%]="b.pct"></i>@if (b.mark !== null) { <b [style.left.%]="b.mark" title="cap"></b> }</div>
              </div>
            }
          </div>
          @if (v.st.unplanned) {
            <p class="muted">Unplanned: {{ fmt(v.st.unplanned) }}</p>
          }
        </section>

        <section class="card">
          <div class="card-head"><h2>Core lines</h2></div>
          <div class="rows">
            @for (l of v.st.lines; track l.key) {
              <div class="row">
                <span class="name">{{ l.label }}@if (l.wallet) { <span class="src" title="From Wallet" aria-label="From Wallet"><app-icon name="wallet" [size]="14" /></span> } @else { <span class="src muted" title="Entered by hand" aria-label="Entered by hand"><app-icon name="pencil" [size]="14" /></span> }</span>
                <span class="num">
                  <span [class.err]="l.actual !== null && l.actual > l.plan">{{ l.actual === null ? '—' : fmt(l.actual) }}</span>
                  <span class="muted"> / {{ fmt(l.plan) }}</span>
                </span>
                <div class="progress"><i [class.over]="l.actual !== null && l.actual > l.plan" [style.width.%]="pct(l.actual ?? 0, l.plan)"></i></div>
              </div>
            }
          </div>
        </section>
      </div>

      <section class="card">
        <div class="card-head">
          <h2>Latest records</h2>
          <a routerLink="/records">All records →</a>
        </div>
        @if (records.value() && !latest().length) {
          <div class="empty"><strong>No records</strong><span>Nothing recorded for {{ label() }}.</span></div>
        }
        <ul class="latest">
          @for (r of latest(); track r.id) {
            <li>
              <div style="grid-column:1/3">
                <div class="note">{{ r.note || r.category }}</div>
                <small class="muted">{{ dayLabel(r.dateUtc) }}</small>
              </div>
              <span class="chip" style="grid-column:3; justify-self:end"><span class="dot" [class.hollow]="hollow(r.grp)" [style.--dot]="color(r.grp)"></span>{{ r.grp }}</span>
              <span class="num" [class.pos]="r.amountCents > 0" style="grid-column:3; text-align:right">{{ fmt(r.amountCents) }}</span>
            </li>
          }
        </ul>
      </section>
    } @else if (!error()) {
      <div class="hero">
        <div class="skeleton sk-kpi" style="grid-column: span 2"></div>
        @for (i of [1, 2, 3, 4]; track i) {
          <div class="skeleton sk-kpi"></div>
        }
      </div>
      <div class="skeleton sk-card"></div>
    }
  `,
})
export class Month {
  protected fmt = fmt;
  protected pct = pct;
  protected dayLabel = dayLabel;
  protected color = groupColor;
  protected hollow = (g: string) => HOLLOW.has(g);
  private api = inject(Api);
  private tick = inject(Refresh).tick;
  protected month = signal(athensMonth(new Date().toISOString()));
  protected label = computed(() =>
    new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(this.month() + '-01T00:00:00Z')),
  );
  protected cfg = resource({ params: () => this.tick(), loader: () => this.api.config() });
  protected summary = resource({ params: () => this.tick(), loader: () => this.api.summary() });
  private actuals = resource({ params: () => this.tick(), loader: () => this.api.actuals() });
  private accounts = resource({ params: () => this.tick(), loader: () => this.api.accounts() });
  protected records = resource({
    params: () => ({ month: this.month(), t: this.tick() }),
    loader: ({ params }) => this.api.records({ month: params.month }),
  });
  protected error = computed(() => !!(this.cfg.error() || this.summary.error()));

  private elapsed = computed(() => {
    const [y, m] = this.month().split('-').map(Number);
    const total = new Date(y, m, 0).getDate();
    const now = new Date().toLocaleDateString('sv-SE', { timeZone: TZ });
    const cur = now.slice(0, 7);
    const day = cur === this.month() ? Number(now.slice(8)) : cur > this.month() ? total : 0;
    return { total, day, isCurrent: cur === this.month() };
  });
  protected daysLeft = computed(() => this.elapsed().total - this.elapsed().day);

  protected v = computed(() => {
    const cfg = this.cfg.value();
    const sum = this.summary.value();
    if (!cfg || !sum) return null;
    const cells = sum.spend[this.month()] ?? {};
    const groupSpend = Object.fromEntries(Object.entries(cells).map(([g, c]) => [g, c.cents]));
    const st = monthStatus(cfg, groupSpend, this.actuals.value()?.[this.month()] ?? {});
    const skip = new Set([...cfg.wallet.excludedGroups, 'Income']);
    const shown = Object.entries(groupSpend).filter(([g, c]) => !skip.has(g) && c > 0);
    const spend = shown.reduce((s, [, c]) => s + c, 0);
    const caps = capsFor(this.month(), cfg);
    const max = Math.max(1, ...shown.map(([, c]) => c), ...Object.values(caps ?? {}));
    const bars = shown
      .map(([group, cents]) => {
        const target = (caps as Record<string, number> | null)?.[group] ?? 0;
        return { group, cents, target, color: groupColor(group), hollow: HOLLOW.has(group), over: !!target && cents > target, pct: (cents / max) * 100, mark: target ? (target / max) * 100 : null };
      })
      .sort((a, b) => b.cents - a.cents);
    const takeout = cells['Takeout'] ?? { cents: 0, count: 0 };
    const byName = Object.fromEntries((this.accounts.value() ?? []).map((a) => [a.name, a.balanceCents ?? 0]));
    const { investmentAccounts, payrollAccount } = cfg.allocation;
    const extra = [
      ...(investmentAccounts.length ? [{ label: 'Invested so far', cents: investmentAccounts.reduce((s, n) => s + (byName[n] ?? 0), 0) }] : []),
      ...(payrollAccount && payrollAccount in byName ? [{ label: 'Payroll account', cents: byName[payrollAccount] }] : []),
    ];
    const alloc = allocation(cfg);
    const budget = alloc.core + alloc.fun;
    const funLeft = alloc.fun - st.fun;
    return {
      st, spend, bars, caps, takeout, extra, alloc, budget, funLeft,
      funPerDay: Math.round(funLeft / Math.max(1, this.daysLeft())),
      sav: savings(cfg, byName),
      spendPct: pct(spend, budget),
      invPct: pct(Math.abs(st.investingSoFar), alloc.investing),
      takeoutOver: !!caps && takeout.cents > caps.Takeout,
      takeoutPct: caps ? pct(takeout.cents, caps.Takeout) : 0,
    };
  });

  private spendRows = computed(() => {
    const skip = new Set([...(this.cfg.value()?.wallet.excludedGroups ?? []), 'Income']);
    return (this.records.value() ?? []).filter((r) => !r.isDup && r.type !== 'Income' && !skip.has(r.grp));
  });

  protected latest = computed(() =>
    (this.records.value() ?? [])
      .filter((r) => !r.isDup)
      .sort((a, b) => b.dateUtc.localeCompare(a.dateUtc))
      .slice(0, 5),
  );

  protected daily = computed(() => {
    const { total, day, isCurrent } = this.elapsed();
    const perDay = new Array<number>(total).fill(0);
    for (const r of this.spendRows()) {
      const d = Number(new Date(r.dateUtc).toLocaleDateString('sv-SE', { timeZone: TZ }).slice(8));
      if (d >= 1 && d <= total) perDay[d - 1] -= r.amountCents;
    }
    const upTo = day > 0 ? day : total;
    let acc = 0;
    const cum = perDay.slice(0, upTo).map((c) => (acc += c));
    return { total, upTo, cum, today: isCurrent ? day : null, hasData: acc !== 0 };
  });

  protected chart = computed(() => {
    const d = this.daily();
    const budget = this.v()?.budget ?? 0;
    const days = Array.from({ length: d.total }, (_, i) => String(i + 1));
    const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    const accent = css('--accent'), muted = css('--muted');
    const eur = (c: number) => fmt(Math.round(c));
    return {
      grid: { left: 8, right: 16, top: 24, bottom: 8, containLabel: true },
      tooltip: { trigger: 'axis', valueFormatter: (c: number) => eur(c) },
      xAxis: { type: 'category', data: days, boundaryGap: false },
      yAxis: { type: 'value', axisLabel: { formatter: (c: number) => '€' + Math.round(c / 100) } },
      series: [
        {
          name: 'Spent', type: 'line', data: d.cum, color: accent, symbol: 'none',
          areaStyle: { color: accent, opacity: 0.12 },
          markLine: d.today
            ? { silent: true, symbol: 'none', label: { formatter: 'today', color: muted }, lineStyle: { color: muted, type: 'solid', width: 1 }, data: [{ xAxis: d.today - 1 }] }
            : undefined,
        },
        { name: 'Budget pace', type: 'line', data: days.map((_, i) => Math.round((budget * (i + 1)) / d.total)), color: muted, symbol: 'none', lineStyle: { type: 'dashed', width: 1.5 } },
      ],
    };
  });
}
