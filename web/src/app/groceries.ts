import { Component, computed, effect, inject, resource, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { groceryMonthly, weeklyIngredientGrams } from '../../../shared/src/diet.ts';
import { currencySymbol, fmt, parseMoney, val } from './format.ts';
import type { Config, GroceryItem } from '../../../shared/src/types.ts';
import { Api } from './api';
import { Combo } from './ui/combo';
import { editDraft } from './ui/config-draft';
import { Icon } from './ui/icons';
import { MoneyInput } from './ui/money-input';
import { Refresh } from './ui/refresh';
import { Toast } from './ui/toast';


@Component({
  selector: 'app-groceries',
  standalone: true,
  imports: [NgTemplateOutlet, Combo, Icon, MoneyInput],
  styles: `
    .items-table { width: 100%; min-width: 74rem; table-layout: fixed; border-collapse: collapse; font-size: var(--fs-sm); }
    .items-table th, .items-table td { padding: var(--sp-1) var(--sp-2); text-align: left; border-bottom: 1px solid var(--border); vertical-align: middle; }
    .items-table th { position: sticky; top: 0; z-index: 1; font-weight: 600; color: var(--muted); font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: 0.04em; background: var(--surface-2); }
    .items-table .num { text-align: right; font-variant-numeric: tabular-nums; }
    .items-table input, .items-table select { width: 100%; min-width: 0; font: inherit; color: inherit; background: transparent; border: 1px solid transparent; border-radius: var(--r-sm); padding: var(--sp-1) var(--sp-2); appearance: none; }
    .items-table select { cursor: pointer; }
    .items-table input:hover, .items-table input:focus, .items-table select:hover, .items-table select:focus { border-color: var(--border); background: var(--surface-2); }
    .items-table input.num { text-align: right; }
    .items-table input[type='number'] { appearance: textfield; }
    .items-table input::-webkit-inner-spin-button, .items-table input::-webkit-outer-spin-button { display: none; }
    .items-table .note { color: var(--muted); text-overflow: ellipsis; }
    .items-table tr.row:hover td { background: var(--surface-2); }
    .items-table tr.group td { background: var(--surface-2); font-weight: 600; padding: var(--sp-2); }
    .group-line { display: flex; align-items: center; gap: var(--sp-3); }
    .group-line .sub { margin-left: auto; }
    .cost { text-align: right; white-space: nowrap; }
    .cost.offer { color: var(--good); font-weight: 600; }
    .table-foot { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); padding: var(--sp-2) var(--sp-3); border-top: 1px solid var(--border); font-weight: 600; }
    .collapsible { cursor: pointer; user-select: none; font-weight: 600; }
    .collapsible-content { margin-top: var(--sp-2); padding-left: var(--sp-3); font-size: var(--fs-sm); }
    .collapsible-item { padding: var(--sp-1) 0; }
    .kpi-badges { display: flex; gap: var(--sp-2); flex-wrap: wrap; align-items: center; }
  `,
  template: `
    <div class="page-head">
      <h1>Grocery list</h1>
      <div class="actions">
        <label class="switch">
          <input type="checkbox" [checked]="useOffers()" (change)="useOffers.set($any($event.target).checked)" />
          Use offer prices
        </label>
      </div>
    </div>

    @if (data.error()) {
      <p class="err">Failed to load config.</p>
    }

    <ng-template #rowTpl let-list="list" let-it="it" let-i="i">
      <tr class="row">
        <td><input type="text" [value]="it.item" (change)="upd(list, i, { item: val($event) })" /></td>
        <td><input class="num" type="text" appMoney [value]="it.qty" (change)="setNum(list, i, 'qty', $event)" /></td>
        <td><input type="text" [value]="it.unit" (change)="upd(list, i, { unit: val($event) })" /></td>
        <td><input class="num" type="text" appMoney [value]="it.regularPrice / 100" (change)="setNum(list, i, 'regularPrice', $event)" /></td>
        <td><input class="num" type="text" appMoney placeholder="–" [value]="it.offerPrice == null ? '' : it.offerPrice / 100" (change)="setNum(list, i, 'offerPrice', $event)" /></td>
        <td class="cost" [class.offer]="useOffers() && it.offerPrice != null">
          {{ fmt(itemCostCents(it)) }}
          @if (useOffers() && it.offerPrice != null) {
            <span class="badge">offer</span>
          }
        </td>
        <td>
          <app-combo [options]="storeOptions()" [value]="it.where" allowCreate ariaLabel="Store" (changed)="upd(list, i, { where: $event })" />
        </td>
        <td><input class="note" type="text" [value]="it.note" [title]="it.note" (change)="upd(list, i, { note: val($event) })" /></td>
        <td><button class="ghost icon danger" (click)="remove(list, i)" title="Delete"><app-icon name="trash" /></button></td>
      </tr>
    </ng-template>

    <ng-template #head>
      <colgroup>
        <col />
        <col style="width: 5rem" />
        <col style="width: 5rem" />
        <col style="width: 7rem" />
        <col style="width: 7rem" />
        <col style="width: 9rem" />
        <col style="width: 9rem" />
        <col style="width: 12rem" />
        <col style="width: 3rem" />
      </colgroup>
      <thead>
        <tr>
          <th style="min-width: 16rem">Item</th>
          <th class="num">Qty</th>
          <th>Unit</th>
          <th class="num">Regular {{ currencySymbol() }}</th>
          <th class="num">Offer {{ currencySymbol() }}</th>
          <th class="num">Cost</th>
          <th>Store</th>
          <th>Note</th>
          <th></th>
        </tr>
      </thead>
    </ng-template>

    @if (cfg(); as c) {
      <div class="kpis">
        <div class="kpi">
          <div class="label">Weekly cost</div>
          <div class="value">{{ fmt(monthlyData().weekly) }}</div>
        </div>
        <div class="kpi">
          <div class="label">Monthly cost</div>
          <div class="value">{{ fmt(monthlyData().monthly) }}</div>
          <div class="sub">{{ fmt(monthlyData().weekly) }} × 52/12 + pantry</div>
        </div>
        <div class="kpi">
          <div class="label">Groceries budget</div>
          <div class="value">{{ fmt(groceryPlan()) }}</div>
          <div class="kpi-badges">
            @if (monthlyData().monthly > groceryPlan()) {
              <span class="badge" style="background: var(--bad-bg); color: var(--bad)">Over by {{ fmt(monthlyData().monthly - groceryPlan()) }}</span>
            } @else if (monthlyData().monthly < groceryPlan()) {
              <span class="badge" style="background: var(--good-bg); color: var(--good)">Under by {{ fmt(groceryPlan() - monthlyData().monthly) }}</span>
            }
          </div>
        </div>
      </div>

      <h2>Weekly items</h2>
      <div class="scroll">
        <table class="items-table">
          <ng-container *ngTemplateOutlet="head" />
          <tbody>
            @for (g of storeGroupedItems(); track g.store) {
              <tr class="group">
                <td colspan="9">
                  <div class="group-line">
                    <span>{{ g.store }}</span>
                    <span class="muted">{{ g.rows.length }} {{ g.rows.length === 1 ? 'item' : 'items' }}</span>
                    <button class="link" (click)="add('weekly', g.store)">+ Add item</button>
                    <span class="sub">{{ fmt(storeTotal(g.rows)) }}</span>
                  </div>
                </td>
              </tr>
              @for (r of g.rows; track r.i) {
                <ng-container *ngTemplateOutlet="rowTpl; context: { list: 'weekly', it: r.it, i: r.i }" />
              }
            }
          </tbody>
        </table>
        <div class="table-foot">
          <button class="link" (click)="add('weekly', stores()[0] ?? 'Other')">+ Add item</button>
          <span>Weekly total: {{ fmt(monthlyData().weekly) }}</span>
        </div>
      </div>

      <h2 style="margin-top: var(--sp-5)">Monthly pantry</h2>
      <div class="scroll">
        <table class="items-table">
          <ng-container *ngTemplateOutlet="head" />
          <tbody>
            @for (item of draft()?.groceryList?.pantryMonthly ?? []; track $index; let i = $index) {
              <ng-container *ngTemplateOutlet="rowTpl; context: { list: 'pantryMonthly', it: item, i: i }" />
            }
          </tbody>
        </table>
        <div class="table-foot">
          <button class="link" (click)="add('pantryMonthly', 'Pantry')">+ Add item</button>
          <span>Pantry total: {{ fmt(monthlyData().pantry) }}</span>
        </div>
      </div>

      <details class="card" style="margin-top: var(--sp-5)">
        <summary class="collapsible">Needed per week from meal plan <span class="muted" style="font-size: var(--fs-sm)">({{ weeklyNeeded().size }} items)</span></summary>
        <div class="collapsible-content">
          @for (ing of weeklyIngredientsArray(); track ing[0]) {
            <div class="collapsible-item">
              <strong>{{ ing[0] }}:</strong> {{ ing[1] }} g
            </div>
          }
        </div>
      </details>

      @if (dirty()) {
        <div class="savebar">
          Unsaved changes
          <button class="ghost" (click)="discard()">Discard</button>
          <button class="primary" (click)="save()">Save</button>
        </div>
      }
    }
  `,
})
export class GroceriesComponent {
  protected fmt = fmt;
  protected currencySymbol = currencySymbol;
  protected val = val;
  protected Math = Math;
  protected useOffers = signal(false);
  private api = inject(Api);
  private toast = inject(Toast);
  private refresh = inject(Refresh);
  protected data = resource({ loader: () => this.api.config() });
  // non-draft data: reloads on Wallet fetch without touching the draft
  private plan = resource({ params: () => this.refresh.tick(), loader: () => this.api.config() });
  protected cfg = computed(() => this.data.value());
  protected draft = signal<Config | null>(null);
  protected dirty = computed(() => {
    const cfg = this.cfg();
    const dft = this.draft();
    if (!cfg || !dft) return false;
    return JSON.stringify(cfg) !== JSON.stringify(dft);
  });

  constructor() {
    // Keep draft in sync with loaded config
    effect(() => {
      const cfg = this.cfg();
      if (cfg) this.draft.set(structuredClone(cfg));
    });
  }

  protected groceryPlan = computed(() => {
    const cfg = this.plan.value() ?? this.cfg();
    if (!cfg) return 0;
    return cfg.coreExpenses.find((l) => l.key === 'groceries')?.plan || 0;
  });

  protected weeklyNeeded = computed(() => {
    const dft = this.draft();
    if (!dft) return new Map<string, number>();
    return new Map(Object.entries(weeklyIngredientGrams(dft.diet)));
  });

  protected weeklyIngredientsArray = computed(() => {
    const needed = this.weeklyNeeded();
    return Array.from(needed.entries()).sort();
  });

  protected monthlyData = computed(() => {
    const dft = this.draft();
    if (!dft) return { weekly: 0, pantry: 0, monthly: 0 };
    return groceryMonthly(dft.groceryList, this.useOffers());
  });

  protected storeGroupedItems = computed(() => {
    const dft = this.draft();
    if (!dft) return [];
    const stores = new Map<string, { it: GroceryItem; i: number }[]>();
    dft.groceryList.weekly.forEach((it, i) => {
      const store = it.where || 'Other';
      if (!stores.has(store)) stores.set(store, []);
      stores.get(store)!.push({ it, i });
    });
    return Array.from(stores.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([store, rows]) => ({ store, rows }));
  });

  protected stores = computed(() => {
    const g = this.draft()?.groceryList;
    return [...new Set([...(g?.weekly ?? []), ...(g?.pantryMonthly ?? [])].map((i) => i.where).filter(Boolean))].sort();
  });

  protected storeOptions = computed(() => this.stores().map((s) => ({ value: s, label: s })));

  protected itemCostCents(item: GroceryItem): number {
    const price = this.useOffers() && item.offerPrice != null ? item.offerPrice : item.regularPrice;
    return Math.round(item.qty * price);
  }

  protected storeTotal(rows: { it: GroceryItem }[]): number {
    return rows.reduce((sum, r) => sum + this.itemCostCents(r.it), 0);
  }

  private edit = (fn: (c: Config) => void) => editDraft(this.draft, fn);

  protected upd(list: 'weekly' | 'pantryMonthly', i: number, patch: Partial<GroceryItem>) {
    this.edit((c) => Object.assign(c.groceryList[list][i], patch));
  }

  protected setNum(list: 'weekly' | 'pantryMonthly', i: number, k: 'qty' | 'regularPrice' | 'offerPrice', e: Event) {
    const el = e.target as HTMLInputElement;
    const cents = parseMoney(el.value);
    if (k === 'offerPrice' && el.value.trim() === '') return this.upd(list, i, { offerPrice: null });
    if (cents === null || cents < 0) {
      const cur = this.draft()!.groceryList[list][i][k];
      el.value = cur == null ? '' : String(k === 'qty' ? cur : cur / 100);
      return;
    }
    if (k === 'qty') this.upd(list, i, { qty: cents / 100 });
    else this.upd(list, i, { [k]: k === 'offerPrice' && cents === 0 ? null : cents });
  }

  protected remove(list: 'weekly' | 'pantryMonthly', i: number) {
    this.edit((c) => c.groceryList[list].splice(i, 1));
  }

  protected add(list: 'weekly' | 'pantryMonthly', where: string) {
    this.edit((c) =>
      c.groceryList[list].push({ item: 'New item', where, qty: 1, unit: 'unit', regularPrice: 0, offerPrice: null, note: '' }),
    );
  }

  protected discard() {
    const cfg = this.cfg();
    if (cfg) this.draft.set(structuredClone(cfg));
  }

  protected save() {
    this.api
      .saveConfig(this.draft()!)
      .then(() => {
        this.toast.show('Grocery list saved', 'ok');
        this.data.reload();
      })
      .catch(() => {
        this.toast.show('Failed to save grocery list', 'err');
      });
  }
}
