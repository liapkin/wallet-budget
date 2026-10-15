import { Component, computed, inject, resource } from '@angular/core';
import { currencySymbol, fmt, parseMoney } from './format.ts';
import type { Config } from '../../../shared/src/types.ts';
import { Api } from './api';
import { MoneyInput } from './ui/money-input';
import { configDraft, editDraft } from './ui/config-draft';

type Key = keyof Config['allocation']['goals'];
const GOALS: { key: Key; label: string }[] = [
  { key: 'emergency', label: 'Emergency fund' },
  { key: 'sinking', label: 'Sinking fund' },
  { key: 'business', label: 'Business account' },
];

@Component({
  selector: 'app-goals',
  imports: [MoneyInput],
  host: { '(window:keydown)': 'key($event)' },
  styles: `
    .acct { display: grid; grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr)); gap: var(--sp-2); margin-bottom: var(--sp-3); }
    .acct label { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-2) var(--sp-3); border: 1px solid var(--border); border-radius: var(--r); cursor: pointer; }
    .acct label:has(input:checked) { border-color: var(--accent); background: var(--accent-soft); }
    .acct .bal { margin-left: auto; color: var(--muted); font-size: var(--fs-sm); }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); gap: var(--sp-3); margin-bottom: var(--sp-3); }
    .affix { display: flex; }
    .affix input { flex: 1; width: auto; }
    .card-head { display: flex; justify-content: space-between; align-items: baseline; }
  `,
  template: `
    <div class="page-head"><h1>Goals</h1></div>
    @if (draft(); as c) {
      @for (g of goals; track g.key) {
        <section class="card">
          <div class="card-head"><h2>{{ g.label }}</h2><span class="muted">{{ fmt(have(g.key)) }} of {{ fmt(c.allocation.goals[g.key].target) }}</span></div>
          <div class="progress"><i [style.width.%]="pct(g.key)"></i></div>
          <h3>Accounts</h3>
          <div class="acct">
            @for (a of accounts.value() ?? []; track a.name) {
              <label><input type="checkbox" [checked]="c.allocation.goals[g.key].accounts.includes(a.name)" (change)="toggle(g.key, a.name, $any($event.target).checked)" />{{ a.name }}<span class="bal">{{ a.balanceCents === null ? '' : fmt(a.balanceCents) }}</span></label>
            }
          </div>
          <div class="grid">
            <label class="field">Target<span class="affix" [attr.data-pre]="currencySymbol()"><input type="text" appMoney [value]="eur(c.allocation.goals[g.key].target)" (change)="money(g.key, 'target', $event)" /></span></label>
            <label class="field">Deposit into
              <select (change)="setDeposit(g.key, $any($event.target).value)">
                <option value="" [selected]="!c.allocation.goals[g.key].depositTo">None</option>
                @for (n of c.allocation.goals[g.key].accounts; track n) {
                  <option [value]="n" [selected]="n === c.allocation.goals[g.key].depositTo">{{ n }}</option>
                }
              </select>
            </label>
            @if (g.key === 'sinking') {
              <label class="field">Monthly cap (0 = no cap)<span class="affix" [attr.data-pre]="currencySymbol()"><input type="text" appMoney [value]="eur(c.allocation.goals.sinking.perMonth)" (change)="money('sinking', 'perMonth', $event)" /></span></label>
            }
          </div>
        </section>
      }

      <section class="card">
        <h2>Payroll and investing</h2>
        <label class="field">Payroll account
          <select (change)="setPayroll($any($event.target).value)">
            <option value="" [selected]="!c.allocation.payrollAccount">None</option>
            @for (a of accounts.value() ?? []; track a.name) {
              <option [value]="a.name" [selected]="a.name === c.allocation.payrollAccount">{{ a.name }}</option>
            }
          </select>
        </label>
        <h3>Investment accounts</h3>
        <div class="acct">
          @for (a of accounts.value() ?? []; track a.name) {
            <label><input type="checkbox" [checked]="c.allocation.investmentAccounts.includes(a.name)" (change)="toggleInvest(a.name, $any($event.target).checked)" />{{ a.name }}<span class="bal">{{ a.balanceCents === null ? '' : fmt(a.balanceCents) }}</span></label>
          }
        </div>
        <h3>Hide accounts</h3>
        <div class="acct">
          @for (n of hideable(); track n) {
            <label><input type="checkbox" [checked]="c.allocation.hiddenAccounts.includes(n)" (change)="toggleHidden(n, $any($event.target).checked)" />{{ n }}</label>
          }
        </div>
        <p class="muted">Hidden accounts are left out of totals (e.g. a Wallet account replaced by tracked holdings).</p>
      </section>

      @if (dirty()) {
        <div class="savebar" role="status">
          <span class="muted grow">Unsaved changes</span>
          <button class="ghost" (click)="discard()" [disabled]="saving()">Discard</button>
          <button class="primary" (click)="save()" [disabled]="saving()">{{ saving() ? 'Saving…' : 'Save' }}</button>
        </div>
      }
    } @else if (failed()) {
      <p class="err">Failed to load config.</p>
    } @else {
      <span class="skeleton" style="height:12rem"></span>
    }
  `,
})
export class GoalsComponent {
  protected fmt = fmt;
  protected currencySymbol = currencySymbol;
  protected goals = GOALS;
  private api = inject(Api);
  protected accounts = resource({ loader: () => this.api.accounts() });
  private cd = configDraft('Goals saved');
  protected draft = this.cd.draft;
  protected failed = this.cd.failed;
  protected saving = this.cd.saving;
  protected dirty = this.cd.dirty;
  protected discard = this.cd.discard;
  protected save = this.cd.save;

