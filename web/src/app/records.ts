import { Component, computed, effect, ElementRef, inject, resource, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { currencySymbol, fmt } from './format.ts';
import { toCents } from '../../../shared/src/money.ts';
import { Api, type Row } from './api';
import { athensNow, currentMonth, dayLabel, groupColor, groupDot, HOLLOW } from './format';
import { Combo, type ComboOption } from './ui/combo';
import { DateTime } from './ui/date-time';
import { Icon } from './ui/icons';
import { MoneyInput } from './ui/money-input';
import { MonthPicker } from './ui/month-picker';
import { Refresh } from './ui/refresh';
import { Toast } from './ui/toast';

const val = (e: Event) => (e.target as HTMLInputElement | HTMLSelectElement).value;
const errMsg = (e: any) => e?.error?.error ?? (e instanceof Error ? e.message : 'Request failed');

@Component({
  selector: 'app-records',
  imports: [Combo, DateTime, Icon, MoneyInput, MonthPicker],
  template: `
    <div class="page-head">
      <h1>Records</h1>
      <div class="actions"><button class="primary" (click)="openAdd()"><app-icon name="plus" [size]="16" /> Add expense</button></div>
    </div>

    <div class="filters">
      <input class="search" type="search" placeholder="Search notes" aria-label="Search notes" (input)="onSearch($event)" />
      <app-month-picker [(month)]="month" [months]="meta.value()?.months ?? null" />
      <app-combo [options]="accountOptions()" [value]="account()" (changed)="account.set($event)" ariaLabel="Account" />
      <label class="switch"><input type="checkbox" [checked]="showDups()" (change)="showDups.set(!showDups())" /> Show duplicates</label>
    </div>
    <div class="chips">
      @for (g of groups(); track g) {
        <button class="chip" [class.on]="group() === g" (click)="toggle(g)"><span class="dot" [class.hollow]="hollow(g)" [style.--dot]="color(g)"></span>{{ g }}</button>
      }
      <button class="chip unclassified" [class.on]="group() === 'Other'" (click)="toggle('Other')"><span class="dot" [style.--dot]="color('Other')"></span>Unclassified</button>
    </div>

    <div class="summary">
      <div class="stat"><span class="label">Records</span><span class="value">{{ visible().length }}</span></div>
      <div class="stat"><span class="label">Spend</span><span class="value">{{ fmt(totals().spend) }}</span></div>
      <div class="stat"><span class="label">Income</span><span class="value pos">{{ fmt(totals().income) }}</span></div>
    </div>

    @if (rows.isLoading() && !rows.hasValue()) {
      <div class="skeleton" style="height: 12rem"></div>
    } @else if (!visible().length) {
      <div class="empty scroll"><strong>No records</strong><span>Nothing matches these filters.</span></div>
    } @else {
      <div class="scroll tall">
        <table>
          <thead>
            <tr><th>Date</th><th>Note</th><th>Group</th><th class="num">Amount</th><th></th></tr>
          </thead>
          <tbody>
            @for (r of visible(); track r.id) {
              <tr [class.dim]="r.isDup">
                <td class="nowrap muted">{{ day(r.dateUtc) }}</td>
                <td>
                  <div class="strong">{{ r.note || '—' }}
                    @if (r.isDup) { <span class="badge" [title]="'duplicate of #' + r.dupOf">duplicate</span> }
                  </div>
                  <div class="meta">
                    <span class="muted sm">{{ r.account }}</span>
                    @if (r.category) { <span class="muted sm">{{ r.category }}</span> }
                  </div>
                </td>
                <td class="gcell">
                  <app-combo [options]="groupOptions(r)" [value]="r.groupOverride ?? ''" (changed)="setGroup(r, $event || null)" ariaLabel="Group" />
                  @if (r.groupOverride) { <span class="badge">manual</span> }
                  <button class="link" (click)="kw.set(kw()?.id === r.id ? null : { id: r.id, keyword: r.note, group: r.grp })">Always</button>
                  @if (kw()?.id === r.id) {
                    <form class="popover" (submit)="addKeyword($event)">
                      <div class="pform">
                        <span>Always classify notes containing</span>
                        <input name="keyword" [value]="kw()!.keyword" required />
                        <span>as</span>
                        <app-combo [options]="ruleGroups()" [value]="kw()!.group" ariaLabel="Group" (changed)="kw.set({ ...kw()!, group: $event })" />
                        <div class="row"><button type="button" class="ghost" (click)="kw.set(null)">Cancel</button><button class="primary">Save rule</button></div>
                      </div>
                    </form>
                  }
                </td>
                <td class="num strong" [class.pos]="r.type === 'Income'">{{ amount(r) }}</td>
                <td class="nowrap act">
                  @if (r.source === 'manual' || walletDel(r)) {
                    @if (confirmId() === r.id) {
                      <span class="muted sm">{{ walletDel(r) ? 'Delete here and in Wallet?' : 'Delete?' }}</span>
                      <button class="danger" (click)="remove(r)">Yes</button>
                      <button class="ghost" (click)="confirmId.set(null)">No</button>
                    } @else {
                      <button class="icon" [attr.aria-label]="walletDel(r) ? 'Delete here and in Wallet' : 'Delete record'" [title]="walletDel(r) ? 'Delete here and in Wallet' : 'Delete record'" (click)="confirmId.set(r.id)"><app-icon name="trash" [size]="16" /></button>
                    }
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }

    <dialog #dlg (click)="onBackdrop($event)">
      <form (submit)="add($event)">
        <h2>{{ review() ? 'Review' : addLabel() }}</h2>
        <div class="seg" [hidden]="!!review()" role="group" aria-label="Type">
          <button type="button" [class.on]="type() === 'Expenses'" (click)="type.set('Expenses')">Expense</button>
          <button type="button" [class.on]="type() === 'Income'" (click)="type.set('Income')">Income</button>
        </div>
        <div class="dform" [hidden]="!!review()">
          <label class="field"><span>Amount</span>
            <span class="affix" [attr.data-pre]="currencySymbol()"><input name="amount" appMoney type="text" placeholder="0.00" autofocus required (blur)="amountTouched.set(true)" /></span>
            @if (amountTouched() && !getAmountValue()) { <div class="hint">Enter an amount</div> }
          </label>
          <label class="field"><span>Note</span><input name="note" autocomplete="off" /></label>
          <div class="field"><span>Date and time</span><app-date-time [(value)]="when" /></div>
          @if (refresh.walletAvailable()) {
            <label class="switch"><input type="checkbox" [checked]="toWallet()" (change)="setToWallet($event)" /> Also add to Wallet</label>
          }
          @if (toWallet()) {
            <label class="field"><span>Wallet account</span>
              <app-combo [options]="walletAccountOptions()" [(value)]="walletAcc" ariaLabel="Wallet account" />
            </label>
            <label class="field"><span>Wallet category</span>
              <app-combo [options]="walletCategoryOptions()" [(value)]="walletCat" grouped recentKey="recentWalletCategories" ariaLabel="Wallet category" />
            </label>
          } @else {
            <label class="field"><span>Account</span>
              <app-combo [options]="addAccounts()" [(value)]="addAccount" ariaLabel="Account" />
            </label>
          }
        </div>
        @if (review(); as d) {
          <dl class="review">
            <dt>Type</dt><dd>{{ type() === 'Income' ? 'Income' : 'Expense' }}</dd>
            <dt>Amount</dt><dd>{{ fmt(d.cents) }}</dd>
            <dt>Account</dt><dd>{{ walletAccountOptions(true)[0]?.label }}</dd>
            <dt>Category</dt><dd>{{ walletCategoryLabel() }}</dd>
            <dt>Date</dt><dd>{{ d.date }} {{ d.time }}</dd>
            <dt>Note</dt><dd>{{ d.note || '—' }}</dd>
          </dl>
        }
        <div class="actions">
          @if (review()) {
            <button type="button" (click)="draft.set(null)" [disabled]="busy()">Back</button>
            <button class="primary" [disabled]="busy()">Add to Wallet</button>
          } @else {
            <button type="button" (click)="dlg.close()">Cancel</button>
            <button class="primary" [disabled]="busy() || !getAmountValue()">{{ toWallet() ? 'Review' : addLabel() }}</button>
          }
        </div>
      </form>
    </dialog>
  `,
  styles: `
    .filters { display: flex; flex-wrap: wrap; gap: var(--sp-3); align-items: center; margin-bottom: var(--sp-3); }
    .search { flex: 1; min-width: 12rem; max-width: 22rem; }
    .chips { display: flex; flex-wrap: wrap; gap: var(--sp-2); margin-bottom: var(--sp-3); }
    .chip.unclassified:not(.on) { border-style: dashed; }
    .summary { display: flex; gap: var(--sp-4); margin: 0 0 var(--sp-3); }
    .summary .stat { display: flex; flex-direction: column; gap: var(--sp-1); }
    .summary .label { color: var(--muted); font-size: var(--fs-xs); font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }
    .summary .value { font-weight: 700; font-size: var(--fs-lg); color: var(--text); }
    .summary .value.pos { color: var(--good); }
    .sm { font-size: var(--fs-xs); }
    .meta { display: flex; gap: var(--sp-2); align-items: center; margin-top: var(--sp-1); }
    .gcell { position: relative; white-space: nowrap; }
    .popover { white-space: normal; min-width: 18rem; }
    .pform { display: flex; flex-direction: column; gap: var(--sp-2); font-size: var(--fs-sm); }
    .pform .row { display: flex; justify-content: flex-end; gap: var(--sp-2); }
    .act { text-align: right; }
    .act button { margin-left: var(--sp-1); }
    dialog { width: 24rem; overflow: visible; }
    dialog h2 { margin-bottom: var(--sp-3); }
    .dform { display: flex; flex-direction: column; gap: var(--sp-3); margin-top: var(--sp-4); }
    .dform .affix input { width: 100%; text-align: left; }
    .dform .affix { display: flex; }
    [hidden] { display: none !important; }
    .review { display: grid; grid-template-columns: auto 1fr; gap: var(--sp-2) var(--sp-4); margin: var(--sp-4) 0 0; }
    .review dt { color: var(--muted); }
    .review dd { margin: 0; overflow-wrap: anywhere; }
    .field input:not([type='checkbox']), .field select { width: 100%; }
    .hint { color: var(--muted); font-size: var(--fs-sm); margin-top: var(--sp-1); }
  `,
})
export class Records {
  private api = inject(Api);
  private toast = inject(Toast);
  protected refresh = inject(Refresh);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  protected fmt = fmt;
  protected currencySymbol = currencySymbol;
  protected val = val;
  protected color = groupColor;
  protected hollow = (g: string) => HOLLOW.has(g);
  protected day = dayLabel;
  protected dialogEl = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  protected month = signal(currentMonth());
  protected group = signal('');
  protected account = signal('');
  protected search = signal('');
  protected showDups = signal(false);
  protected kw = signal<{ id: number; keyword: string; group: string } | null>(null);
  protected confirmId = signal<number | null>(null);
  protected type = signal<'Expenses' | 'Income'>('Expenses');
  protected when = signal(athensNow());
  protected addLabel = computed(() => (this.type() === 'Income' ? 'Add income' : 'Add expense'));
  protected busy = signal(false);
  private savedToWallet = signal(this.readAddToWallet());
  /** Wallet writes require confirmed non-demo EUR metadata; keep saved preference for normal mode. */
  protected toWallet = computed(() => this.refresh.walletAvailable() && this.savedToWallet());
  protected walletAcc = signal<string | null>(null);
  protected walletCat = signal<string | null>('');
  protected draft = signal<{ cents: number; date: string; time: string; note: string } | null>(null);
  protected review = computed(() => this.toWallet() ? this.draft() : null);
  protected amountTouched = signal(false);
  private timer?: ReturnType<typeof setTimeout>;

  protected meta = resource({ params: () => this.refresh.tick(), loader: () => this.api.meta() });
  protected accounts = resource({ params: () => this.refresh.tick(), loader: () => this.api.accounts() });
  protected categories = resource({ params: () => this.refresh.walletAvailable() ? true : undefined, loader: () => this.api.walletCategories() });
  protected rows = resource({
    params: computed(() => ({ month: this.month(), group: this.group(), account: this.account(), tick: this.refresh.tick() })),
    loader: ({ params: { tick, ...p } }) => this.api.records(p),
  });

  protected groups = computed(() => (this.meta.value()?.groups ?? []).filter((g) => g !== 'Other'));
  protected addAccount = signal<string | null>('Manual');
  protected addAccounts = computed<ComboOption[]>(() =>
    ['Manual', ...(this.meta.value()?.accounts ?? []).filter((a) => a !== 'Manual')].map((a) => ({ value: a, label: a })));
  // Wallet writes only support EUR databases/accounts. `selectedOnly` returns the chosen account (review step).
  protected walletAccountOptions = (selectedOnly = false): ComboOption[] =>
    (this.refresh.walletAvailable() ? this.accounts.value() ?? [] : [])
      .filter((a) => a.currency === 'EUR' && (!selectedOnly || a.id === this.walletAcc()))
      .map((a) => ({ value: a.id, label: a.name, hint: a.balanceCents == null ? '' : fmt(a.balanceCents) }));
  protected walletCategoryOptions = computed<ComboOption[]>(() => [
    { value: '', label: 'No category' },
    ...(this.refresh.walletAvailable() ? this.categories.value() ?? [] : [])
      .map((c) => {
        const group = c.parent || 'Other';
        const top = !c.parent || c.name === c.parent;
        return { value: c.id, label: top ? `${c.name} (general)` : c.name, group, top };
      })
      .sort((a, b) => Number(b.top) - Number(a.top))
      .map(({ top, ...o }) => o),
  ]);
  protected walletCategoryLabel = () => this.walletCategoryOptions().find((o) => o.value === this.walletCat())?.label ?? 'No category';
  protected ruleGroups = computed<ComboOption[]>(() => (this.meta.value()?.groups ?? []).map((g) => ({ value: g, label: g, ...groupDot(g) })));
  protected visible = computed(() => {
    const q = this.search().trim().toLowerCase();
    return (this.rows.value() ?? []).filter((r) => (this.showDups() || !r.isDup) && (!q || r.note.toLowerCase().includes(q)));
  });
  protected totals = computed(() => {
    let spend = 0, income = 0;
    for (const r of this.visible()) {
      if (r.isDup) continue;
      if (r.type === 'Income') income += r.amountCents;
      else if (r.type === 'Expenses') spend -= r.amountCents;
    }
    return { spend, income };
  });

  constructor() {
    effect(() => {
      this.month();
      this.confirmId.set(null);
      this.kw.set(null);
    });
    effect(() => {
      const add = this.route.snapshot.queryParamMap.get('add');
      if (add === '1') {
        this.openAdd();
        this.router.navigate([], { queryParams: { add: null }, queryParamsHandling: 'merge', replaceUrl: true });
      }
    });
  }

  protected walletDel = (r: Row) => !!r.createdInApp && this.refresh.demo() === false;
  protected amount = (r: Row) => (r.type === 'Income' ? '+' + fmt(Math.abs(r.amountCents)) : '−' + fmt(Math.abs(r.amountCents)));
  protected getAmountValue = () => {
    const input = this.dialogEl().nativeElement.querySelector('input[name="amount"]') as HTMLInputElement | null;
    if (!input) return 0;
    const val = Number((input.value ?? '').trim().replace(',', '.'));
    return Number.isFinite(val) && val > 0 ? val : 0;
  };
  protected groupsFor = (r: Row) => {
    const g = this.meta.value()?.groups ?? [];
    const o = r.groupOverride;
    return !o || g.includes(o) ? g : [o, ...g];
  };
  protected accountOptions = computed<ComboOption[]>(() => [
    { value: '', label: 'All accounts' },
    ...(this.meta.value()?.accounts ?? []).map((a) => ({ value: a, label: a })),
  ]);
  protected groupOptions = (r: Row): ComboOption[] => [
    { value: '', label: r.groupOverride ? 'Auto (computed)' : `Auto (${r.grp})`, ...(r.groupOverride ? {} : groupDot(r.grp)) },
    ...this.groupsFor(r).map((g) => ({ value: g, label: g, ...groupDot(g) })),
  ];
  protected toggle = (g: string) => this.group.set(this.group() === g ? '' : g);

  protected onSearch(e: Event) {
    clearTimeout(this.timer);
    const v = val(e);
    this.timer = setTimeout(() => this.search.set(v), 200);
  }

  private async run(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn();
    } catch (e) {
      this.toast.show(errMsg(e), 'err');
      return false;
    }
    this.toast.show(ok);
    this.refresh.tick.update((n) => n + 1);
    return true;
  }

  protected openAdd() {
    this.when.set(athensNow());
    this.type.set('Expenses');
    this.addAccount.set('Manual');
    this.draft.set(null);
    this.walletCat.set('');
    this.walletAcc.set(this.walletAccountOptions()[0]?.value ?? null);
    this.amountTouched.set(false);
    const form = this.dialogEl().nativeElement.querySelector('form')!;
    form.reset();
    this.dialogEl().nativeElement.showModal();
  }

  protected setToWallet(e: Event) {
    const on = (e.target as HTMLInputElement).checked;
    this.savedToWallet.set(on);
    try { localStorage.setItem('addToWallet', on ? '1' : '0'); } catch { /* preference remains for this session */ }
  }

  private readAddToWallet() {
    try { return localStorage.getItem('addToWallet') === '1'; } catch { return false; }
  }

  protected onBackdrop(e: MouseEvent) {
    if (e.target === this.dialogEl().nativeElement) this.dialogEl().nativeElement.close();
  }

  protected async add(e: Event) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target as HTMLFormElement)) as Record<string, string>;
    const n = Number((f['amount'] ?? '').trim().replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) return void this.toast.show('Enter a positive amount', 'err');
    const wallet = this.toWallet();
    if (wallet && !this.walletAcc()) return void this.toast.show('Pick a Wallet account', 'err');
    const cents = toCents(n);
    if (wallet && !this.draft()) return void this.draft.set({ cents, date: this.when().slice(0, 10), time: this.when().slice(11), note: (f['note'] ?? '').trim() });
    this.busy.set(true);
    const done = await this.run(
      () => this.api.addRecord({
        date: this.when(), amount: String(cents / 100), note: f['note'] ?? '', type: this.type(), account: this.addAccount() ?? 'Manual',
        ...(wallet ? { toWallet: true, accountId: this.walletAcc()!, categoryId: this.walletCat() ?? '' } : {}),
      }),
      wallet ? 'Added to Wallet' : 'Record added',
    );
    this.busy.set(false);
    if (done) this.dialogEl().nativeElement.close();
  }

  protected setGroup = (r: Row, g: string | null) => this.run(() => this.api.setGroup(r.id, g), g ? `Moved to ${g}` : 'Group set to auto');

  protected async remove(r: Row) {
    this.confirmId.set(null);
    const wallet = this.walletDel(r);
    await this.run(() => this.api.deleteRecord(r.id, wallet), wallet ? 'Deleted here and in Wallet' : 'Record deleted');
  }

  protected async addKeyword(e: Event) {
    e.preventDefault();
    const f = new FormData(e.target as HTMLFormElement);
    const keyword = String(f.get('keyword')).trim();
    const group = this.kw()!.group;
    if (await this.run(() => this.api.addKeyword(keyword, group), `Rule saved: "${keyword}" → ${group}`)) this.kw.set(null);
  }
}
