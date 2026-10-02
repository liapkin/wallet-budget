import { Component, computed, effect, inject, resource, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { groceryMonthly, weeklyIngredientGrams } from '../../../shared/src/diet.ts';
import { fmt, toCents } from '../../../shared/src/money.ts';
import type { Config, GroceryItem } from '../../../shared/src/types.ts';
import { Api } from './api';
import { Refresh } from './ui/refresh';
import { Toast } from './ui/toast';

const val = (e: Event) => (e.target as HTMLInputElement | HTMLSelectElement).value;

@Component({
  selector: 'app-groceries',
  standalone: true,
  imports: [CommonModule],
  styles: `
    .store-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: var(--sp-4); margin-bottom: var(--sp-5); }
    .items-table { width: 100%; border-collapse: collapse; font-size: var(--fs-sm); }
    .items-table th, .items-table td { padding: var(--sp-2); text-align: left; border-bottom: 1px solid var(--border); }
    .items-table th { font-weight: 600; color: var(--muted); font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: 0.04em; background: var(--surface-2); }
    .items-table input, .items-table select { width: 100%; }
    .items-table .num { text-align: right; }
    .items-table tr:hover td { background: var(--surface-2); }
    .card-footer { padding-top: var(--sp-2); border-top: 1px solid var(--border); font-weight: 600; display: grid; grid-template-columns: 1fr auto auto; gap: var(--sp-2); align-items: center; }
    .collapsible { cursor: pointer; user-select: none; font-weight: 600; padding: var(--sp-2); margin: -var(--sp-2); border-radius: var(--r-sm); }
    .collapsible:hover { background: var(--surface-2); }
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
    <datalist id="stores">
      @for (st of stores(); track st) {
        <option [value]="st"></option>
      }
    </datalist>
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

      <details style="margin-bottom: var(--sp-4)">
        <summary class="collapsible">Needed per week from meal plan <span class="muted" style="font-size: var(--fs-sm)">({{ weeklyNeeded().size }} items)</span></summary>
        <div class="collapsible-content">
          @for (ing of weeklyIngredientsArray(); track ing[0]) {
            <div class="collapsible-item">
              <strong>{{ ing[0] }}:</strong> {{ ing[1] }} g
            </div>
          }
        </div>
      </details>

      <h2>Weekly items</h2>
      <div class="store-cards">
        @for (storeGroup of storeGroupedItems(); track storeGroup.store) {
          <div class="card">
            <div class="card-head">
              <h3>{{ storeGroup.store }}</h3>
            </div>
            <table class="items-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Store</th>
                  <th class="num">Qty / unit</th>
                  <th class="num">Regular</th>
                  <th class="num">Offer</th>
                  <th class="num">Cost</th>
                  <th style="width: 80px">Note</th>
                  <th style="width: 40px"></th>
                </tr>
              </thead>
              <tbody>
                @for (r of storeGroup.rows; track $index) {
                  <tr>
                    <td><input type="text" [value]="r.it.item" (change)="upd('weekly', r.i, { item: val($event) })" /></td>
                    <td><input type="text" list="stores" [value]="r.it.where" (change)="upd('weekly', r.i, { where: val($event) })" style="width: 6rem" /></td>
                    <td class="num">
                      <input type="number" step="0.01" [value]="r.it.qty" (change)="setNum('weekly', r.i, 'qty', $event)" style="width: 4rem" />
                      <input type="text" [value]="r.it.unit" (change)="upd('weekly', r.i, { unit: val($event) })" style="width: 4rem" />
                    </td>
                    <td class="num"><input type="number" step="0.01" [value]="r.it.regularPrice / 100" (change)="setNum('weekly', r.i, 'regularPrice', $event)" style="width: 4rem" /></td>
                    <td class="num"><input type="number" step="0.01" [value]="(r.it.offerPrice ?? 0) / 100" (change)="setNum('weekly', r.i, 'offerPrice', $event)" style="width: 4rem" /></td>
                    <td class="num">{{ fmt(itemCostCents(r.it)) }}</td>
                    <td><input type="text" [value]="r.it.note" (change)="upd('weekly', r.i, { note: val($event) })" style="width: 100%" /></td>
                    <td><button class="icon danger" (click)="remove('weekly', r.i)" title="Delete">−</button></td>
                  </tr>
                }
              </tbody>
            </table>
            <div class="card-footer">
              <div>Total: {{ fmt(storeTotal(storeGroup.rows)) }}</div>
              <button class="link" (click)="add('weekly', storeGroup.store)">+ Add item</button>
            </div>
          </div>
        }
      </div>

      <h2 style="margin-top: var(--sp-5)">Monthly pantry</h2>
      <div class="card">
        <table class="items-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Store</th>
              <th class="num">Qty / unit</th>
              <th class="num">Regular</th>
              <th class="num">Offer</th>
              <th class="num">Cost</th>
              <th style="width: 80px">Note</th>
              <th style="width: 40px"></th>
            </tr>
          </thead>
          <tbody>
            @for (item of draft()?.groceryList.pantryMonthly ?? []; track $index; let i = $index) {
              <tr>
                    <td><input type="text" [value]="item.item" (change)="upd('pantryMonthly', i, { item: val($event) })" /></td>
                    <td><input type="text" list="stores" [value]="item.where" (change)="upd('pantryMonthly', i, { where: val($event) })" style="width: 6rem" /></td>
                    <td class="num">
                      <input type="number" step="0.01" [value]="item.qty" (change)="setNum('pantryMonthly', i, 'qty', $event)" style="width: 4rem" />
                      <input type="text" [value]="item.unit" (change)="upd('pantryMonthly', i, { unit: val($event) })" style="width: 4rem" />
                    </td>
                    <td class="num"><input type="number" step="0.01" [value]="item.regularPrice / 100" (change)="setNum('pantryMonthly', i, 'regularPrice', $event)" style="width: 4rem" /></td>
                    <td class="num"><input type="number" step="0.01" [value]="(item.offerPrice ?? 0) / 100" (change)="setNum('pantryMonthly', i, 'offerPrice', $event)" style="width: 4rem" /></td>
                    <td class="num">{{ fmt(itemCostCents(item)) }}</td>
                    <td><input type="text" [value]="item.note" (change)="upd('pantryMonthly', i, { note: val($event) })" style="width: 100%" /></td>
                    <td><button class="icon danger" (click)="remove('pantryMonthly', i)" title="Delete">−</button></td>
                  </tr>
            }
          </tbody>
        </table>
        <div class="card-footer">
          <div>Total: {{ fmt(monthlyData().pantry) }}</div>
          <button class="link" (click)="add('pantryMonthly', 'Pantry')">+ Add item</button>
        </div>
      </div>

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
  protected toCents = toCents;
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

  protected stores = computed(() => [...new Set((this.draft()?.groceryList.weekly ?? []).map((i) => i.where).filter(Boolean))].sort());

  protected itemCostCents(item: GroceryItem): number {
    const price = this.useOffers() && item.offerPrice != null ? item.offerPrice : item.regularPrice;
    return Math.round(item.qty * price);
  }

  protected storeTotal(rows: { it: GroceryItem }[]): number {
    return rows.reduce((sum, r) => sum + this.itemCostCents(r.it), 0);
  }

  // all edits clone the draft so signals notify
  private edit(fn: (c: Config) => void) {
    this.draft.update((d) => {
      const c = structuredClone(d!);
      fn(c);
      return c;
    });
  }

  protected upd(list: 'weekly' | 'pantryMonthly', i: number, patch: Partial<GroceryItem>) {
    this.edit((c) => Object.assign(c.groceryList[list][i], patch));
  }

  protected setNum(list: 'weekly' | 'pantryMonthly', i: number, k: 'qty' | 'regularPrice' | 'offerPrice', e: Event) {
    const el = e.target as HTMLInputElement;
    const n = Number(el.value);
    if (el.value.trim() === '' || !isFinite(n) || n < 0) {
      const cur = this.draft()!.groceryList[list][i][k];
      el.value = String(k === 'qty' ? cur : (cur ?? 0) / 100);
      return;
    }
    if (k === 'qty') this.upd(list, i, { qty: n });
    else this.upd(list, i, { [k]: k === 'offerPrice' && n === 0 ? null : toCents(n) });
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