  private balances = computed(() => Object.fromEntries((this.accounts.value() ?? []).map((a) => [a.name, a.balanceCents ?? 0])));
  // the API omits hidden accounts, so keep checked ones listed to allow unhiding
  protected hideable = computed(() => [...new Set([...(this.accounts.value() ?? []).map((a) => a.name), ...(this.draft()?.allocation.hiddenAccounts ?? [])])]);
  protected eur = (c: number) => String(c / 100);
  protected have = (k: Key) => this.draft()!.allocation.goals[k].accounts.reduce((s, n) => s + (this.balances()[n] ?? 0), 0);
  protected pct = (k: Key) => {
    const t = this.draft()!.allocation.goals[k].target;
    return t > 0 ? Math.min(100, (this.have(k) / t) * 100) : 0;
  };

  private edit = (fn: (a: Config['allocation']) => void) => editDraft(this.draft, (c) => fn(c.allocation));

  protected money(k: Key, f: 'target' | 'perMonth', e: Event) {
    const el = e.target as HTMLInputElement;
    const cents = parseMoney(el.value);
    if (cents === null) {
      el.value = this.eur(this.draft()!.allocation.goals[k][f]);
      return;
    }
    this.edit((a) => (a.goals[k][f] = cents));
  }

  protected toggle(k: Key, name: string, on: boolean) {
    this.edit((a) => {
      const g = a.goals[k];
      g.accounts = on ? [...new Set([...g.accounts, name])] : g.accounts.filter((n) => n !== name);
      if (!g.accounts.includes(g.depositTo)) g.depositTo = '';
    });
  }

  protected setDeposit(k: Key, v: string) {
    this.edit((a) => (a.goals[k].depositTo = v));
  }

  protected setPayroll(v: string) {
    this.edit((a) => (a.payrollAccount = v || null));
  }

  protected toggleInvest(name: string, on: boolean) {
    this.edit((a) => (a.investmentAccounts = on ? [...new Set([...a.investmentAccounts, name])] : a.investmentAccounts.filter((n) => n !== name)));
  }

  protected toggleHidden(name: string, on: boolean) {
    this.edit((a) => (a.hiddenAccounts = on ? [...new Set([...a.hiddenAccounts, name])] : a.hiddenAccounts.filter((n) => n !== name)));
  }

  protected key(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      void this.save();
    }
  }
}
