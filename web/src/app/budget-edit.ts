import { Component, computed, inject, resource, signal } from '@angular/core';
import { allocation, annualInvesting, corePlan } from '../../../shared/src/budget.ts';
import { currency, currencySymbol, fmt } from './format.ts';
import { groupDot } from './format';
import { toCents } from '../../../shared/src/money.ts';
import type { Config } from '../../../shared/src/types.ts';
import { Api } from './api';
import { Combo, type ComboOption } from './ui/combo';
import { DateTime } from './ui/date-time';
import { Icon } from './ui/icons';
import { MoneyInput } from './ui/money-input';
import { Refresh } from './ui/refresh';
import { Toast } from './ui/toast';

const val = (e: Event) => (e.target as HTMLInputElement | HTMLSelectElement).value;
const num = (e: Event) => Number(val(e).replace(',', '.')) || 0;

const SECTIONS = [
  ['income', 'Income & allocation'],
  ['core', 'Core lines'],
  ['caps', 'Caps'],
  ['accounts', 'Accounts'],
  ['classification', 'Classification'],
];

@Component({
  selector: 'app-budget-edit',
  imports: [Combo, DateTime, Icon, MoneyInput],
  host: { '(window:keydown)': 'key($event)', '(window:beforeunload)': 'unload($event)' },
  styles: `
    .layout { display: grid; grid-template-columns: 11rem 1fr; gap: var(--sp-5); align-items: start; }
    nav { position: sticky; top: var(--sp-4); display: flex; flex-direction: column; gap: 2px; }
    nav button { text-align: left; border: 0; box-shadow: none; background: none; color: var(--muted); }
    nav button:hover { background: var(--surface-2); color: var(--text); border-color: transparent; }
    section.card { scroll-margin-top: var(--sp-4); }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sp-3) var(--sp-4); }
    .grid .affix { display: flex; }
    .grid .affix input { flex: 1; width: auto; }
    .grid .field input:not([type='checkbox']):not(.in-affix) { width: 100%; }
    .grid .field input[type='number'], .grid .field input[type='date'], .grid .field input[type='month'] { width: 100%; }
    h3 { margin-top: var(--sp-5); }
    .stack { display: flex; height: 2.25rem; border-radius: var(--r); overflow: hidden; gap: 2px; background: var(--surface-2); }
    .stack > div { min-width: 0; }
    .legend { display: grid; grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr)); gap: var(--sp-3); margin-top: var(--sp-3); }
    .legend .l { display: flex; align-items: center; gap: var(--sp-2); color: var(--muted); font-size: var(--fs-sm); }
    .legend .v { display: block; color: var(--text); font-weight: 600; font-size: var(--fs); }
    .bad .v { color: var(--bad); }
    .annual { margin: var(--sp-3) 0 0; color: var(--muted); }
    .card td .affix input { width: 5.5rem; }
    tfoot td { font-weight: 600; border-top: 1px solid var(--border); border-bottom: 0; }
    .tools { display: flex; gap: var(--sp-2); align-items: center; margin-bottom: var(--sp-3); }
    .tools input { flex: 1; max-width: 20rem; }
    .acct { display: grid; grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr)); gap: var(--sp-2); }
    .acct label { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-2) var(--sp-3); border: 1px solid var(--border); border-radius: var(--r); cursor: pointer; }
    .acct label:has(input:checked) { border-color: var(--accent); background: var(--accent-soft); }
    .acct .bal { margin-left: auto; color: var(--muted); font-size: var(--fs-sm); }
    .chips { display: flex; flex-wrap: wrap; gap: var(--sp-2); }
    @media (max-width: 800px) {
      .layout { grid-template-columns: 1fr; }
      nav { position: static; flex-direction: row; flex-wrap: wrap; }
      .grid { grid-template-columns: 1fr; }
    }
  `,
  template: `
    <div class="page-head"><h1>Budget</h1></div>
    @if (draft(); as c) {
      <div class="layout">
        <nav aria-label="Sections">
          @for (s of sections; track s[0]) {
            <button (click)="go(s[0])">{{ s[1] }}</button>
          }
        </nav>
        <div>
          <div class="card">
            <div class="card-head"><h2>Monthly allocation</h2><span class="muted">of {{ fmt(a().salary) }} salary</span></div>
            <div class="stack" role="img" aria-label="Allocation of salary">
              @for (s of segs(); track s.name) {
                <div [style.flex-grow]="s.v" [style.background]="s.color"></div>
              }
            </div>
            <div class="legend">
              @for (s of segs(); track s.name) {
                <div class="l" [class.bad]="s.v < 0 || (s.name === 'Investing' && a().investing < 0)">
                  <span class="dot" [style.--dot]="s.color"></span>
                  <span>{{ s.name }}<span class="v">{{ fmt(s.amount) }}</span></span>
                </div>
              }
            </div>
            <p class="annual">Annual investing incl. bonuses: <span class="strong" [class.err]="annual() < 0">{{ fmt(annual()) }}</span></p>
          </div>

          <section class="card" id="income">
            <h2>Income &amp; allocation</h2>
            <div class="grid">
              <label class="field">Net salary / month<span class="affix" [attr.data-pre]="currencySymbol()"><input class="in-affix" appMoney type="text" [value]="eur(c.income.netSalaryPerMonth)" (change)="money('income.netSalaryPerMonth', $event)" /></span></label>
              <label class="field">Fun / month<span class="affix" [attr.data-pre]="currencySymbol()"><input class="in-affix" appMoney type="text" [value]="eur(c.allocation.funPerMonth)" (change)="money('allocation.funPerMonth', $event)" /></span></label>
              <label class="field">Sinking fund top-up / month<span class="affix" [attr.data-pre]="currencySymbol()"><input class="in-affix" appMoney type="text" [value]="eur(c.allocation.sinkingFundTopUpPerMonth)" (change)="money('allocation.sinkingFundTopUpPerMonth', $event)" /></span></label>
              <label class="field">Bank savings (fallback)<span class="affix" [attr.data-pre]="currencySymbol()"><input class="in-affix" appMoney type="text" [value]="eur(c.allocation.bankSavings)" (change)="money('allocation.bankSavings', $event)" /></span></label>
              <label class="field">Cash savings<span class="affix" [attr.data-pre]="currencySymbol()"><input class="in-affix" appMoney type="text" [value]="eur(c.allocation.cashSavings)" (change)="money('allocation.cashSavings', $event)" /></span></label>
              <label class="field">Annual irregulars<span class="affix" [attr.data-pre]="currencySymbol()"><input class="in-affix" appMoney type="text" [value]="eur(c.allocation.annualIrregulars)" (change)="money('allocation.annualIrregulars', $event)" /></span></label>
              <label class="field">Emergency fund<span class="affix" data-suf="months of core"><input class="in-affix" inputmode="decimal" [value]="c.allocation.emergencyFundMonthsOfCore" (change)="plain('allocation.emergencyFundMonthsOfCore', $event)" /></span></label>
            </div>
            <h3>Bonus months (multiples of salary)</h3>
            <div class="grid">
              @for (m of bonusMonths(); track m) {
                <label class="field">{{ m }}<span class="affix" data-suf="× salary"><input class="in-affix" inputmode="decimal" [value]="c.income.bonusMonths[m]" (change)="plain('income.bonusMonths.' + m, $event)" /></span></label>
              }
            </div>
            <p><label class="switch"><input type="checkbox" [checked]="c.income.bonusesGoToInvesting" (change)="check('income.bonusesGoToInvesting', $event)" /> Bonuses go to investing</label></p>
          </section>

          <section class="card" id="core">
            <h2>Core lines</h2>
            <div class="scroll" style="box-shadow:none">
              <table>
                <thead><tr><th>Label</th><th>Plan</th><th>Source</th><th>Standing</th><th>In plan</th><th>Note</th><th></th></tr></thead>
                <tbody>
                  @for (l of c.coreExpenses; track $index; let i = $index) {
                    <tr>
                      <td><input [value]="l.label" (change)="plain('coreExpenses.' + i + '.label', $event, true)" /></td>
                      <td><span class="affix" [attr.data-pre]="currencySymbol()"><input appMoney type="text" [value]="eur(l.plan)" (change)="money('coreExpenses.' + i + '.plan', $event)" /></span></td>
                      <td>
                        <app-combo [options]="sourceOptions(l.source)" [value]="l.source" ariaLabel="Source" (changed)="set('coreExpenses.' + i + '.source', $event)" />
                      </td>
                      <td><label class="switch"><input type="checkbox" aria-label="Standing" [checked]="l.standing !== false" (change)="check('coreExpenses.' + i + '.standing', $event)" /></label></td>
                      <td><label class="switch"><input type="checkbox" aria-label="In plan" [checked]="l.inPlan !== false" (change)="check('coreExpenses.' + i + '.inPlan', $event)" /></label></td>
                      <td><input [value]="l.note ?? ''" (change)="plain('coreExpenses.' + i + '.note', $event, true)" /></td>
                      <td><button class="icon danger" aria-label="Delete line" (click)="remove('coreExpenses', i)"><app-icon name="trash" /></button></td>
                    </tr>
                  }
                </tbody>
                <tfoot><tr><td>Total in plan</td><td colspan="6">{{ fmt(core()) }}</td></tr></tfoot>
              </table>
            </div>
            <p><button (click)="addLine()"><app-icon name="plus" [size]="14" /> Add line</button></p>
          </section>

          <section class="card" id="caps">
            <h2>Caps</h2>
            <div class="grid">
              <div class="field">Apply from<app-date-time dateOnly [value]="c.caps.applyFrom" (valueChange)="set('caps.applyFrom', $event)" /></div>
              <label class="field">Buffer month (no caps)
                <span style="display:flex;gap:var(--sp-2)">
                  <input type="month" style="flex:1" [value]="c.caps.bufferMonth ?? ''" (change)="set('caps.bufferMonth', val($event) || null)" />
                  @if (c.caps.bufferMonth) { <button class="ghost" (click)="set('caps.bufferMonth', null)">Clear</button> }
                </span>
              </label>
              <label class="field">Takeout / month<span class="affix" [attr.data-pre]="currencySymbol()"><input class="in-affix" appMoney type="text" [value]="eur(c.caps.takeoutPerMonth)" (change)="money('caps.takeoutPerMonth', $event)" /></span></label>
              <label class="field">Kiosk / month<span class="affix" [attr.data-pre]="currencySymbol()"><input class="in-affix" appMoney type="text" [value]="eur(c.caps.kioskPerMonth)" (change)="money('caps.kioskPerMonth', $event)" /></span></label>
            </div>
          </section>

          <section class="card" id="accounts">
            <h2>Accounts</h2>
            @if (accounts.value()?.length) {
              <h3 style="margin-top:0">Savings accounts</h3>
              <div class="acct">
                @for (a of accounts.value()!; track a.name) {
                  <label><input type="checkbox" [checked]="c.allocation.savingsAccounts.includes(a.name)" (change)="toggle('allocation.savingsAccounts', a.name, $event)" />{{ a.name }}<span class="bal">{{ a.balanceCents === null ? '' : fmt(a.balanceCents) }}</span></label>
                }
              </div>
              <h3>Investment accounts</h3>
              <div class="acct">
                @for (a of accounts.value()!; track a.name) {
                  <label><input type="checkbox" [checked]="c.allocation.investmentAccounts.includes(a.name)" (change)="toggle('allocation.investmentAccounts', a.name, $event)" />{{ a.name }}<span class="bal">{{ a.balanceCents === null ? '' : fmt(a.balanceCents) }}</span></label>
                }
              </div>
              <h3>Payroll account</h3>
              <app-combo [options]="payrollOptions()" [value]="c.allocation.payrollAccount ?? ''" ariaLabel="Payroll account" (changed)="set('allocation.payrollAccount', $event || null)" />
            } @else {
              <p class="muted">No accounts yet. The bank savings fallback is used.</p>
            }
          </section>

          <section class="card" id="classification">
            <h2>Classification</h2>
            @for (g of groupSets; track g[0]) {
              <h3 style="margin-top:0">{{ g[1] }}</h3>
              <div class="chips" style="margin-bottom:var(--sp-4)">
                @for (n of c.wallet.groups; track n) {
                  <button class="chip" [class.on]="list(c, g[0]).includes(n)" [attr.aria-pressed]="list(c, g[0]).includes(n)" (click)="flip(g[0], n)">{{ n }}</button>
                }
              </div>
            }

            <h3>Merchant keywords</h3>
            <div class="tools">
              <input type="search" placeholder="Search keywords" [value]="kwQ()" (input)="kwQ.set(val($event))" />
              <button (click)="add('wallet.merchantKeywords', { keyword: '', group: c.wallet.groups[0] }); kwQ.set('')"><app-icon name="plus" [size]="14" /> Add keyword</button>
            </div>
            <div class="scroll tall" style="box-shadow:none">
              <table>
                <tbody>
                  @for (k of c.wallet.merchantKeywords; track $index; let i = $index) {
                    @if (match(k.keyword, k.group, kwQ())) {
                      <tr>
                        <td><input [value]="k.keyword" (change)="plain('wallet.merchantKeywords.' + i + '.keyword', $event, true)" /></td>
                        <td><app-combo [options]="groupOptions()" [value]="k.group" ariaLabel="Group" (changed)="set('wallet.merchantKeywords.' + i + '.group', $event)" /></td>
                        <td><button class="icon danger" aria-label="Delete keyword" (click)="remove('wallet.merchantKeywords', i)"><app-icon name="trash" /></button></td>
                      </tr>
                    }
                  }
                </tbody>
              </table>
            </div>

            @if (currency() === 'EUR') {
              <h3>Wallet category map</h3>
              <div class="tools">
                <input type="search" placeholder="Search categories" [value]="catQ()" (input)="catQ.set(val($event))" />
                <button (click)="add('wallet.categoryMap', { walletCategory: '', group: c.wallet.groups[0] }); catQ.set('')"><app-icon name="plus" [size]="14" /> Add category</button>
              </div>
              <div class="scroll tall" style="box-shadow:none">
                <table>
                  <tbody>
                    @for (k of c.wallet.categoryMap; track $index; let i = $index) {
                      @if (match(k.walletCategory, k.group, catQ())) {
                        <tr>
                          <td><input [value]="k.walletCategory" (change)="plain('wallet.categoryMap.' + i + '.walletCategory', $event, true)" /></td>
                          <td><app-combo [options]="groupOptions()" [value]="k.group" ariaLabel="Group" (changed)="set('wallet.categoryMap.' + i + '.group', $event)" /></td>
                          <td><button class="icon danger" aria-label="Delete category" (click)="remove('wallet.categoryMap', i)"><app-icon name="trash" /></button></td>
                        </tr>
                      }
                    }
                  </tbody>
                </table>
              </div>
            }
          </section>

          @if (dirty()) {
            <div class="savebar" role="status">
              <span class="muted grow">Unsaved changes</span>
              <button class="ghost" (click)="discard()" [disabled]="saving()">Discard</button>
              <button class="primary" (click)="save()" [disabled]="saving()">{{ saving() ? 'Saving…' : 'Save' }}</button>
            </div>
          }
        </div>
      </div>
    } @else if (failed()) {
      <p class="err">Failed to load config.</p>
    } @else {
      <span class="skeleton" style="height:12rem"></span>
    }
  `,
})
export class BudgetEdit {
  protected fmt = fmt;
  protected currency = currency;
  protected currencySymbol = currencySymbol;
  protected val = val;
  protected sections = SECTIONS;
  protected groupSets = [
    ['allocation.funGroups', 'Fun groups'],
    ['allocation.coveredByCoreGroups', 'Covered by core lines (not counted as unplanned)'],
    ['wallet.excludedGroups', 'Excluded groups (non-spending)'],
  ];
  private api = inject(Api);
  private toast = inject(Toast);
  protected refresh = inject(Refresh);
  protected accounts = resource({ params: () => this.refresh.tick(), loader: () => this.api.accounts() });
  private saved = signal<Config | null>(null);
  protected draft = signal<Config | null>(null);
  protected failed = signal(false);
  protected saving = signal(false);
  protected kwQ = signal('');
  protected catQ = signal('');
  protected dirty = computed(() => JSON.stringify(this.draft()) !== JSON.stringify(this.saved()));
  protected a = computed(() => allocation(this.draft()!));
  protected core = computed(() => corePlan(this.draft()!));
  protected annual = computed(() => annualInvesting(this.draft()!));
  protected bonusMonths = computed(() => Object.keys(this.draft()?.income.bonusMonths ?? {}));
  protected segs = computed(() => {
    const a = this.a();
    const inv = Math.max(a.investing, 0);
    return [
      { name: 'Core', v: a.core, amount: a.core, color: 'var(--c1)' },
      { name: 'Fun', v: a.fun, amount: a.fun, color: 'var(--c2)' },
      { name: 'Sinking', v: a.sinking, amount: a.sinking, color: 'var(--c4)' },
      { name: 'Investing', v: inv, amount: a.investing, color: a.investing < 0 ? 'var(--bad)' : 'var(--c3)' },
    ];
  });

