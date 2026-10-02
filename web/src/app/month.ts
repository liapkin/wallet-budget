import { Component, computed, inject, resource, signal } from '@angular/core';
import { allocation, capsFor, monthStatus, savings } from '../../../shared/src/budget.ts';
import { fmt } from '../../../shared/src/money.ts';
import { athensMonth } from '../../../shared/src/month.ts';
import { Api } from './api';

const val = (e: Event) => (e.target as HTMLSelectElement).value;

@Component({
  selector: 'app-month',
  template: `
    <h1>Month</h1>
    <div class="toolbar">
      <select (change)="month.set(val($event))" aria-label="Month">
        @for (m of months(); track m) {
          <option [value]="m" [selected]="m === month()">{{ m }}</option>
        }
      </select>
      <span class="muted">{{ daysLeft() }} days left</span>
      <span class="grow"></span>
      @if (syncMsg()) {
        <span [class.err]="syncErr()" class="muted">{{ syncMsg() }}</span>
      }
      <button [disabled]="syncing()" (click)="sync()">{{ syncing() ? 'Fetching…' : 'Fetch from Wallet' }}</button>
    </div>
    @if (cfg.error() || summary.error()) {
      <p class="err">Failed to load data.</p>
    }
    @if (v(); as v) {
      <div class="kpis">
        <div class="kpi big" [class.good]="v.st.investingSoFar >= 0" [class.bad]="v.st.investingSoFar < 0">
          <span class="label">Investing remainder so far</span>
          <span class="value">{{ fmt(v.st.investingSoFar) }}</span>
          <span class="sub">plan {{ fmt(v.alloc.investing) }}</span>
        </div>
        <div class="kpi">
          <span class="label">Spend this month</span>
          <span class="value">{{ fmt(v.spend) }}</span>
          <span class="sub">excl. transfers &amp; investing</span>
        </div>
        <div class="kpi" [class.bad]="v.st.fun > v.alloc.fun">
          <span class="label">Fun used</span>
          <span class="value">{{ fmt(v.st.fun) }}</span>
          <span class="sub">of {{ fmt(v.alloc.fun) }}</span>
        </div>
        <div class="kpi">
          <span class="label">Takeout per day</span>
          <span class="value">{{ fmt(v.perDay) }}</span>
          <span class="sub">{{ v.takeout.count }} orders, {{ fmt(v.takeout.cents) }}</span>
        </div>
        <div class="kpi">
          <span class="label">Savings</span>
          <span class="value">{{ fmt(v.sav.total) }}</span>
          <span class="sub">emergency {{ fmt(v.sav.emergencyFund) }} · sinking {{ fmt(v.sav.sinkingFund) }}</span>
        </div>
        @for (a of v.extra; track a.label) {
          <div class="kpi">
            <span class="label">{{ a.label }}</span>
            <span class="value">{{ fmt(a.cents) }}</span>
          </div>
        }
      </div>

      <div class="cols">
        <section class="card">
          <h2>Groups</h2>
          @if (!v.caps) {
            <p class="muted">{{ month() === cfg.value()!.caps.bufferMonth ? 'Buffer month — no target' : 'No caps before ' + cfg.value()!.caps.applyFrom }}</p>
          }
          @for (b of v.bars; track b.group) {
            <div class="bar-row">
              <span>{{ b.group }}</span>
              <span class="num" [class.err]="b.over">{{ fmt(b.cents) }}@if (b.target) { <span class="muted"> / {{ fmt(b.target) }}</span> }</span>
              <div class="bar"><i [class.over]="b.over" [style.width.%]="b.pct"></i>@if (b.mark !== null) { <b [style.left.%]="b.mark"></b> }</div>
            </div>
          }
          @if (v.st.unplanned) {
            <p class="muted">Unplanned: {{ fmt(v.st.unplanned) }}</p>
          }
        </section>

        <section class="card">
          <h2>Core lines</h2>
          <table>
            <thead><tr><th>Line</th><th class="num">Plan</th><th class="num">Actual</th></tr></thead>
            <tbody>
              @for (l of v.st.lines; track l.key) {
                <tr>
                  <td>{{ l.label }}<span class="badge" [title]="l.wallet ? 'from Wallet' : 'typed'">{{ l.wallet ? 'W' : 'typed' }}</span></td>
                  <td class="num">{{ fmt(l.plan) }}</td>
                  <td class="num" [class.err]="l.actual !== null && l.actual > l.plan">{{ l.actual === null ? '—' : fmt(l.actual) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </section>
      </div>
    }
  `,
})
export class Month {
  protected fmt = fmt;
  protected val = val;
  private api = inject(Api);
  protected month = signal(athensMonth(new Date().toISOString()));
  protected cfg = resource({ loader: () => this.api.config() });
  protected summary = resource({ loader: () => this.api.summary() });
  private actuals = resource({ loader: () => this.api.actuals() });
  private accounts = resource({ loader: () => this.api.accounts() });
  protected syncing = signal(false);
  protected syncMsg = signal('');
  protected syncErr = signal(false);

  protected months = computed(() => {
    const now = athensMonth(new Date().toISOString());
    return [...new Set([now, this.month(), ...Object.keys(this.summary.value()?.spend ?? {})])].sort().reverse();
  });

  private elapsed = computed(() => {
    const [y, m] = this.month().split('-').map(Number);
    const total = new Date(y, m, 0).getDate();
    const now = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Athens' });
    const day = now.slice(0, 7) === this.month() ? Number(now.slice(8)) : now.slice(0, 7) > this.month() ? total : 0;
    return { total, day };
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
    const caps = capsFor(this.month(), cfg) as Record<string, number> | null;
    const max = Math.max(1, ...shown.map(([, c]) => c), ...Object.values(caps ?? {}));
    const bars = shown
      .map(([group, cents]) => {
        const target = caps?.[group] ?? 0;
        return { group, cents, target, over: !!target && cents > target, pct: (cents / max) * 100, mark: target ? (target / max) * 100 : null };
      })
      .sort((a, b) => b.cents - a.cents);
    const takeout = cells['Takeout'] ?? { cents: 0, count: 0 };
    const balances = this.accounts.value() ?? [];
    const byName = Object.fromEntries(balances.map((a) => [a.name, a.balanceCents ?? 0]));
    const { investmentAccounts, payrollAccount } = cfg.allocation;
    const extra = [
      ...(investmentAccounts.length ? [{ label: 'Invested so far', cents: investmentAccounts.reduce((s, n) => s + (byName[n] ?? 0), 0) }] : []),
      ...(payrollAccount && payrollAccount in byName ? [{ label: 'Payroll account', cents: byName[payrollAccount] }] : []),
    ];
    return {
      st, spend, bars, caps, takeout, extra,
      alloc: allocation(cfg),
      sav: savings(cfg, byName),
      perDay: Math.round(takeout.cents / Math.max(1, this.elapsed().day || this.elapsed().total)),
    };
  });

  protected async sync() {
    this.syncing.set(true);
    this.syncErr.set(false);
    try {
      const r = await this.api.sync();
      this.syncMsg.set(`${r.inserted} new records`);
      this.summary.reload();
      this.accounts.reload();
    } catch (e: any) {
      this.syncErr.set(true);
      this.syncMsg.set(e?.error?.error ?? 'Sync failed');
    } finally {
      this.syncing.set(false);
    }
  }
}
