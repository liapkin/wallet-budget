import { Component, computed, inject, resource, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { groceryMonthly, weeklyIngredientGrams } from '../../../shared/src/diet.ts';
import { fmt, toCents } from '../../../shared/src/money.ts';
import type { Config, GroceryItem } from '../../../shared/src/types.ts';
import { Api } from './api';

const val = (e: Event) => (e.target as HTMLInputElement | HTMLSelectElement).value;

@Component({
  selector: 'app-groceries',
  standalone: true,
  imports: [CommonModule, FormsModule],
  styles: `
    .row { display: grid; grid-template-columns: 2fr 1.5fr 1fr 1fr 1.2fr 1.2fr 0.8fr 1fr 0.5fr; gap: 0.5rem; align-items: center; margin-bottom: 0.5rem; }
    input[type="text"], input[type="number"] { width: 100%; }
    .collapsible { cursor: pointer; user-select: none; font-weight: 600; }
    .collapsible:hover { color: var(--accent); }
    .details { margin-left: 1.5rem; margin-top: 0.5rem; }
    .badge { display: inline-block; padding: 0.2rem 0.4rem; border-radius: 3px; font-size: 0.75rem; font-weight: 600; }
    .badge.over { background: var(--danger); color: var(--accent-text); }
    .badge.under { background: var(--pos); color: var(--accent-text); }
  `,
  template: `
    <h1>Grocery list</h1>
    @if (data.error()) {
      <p class="err">Failed to load config.</p>
    }
    @if (cfg(); as c) {
      <div class="toolbar">
        <button class="primary" (click)="save(c)">Save changes</button>
        <div style="display: flex; align-items: center; gap: 0.5rem">
          <input type="checkbox" id="useOffers" [(ngModel)]="useOffers" (change)="markDirty()" />
          <label for="useOffers">Use offer prices</label>
        </div>
      </div>

      <div style="margin-bottom: 1rem">
        <div class="collapsible" (click)="toggleNeeded()">
          Needed per week from meal plan
          <span class="muted" style="font-size: 0.9rem">({{ weeklyNeeded().size }} items)</span>
        </div>
        @if (showNeeded()) {
          <div class="details">
            @for (ing of weeklyIngredientsArray(); track ing[0]) {
              <div style="padding: 0.25rem 0; font-size: 0.9rem">
                <strong>{{ ing[0] }}:</strong> {{ ing[1] }} g
              </div>
            }
          </div>
        }
      </div>

      <h2>Weekly items</h2>
      <div class="scroll">
        <div class="row" style="font-weight: 600; background: var(--badge); position: sticky; top: 0">
          <div>Item</div>
          <div>Where</div>
          <div>Qty</div>
          <div>Unit</div>
          <div class="num">Regular €</div>
          <div class="num">Offer €</div>
          <div class="num">Cost</div>
          <div>Note</div>
          <div></div>
        </div>
        @for (item of c.groceryList.weekly; track item.item; let i = $index) {
          <div class="row">
            <input type="text" [(ngModel)]="item.item" (ngModelChange)="markDirty()" />
            <input type="text" [(ngModel)]="item.where" (ngModelChange)="markDirty()" />
            <input type="number" step="0.01" [(ngModel)]="item.qty" (ngModelChange)="markDirty()" />
            <input type="text" [(ngModel)]="item.unit" (ngModelChange)="markDirty()" size="5" />
            <input
              type="number"
              step="0.01"
              [value]="item.regularPrice / 100"
              (change)="item.regularPrice = toCents(+val($event)); markDirty()"
              aria-label="Regular price €"
            />
            <input
              type="number"
              step="0.01"
              [value]="(item.offerPrice ?? 0) / 100"
              (change)="item.offerPrice = +val($event) > 0 ? toCents(+val($event)) : null; markDirty()"
              aria-label="Offer price €"
            />
            <div class="num">{{ fmt(itemCostCents(item)) }}</div>
            <input type="text" [(ngModel)]="item.note" (ngModelChange)="markDirty()" />
            <button class="link danger" (click)="removeWeekly(c, i)">−</button>
          </div>
        }
        <div class="row" style="font-weight: 600; background: var(--badge)">
          <div style="grid-column: 1 / 7">Weekly total</div>
          <div class="num">{{ fmt(monthlyData().weekly) }}</div>
          <div></div>
          <button class="link" (click)="addWeekly(c)">+ Add item</button>
        </div>
      </div>

      <h2 style="margin-top: 1.5rem">Monthly pantry</h2>
      <div class="scroll">
        <div class="row" style="font-weight: 600; background: var(--badge); position: sticky; top: 0">
          <div>Item</div>
          <div>Where</div>
          <div>Qty</div>
          <div>Unit</div>
          <div class="num">Regular €</div>
          <div class="num">Offer €</div>
          <div class="num">Cost</div>
          <div>Note</div>
          <div></div>
        </div>
        @for (item of c.groceryList.pantryMonthly; track item.item; let i = $index) {
          <div class="row">
            <input type="text" [(ngModel)]="item.item" (ngModelChange)="markDirty()" />
            <input type="text" [(ngModel)]="item.where" (ngModelChange)="markDirty()" />
            <input type="number" step="0.01" [(ngModel)]="item.qty" (ngModelChange)="markDirty()" />
            <input type="text" [(ngModel)]="item.unit" (ngModelChange)="markDirty()" size="5" />
            <input
              type="number"
              step="0.01"
              [value]="item.regularPrice / 100"
              (change)="item.regularPrice = toCents(+val($event)); markDirty()"
              aria-label="Regular price €"
            />
            <input
              type="number"
              step="0.01"
              [value]="(item.offerPrice ?? 0) / 100"
              (change)="item.offerPrice = +val($event) > 0 ? toCents(+val($event)) : null; markDirty()"
              aria-label="Offer price €"
            />
            <div class="num">{{ fmt(itemCostCents(item)) }}</div>
            <input type="text" [(ngModel)]="item.note" (ngModelChange)="markDirty()" />
            <button class="link danger" (click)="removePantry(c, i)">−</button>
          </div>
        }
        <div class="row" style="font-weight: 600; background: var(--badge)">
          <div style="grid-column: 1 / 7">Pantry total</div>
          <div class="num">{{ fmt(monthlyData().pantry) }}</div>
          <div></div>
          <button class="link" (click)="addPantry(c)">+ Add item</button>
        </div>
      </div>

      <div style="margin-top: 1.5rem; padding: 1rem; background: var(--surface); border: 1px solid var(--border); border-radius: 8px">
        <div style="display: flex; gap: 1rem; flex-wrap: wrap; align-items: center">
          <div>
            <strong>Monthly total:</strong>
            <span style="font-size: 1.1rem; margin-left: 0.5rem">{{ fmt(monthlyData().monthly) }}</span>
          </div>
          <div>
            <strong>Plan:</strong>
            <span style="font-size: 1rem; margin-left: 0.5rem">{{ fmt(groceryPlan()) }}</span>
          </div>
          @if (monthlyData().monthly > groceryPlan()) {
            <span class="badge over">Over by {{ fmt(monthlyData().monthly - groceryPlan()) }}</span>
          } @else if (monthlyData().monthly < groceryPlan()) {
            <span class="badge under">Under by {{ fmt(groceryPlan() - monthlyData().monthly) }}</span>
          }
        </div>
      </div>
    }
  `,
})
export class GroceriesComponent {
  protected fmt = fmt;
  protected toCents = toCents;
  protected val = val;
  protected Math = Math;
  protected useOffers = signal(false);
  protected showNeeded = signal(false);
  private api = inject(Api);
  protected data = resource({ loader: () => this.api.config() });
  protected cfg = computed(() => this.data.value());
  protected groceryPlan = computed(() => {
    const cfg = this.cfg();
    if (!cfg) return 0;
    return cfg.coreExpenses.find((l) => l.key === 'groceries')?.plan || 0;
  });

  protected weeklyNeeded = computed(() => {
    const cfg = this.cfg();
    if (!cfg) return new Map<string, number>();
    return new Map(Object.entries(weeklyIngredientGrams(cfg.diet)));
  });

  protected weeklyIngredientsArray = computed(() => {
    const needed = this.weeklyNeeded();
    return Array.from(needed.entries()).sort();
  });

  protected monthlyData = computed(() => {
    const cfg = this.cfg();
    if (!cfg) return { weekly: 0, pantry: 0, monthly: 0 };
    return groceryMonthly(cfg.groceryList, this.useOffers());
  });

  protected itemCostCents(item: GroceryItem): number {
    const price = this.useOffers() && item.offerPrice != null ? item.offerPrice : item.regularPrice;
    return Math.round(item.qty * price);
  }

  protected toggleNeeded() {
    this.showNeeded.update((v) => !v);
  }

  protected removeWeekly(cfg: Config, index: number) {
    cfg.groceryList.weekly.splice(index, 1);
    this.markDirty();
  }

  protected addWeekly(cfg: Config) {
    cfg.groceryList.weekly.push({
      item: 'New item',
      where: '',
      qty: 1,
      unit: 'unit',
      regularPrice: 0,
      offerPrice: null,
      note: '',
    });
    this.markDirty();
  }

  protected removePantry(cfg: Config, index: number) {
    cfg.groceryList.pantryMonthly.splice(index, 1);
    this.markDirty();
  }

  protected addPantry(cfg: Config) {
    cfg.groceryList.pantryMonthly.push({
      item: 'New item',
      where: '',
      qty: 1,
      unit: 'unit',
      regularPrice: 0,
      offerPrice: null,
      note: '',
    });
    this.markDirty();
  }

  protected markDirty() {
    // Mark config as modified
  }

  protected save(cfg: Config) {
    this.api.saveConfig(cfg).then(() => {
      this.data.reload();
    });
  }
}
