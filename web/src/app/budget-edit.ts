import { Component, computed, inject, resource, signal } from '@angular/core';
import { allocation, annualInvesting } from '../../../shared/src/budget.ts';
import { fmt, toCents } from '../../../shared/src/money.ts';
import type { Config } from '../../../shared/src/types.ts';
import { Api } from './api';

const val = (e: Event) => (e.target as HTMLInputElement | HTMLSelectElement).value;
const num = (e: Event) => Number(val(e).replace(',', '.')) || 0;

@Component({
  selector: 'app-budget-edit',
  template: `
    <h1>Budget</h1>
    @if (cfg(); as c) {
      <div class="toolbar">
        <button class="primary" (click)="save()">Save</button>
        <span [class.err]="isErr()" class="muted">{{ msg() }}</span>
      </div>

      <section class="card">
        <h2>Allocation</h2>
        <p class="strong">
          Salary {{ fmt(a().salary) }} = core {{ fmt(a().core) }} + fun {{ fmt(a().fun) }} + sinking {{ fmt(a().sinking) }} + investing
          <span [class.err]="a().investing < 0" [class.pos]="a().investing >= 0">{{ fmt(a().investing) }}</span>
        </p>
        <p class="muted">Annual investing incl. bonuses: <span class="strong">{{ fmt(annual()) }}</span></p>
        <div class="form">
          <label>Salary €<input [value]="eur(c.income.netSalaryPerMonth)" (change)="money('income.netSalaryPerMonth', $event)" /></label>
          <label>Fun €<input [value]="eur(c.allocation.funPerMonth)" (change)="money('allocation.funPerMonth', $event)" /></label>
          <label>Sinking top-up €<input [value]="eur(c.allocation.sinkingFundTopUpPerMonth)" (change)="money('allocation.sinkingFundTopUpPerMonth', $event)" /></label>
          <label>Emergency months<input [value]="c.allocation.emergencyFundMonthsOfCore" (change)="plain('allocation.emergencyFundMonthsOfCore', $event)" /></label>
          <label>Bank savings € (fallback)<input [value]="eur(c.allocation.bankSavings)" (change)="money('allocation.bankSavings', $event)" /></label>
          <label>Cash savings €<input [value]="eur(c.allocation.cashSavings)" (change)="money('allocation.cashSavings', $event)" /></label>
        </div>
        <div class="form">
          @for (m of bonusMonths(); track m) {
            <label>Bonus {{ m }} (× salary)<input [value]="c.income.bonusMonths[m]" (change)="plain('income.bonusMonths.' + m, $event)" /></label>
          }
          <label class="check"><input type="checkbox" [checked]="c.income.bonusesGoToInvesting" (change)="check('income.bonusesGoToInvesting', $event)" /> Bonuses go to investing</label>
        </div>
      </section>

      <section class="card">
        <h2>Core lines</h2>
        <table>
          <thead><tr><th>Label</th><th class="num">Plan €</th><th>Source</th><th>Standing</th><th>In plan</th><th></th></tr></thead>
          <tbody>
            @for (l of c.coreExpenses; track $index; let i = $index) {
              <tr>
                <td><input [value]="l.label" (change)="plain('coreExpenses.' + i + '.label', $event, true)" /></td>
                <td class="num"><input size="7" [value]="eur(l.plan)" (change)="money('coreExpenses.' + i + '.plan', $event)" /></td>
                <td><input [value]="l.source" (change)="plain('coreExpenses.' + i + '.source', $event, true)" title="manual or wallet:Group+Group" /></td>
                <td><input type="checkbox" [checked]="l.standing !== false" (change)="check('coreExpenses.' + i + '.standing', $event)" /></td>
                <td><input type="checkbox" [checked]="l.inPlan !== false" (change)="check('coreExpenses.' + i + '.inPlan', $event)" /></td>
                <td><button class="link danger" (click)="removeLine(i)">Remove</button></td>
              </tr>
            }
          </tbody>
        </table>
        <button class="link" (click)="addLine()">+ Add line</button>
      </section>

      <section class="card">
        <h2>Caps</h2>
        <div class="form">
          <label>Apply from<input type="date" [value]="c.caps.applyFrom" (change)="plain('caps.applyFrom', $event, true)" /></label>
          <label>Buffer month<input [value]="c.caps.bufferMonth ?? ''" placeholder="YYYY-MM" (change)="set('caps.bufferMonth', val($event) || null)" /></label>
          <label>Takeout €<input [value]="eur(c.caps.takeoutPerMonth)" (change)="money('caps.takeoutPerMonth', $event)" /></label>
          <label>Kiosk €<input [value]="eur(c.caps.kioskPerMonth)" (change)="money('caps.kioskPerMonth', $event)" /></label>
        </div>
      </section>

      <section class="card">
        <h2>Savings accounts</h2>
        @for (a of accounts.value() ?? []; track a.name) {
          <label class="check">
            <input type="checkbox" [checked]="c.allocation.savingsAccounts.includes(a.name)" (change)="toggle('allocation.savingsAccounts', a.name, $event)" />
            {{ a.name }} <span class="muted">{{ a.balanceCents === null ? '' : fmt(a.balanceCents) }}</span>
          </label>
        } @empty {
          <p class="muted">No accounts yet; run a Wallet fetch. Bank savings fallback is used.</p>
        }
      </section>

      <section class="card">
        <h2>Investment accounts</h2>
        @for (a of accounts.value() ?? []; track a.name) {
          <label class="check">
            <input type="checkbox" [checked]="c.allocation.investmentAccounts.includes(a.name)" (change)="toggle('allocation.investmentAccounts', a.name, $event)" />
            {{ a.name }} <span class="muted">{{ a.balanceCents === null ? '' : fmt(a.balanceCents) }}</span>
          </label>
        }
        <label>Payroll account
          <select (change)="set('allocation.payrollAccount', val($event) || null)">
            <option value="" [selected]="!c.allocation.payrollAccount">None</option>
            @for (a of accounts.value() ?? []; track a.name) {
              <option [selected]="a.name === c.allocation.payrollAccount">{{ a.name }}</option>
            }
          </select>
        </label>
      </section>

      <section class="card">
        <h2>Groups</h2>
        <h3>Fun groups</h3>
        <div class="checks">
          @for (g of c.wallet.groups; track g) {
            <label class="check"><input type="checkbox" [checked]="c.allocation.funGroups.includes(g)" (change)="toggle('allocation.funGroups', g, $event)" /> {{ g }}</label>
          }
        </div>
        <h3>Covered by core lines (not counted as unplanned)</h3>
        <div class="checks">
          @for (g of c.wallet.groups; track g) {
            <label class="check"><input type="checkbox" [checked]="c.allocation.coveredByCoreGroups.includes(g)" (change)="toggle('allocation.coveredByCoreGroups', g, $event)" /> {{ g }}</label>
          }
        </div>
      </section>

      <section class="card">
        <h2>Merchant keywords</h2>
        <table>
          <tbody>
            @for (k of c.wallet.merchantKeywords; track $index; let i = $index) {
              <tr>
                <td><input [value]="k.keyword" (change)="plain('wallet.merchantKeywords.' + i + '.keyword', $event, true)" /></td>
                <td>
                  <select (change)="plain('wallet.merchantKeywords.' + i + '.group', $event, true)">
                    @for (g of c.wallet.groups; track g) {
                      <option [selected]="g === k.group">{{ g }}</option>
                    }
                  </select>
                </td>
                <td><button class="link danger" (click)="remove('wallet.merchantKeywords', i)">Delete</button></td>
              </tr>
            }
          </tbody>
        </table>
        <button class="link" (click)="add('wallet.merchantKeywords', { keyword: '', group: c.wallet.groups[0] })">+ Add keyword</button>
      </section>

      <section class="card">
        <h2>Category map</h2>
        <table>
          <tbody>
            @for (k of c.wallet.categoryMap; track $index; let i = $index) {
              <tr>
                <td><input [value]="k.walletCategory" (change)="plain('wallet.categoryMap.' + i + '.walletCategory', $event, true)" /></td>
                <td>
                  <select (change)="plain('wallet.categoryMap.' + i + '.group', $event, true)">
                    @for (g of c.wallet.groups; track g) {
                      <option [selected]="g === k.group">{{ g }}</option>
                    }
                  </select>
                </td>
                <td><button class="link danger" (click)="remove('wallet.categoryMap', i)">Delete</button></td>
              </tr>
            }
          </tbody>
        </table>
        <button class="link" (click)="add('wallet.categoryMap', { walletCategory: '', group: c.wallet.groups[0] })">+ Add category</button>
      </section>
    }
  `,
})
export class BudgetEdit {
  protected fmt = fmt;
  protected val = val;
  private api = inject(Api);
  protected accounts = resource({ loader: () => this.api.accounts() });
  protected cfg = signal<Config | null>(null);
  protected msg = signal('');
  protected isErr = signal(false);
  protected a = computed(() => allocation(this.cfg()!));
  protected annual = computed(() => annualInvesting(this.cfg()!));
  protected bonusMonths = computed(() => Object.keys(this.cfg()?.income.bonusMonths ?? {}));