  constructor() {
    this.api.config().then(
      (c) => this.load(c),
      () => this.failed.set(true),
    );
  }

  private load(c: Config) {
    this.saved.set(c);
    this.draft.set(structuredClone(c));
  }

  protected eur = (c: number) => String(c / 100);
  protected go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  protected match = (a: string, b: string, q: string) => !q || (a + ' ' + b).toLowerCase().includes(q.toLowerCase());
  protected sourceOptions(cur: string): ComboOption[] {
    const groups = this.draft()!.wallet.groups;
    const opts = ['manual', ...groups.map((g) => 'wallet:' + g)];
    return (opts.includes(cur) ? opts : [...opts, cur]).map((o) => ({ value: o, label: o.startsWith('wallet:') ? 'Records: ' + o.slice(7) : o }));
  }
  protected payrollOptions = computed<ComboOption[]>(() => [
    { value: '', label: 'None' },
    ...(this.accounts.value() ?? []).map((a) => ({ value: a.name, label: a.name })),
  ]);
  protected groupOptions = computed<ComboOption[]>(() => (this.draft()?.wallet.groups ?? []).map((g) => ({ value: g, label: g, ...groupDot(g) })));

  // ponytail: edits are applied by dotted path on a cloned draft; no per-field handlers
  private edit(fn: (c: any) => void) {
    const c = structuredClone(this.draft()!);
    fn(c);
    this.draft.set(c);
  }
  protected set(path: string, v: unknown) {
    const keys = path.split('.');
    const last = keys.pop()!;
    this.edit((c) => (keys.reduce((o, k) => o[k], c)[last] = v));
  }
  protected list(c: any, path: string) {
    return path.split('.').reduce((o, k) => o[k], c) as string[];
  }