  constructor() {
    this.api.config().then((c) => this.cfg.set(c), () => this.note('Failed to load config', true));
  }

  protected eur = (c: number) => String(c / 100);

  // ponytail: edits are applied by dotted path on a cloned config; no per-field handlers
  private edit(fn: (c: any) => void) {
    const c = structuredClone(this.cfg()!);
    fn(c);
    this.cfg.set(c);
  }
  protected set(path: string, v: unknown) {
    const keys = path.split('.');
    const last = keys.pop()!;
    this.edit((c) => (keys.reduce((o, k) => o[k], c)[last] = v));
  }
  private list(c: any, path: string) {
    return path.split('.').reduce((o, k) => o[k], c) as any[];
  }

  protected money = (path: string, e: Event) => this.set(path, toCents(num(e)));
  protected plain = (path: string, e: Event, text = false) => this.set(path, text ? val(e) : num(e));
  protected check = (path: string, e: Event) => this.set(path, (e.target as HTMLInputElement).checked);
  protected toggle = (path: string, item: string, e: Event) => {
    const on = (e.target as HTMLInputElement).checked;
    this.edit((c) => {
      const l = this.list(c, path);
      if (on && !l.includes(item)) l.push(item);
      if (!on) l.splice(l.indexOf(item), 1);
    });
  };
  protected add = (path: string, item: object) => this.edit((c) => this.list(c, path).push(item));
  protected remove = (path: string, i: number) => this.edit((c) => this.list(c, path).splice(i, 1));
  protected removeLine = (i: number) => this.remove('coreExpenses', i);
  protected addLine = () =>
    this.edit((c) => {
      let n = 1;
      while (c.coreExpenses.some((l: any) => l.key === 'line' + n)) n++;
      c.coreExpenses.push({ key: 'line' + n, label: 'New line', plan: 0, source: 'manual' });
    });

  private note(m: string, err = false) {
    this.msg.set(m);
    this.isErr.set(err);
  }

  protected async save() {
    try {
      this.cfg.set(await this.api.saveConfig(this.cfg()!));
      this.note('Saved');
    } catch (e: any) {
      this.note(e?.error?.error ?? 'Save failed', true);
    }
  }
}