  protected money(path: string, e: Event) {
    const el = e.target as HTMLInputElement;
    const n = Number(el.value.trim().replace(',', '.'));
    if (el.value.trim() === '' || !Number.isFinite(n)) {
      el.value = this.eur(path.split('.').reduce((o: any, k) => o[k], this.draft()!) as number);
      return;
    }
    this.set(path, toCents(n));
  }
  protected plain = (path: string, e: Event, text = false) => this.set(path, text ? val(e) : num(e));
  protected check = (path: string, e: Event) => this.set(path, (e.target as HTMLInputElement).checked);
  protected toggle = (path: string, item: string, e: Event) => this.flip(path, item, (e.target as HTMLInputElement).checked);
  protected flip(path: string, item: string, on?: boolean) {
    this.edit((c) => {
      const l = this.list(c, path);
      const i = l.indexOf(item);
      if (on ?? i < 0) {
        if (i < 0) l.push(item);
      } else if (i >= 0) l.splice(i, 1);
    });
  }
  protected add = (path: string, item: object) => this.edit((c) => this.list(c, path).push(item as any));
  protected remove = (path: string, i: number) => this.edit((c) => this.list(c, path).splice(i, 1));
  protected addLine = () =>
    this.edit((c) => {
      let n = 1;
      while (c.coreExpenses.some((l: any) => l.key === 'line' + n)) n++;
      c.coreExpenses.push({ key: 'line' + n, label: 'New line', plan: 0, source: 'manual' });
    });

  protected discard() {
    this.draft.set(structuredClone(this.saved()!));
  }

  protected async save() {
    if (!this.dirty() || this.saving()) return;
    this.saving.set(true);
    try {
      this.load(await this.api.saveConfig(this.draft()!));
      currency.set(this.saved()!.currency ?? 'EUR');
      this.refresh.tick.update((n) => n + 1);
      this.toast.show('Budget saved');
    } catch (e: any) {
      this.toast.show(e?.error?.error ?? 'Save failed', 'err');
    } finally {
      this.saving.set(false);
    }
  }

  protected key(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      // change events fire on blur; commit the focused field first
      (document.activeElement as HTMLElement | null)?.blur();
      void this.save();
    }
  }

  protected unload(e: BeforeUnloadEvent) {
    if (this.dirty()) e.preventDefault();
  }
}
