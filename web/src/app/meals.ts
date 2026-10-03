import { Component, computed, effect, inject, resource, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { dayTotals, mealTotals, proteinTarget, weekAverage } from '../../../shared/src/diet.ts';
import { fmt, val } from './format.ts';
import type { Config } from '../../../shared/src/types.ts';
import { Api } from './api';
import { Combo } from './ui/combo';
import { editDraft } from './ui/config-draft';
import { Toast } from './ui/toast';

type Row = Record<string, string>;

@Component({
  selector: 'app-meals',
  standalone: true,
  imports: [CommonModule, Combo],
  styles: `
    .card.plan { padding: 0; overflow: hidden; }
    .card.plan .scroll { border: 0; box-shadow: none; border-radius: 0; }
    .plan table { table-layout: fixed; width: 100%; min-width: 1100px; border-collapse: collapse; }
    .plan th, .plan td { padding: var(--sp-2); min-width: 150px; vertical-align: middle; }
    .plan th:first-child, .plan td:first-child { width: 96px; min-width: 96px; position: sticky; left: 0; background: var(--surface); z-index: 1; text-align: left; }
    .plan thead th { text-align: left; }
    .plan app-combo { display: block; width: 100%; min-width: 0; }
    .plan tfoot td { border-top: 1px solid var(--border); }
    .plan .val { font-weight: 700; }
    .plan .val.over { color: var(--bad); }
    .plan .val.under { color: var(--warn); }
    .progress-small { height: 6px; margin-top: var(--sp-1); }
    .meals-head { display: flex; align-items: baseline; flex-wrap: wrap; gap: var(--sp-3); margin: var(--sp-5) 0 var(--sp-2); }
    .meals-head h2 { margin: 0; }
    .meals-head .new { margin-left: auto; display: flex; gap: var(--sp-2); }
    .meal-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 650px), 1fr)); gap: var(--sp-4); }
    .meal-grid .card { margin: 0; min-width: 0; padding: var(--sp-3) var(--sp-4); }
    .meal-grid summary { cursor: pointer; padding: var(--sp-1) 0; list-style-position: inside; }
    .meal-head { display: flex; flex-direction: column; margin-bottom: var(--sp-2); }
    .meal-head strong { overflow-wrap: anywhere; }
    .ing-table { width: 100%; min-width: 580px; table-layout: fixed; border-collapse: collapse; font-size: var(--fs-sm); margin-top: var(--sp-2); }
    .targets { display: flex; flex-wrap: wrap; gap: var(--sp-3); align-items: center; }
    .targets h2 { width: 100%; margin: 0; }
    .targets label { display: flex; align-items: center; gap: var(--sp-2); }
    .targets input[type=number] { width: 100px; }
    .ing-table th, .ing-table td { padding: var(--sp-1); text-align: left; border-bottom: 1px solid var(--border); }
    .ing-table th { font-weight: 600; color: var(--muted); font-size: var(--fs-xs); text-transform: uppercase; }
    .ing-table th.num { text-align: right; }
    .ing-table input { width: 100%; min-width: 0; }
    .ing-table th:last-child, .ing-table td:last-child { width: 36px; }
  `,
  template: `
    <div class="page-head">
      <h1>Meal plan</h1>
    </div>

    @if (data.error()) {
      <p class="err">Failed to load config.</p>
    }
    @if (draft(); as c) {
      <div class="card targets">
        <h2>Daily targets</h2>
        <label>Body weight (kg) <input aria-label="Body weight (kg)" type="number" min="0" step="any" [value]="c.diet.bodyWeightKg" (input)="setTarget('bodyWeightKg', $event)" /></label>
        <label>Protein (g/kg) <input aria-label="Protein (g/kg)" type="number" min="0" step="any" [value]="c.diet.proteinPerKg" (input)="setTarget('proteinPerKg', $event)" /></label>
        <label>Energy (kcal/day) <input aria-label="Energy (kcal/day)" type="number" min="0" step="any" [value]="c.diet.energyTargetKcal" (input)="setTarget('energyTargetKcal', $event)" /></label>
        <label><input type="checkbox" [checked]="c.diet.energyTargetIsPlaceholder" (change)="setPlaceholder($event)" /> Energy target is a placeholder</label>
      </div>
      <div class="kpis">
        <div class="kpi">
          <div class="label">Protein target</div>
          <div class="value">{{ proteinTgt(c.diet) }}g</div>
        </div>
        <div class="kpi">
          <div class="label">Weekly avg protein</div>
          <div class="value">{{ avg().protein }}g</div>
          <div class="progress progress-small">
            <i [style.width.%]="Math.min(100, (avg().protein / proteinTgt(c.diet)) * 100)"></i>
          </div>
          <div class="sub">{{ proteinTgt(c.diet) }}g target</div>
        </div>
        <div class="kpi">
          <div class="label">Weekly avg energy</div>
          <div class="value">{{ avg().kcal }}</div>
          <div class="progress progress-small">
            <i [style.width.%]="Math.min(100, (avg().kcal / c.diet.energyTargetKcal) * 100)"></i>
          </div>
          <div class="sub">
            @if (c.diet.energyTargetIsPlaceholder) {
              <span class="badge" style="margin-top: var(--sp-1)">Placeholder target</span>
            } @else {
              {{ c.diet.energyTargetKcal }} kcal target
            }
          </div>
        </div>
      </div>

      <p class="muted">Weekly average: {{ macro(avg().carbs) }} carbs, {{ macro(avg().fat) }} fat. Missing label values show “Not set”; calories are entered separately.</p>

      <div class="card plan">
        <div class="scroll">
          <table>
            <thead>
              <tr>
                <th></th>
                @for (day of days(); track day.day) {
                  <th [title]="day.day">{{ day.day.slice(0, 3) }}</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (slot of slots; track slot) {
                <tr>
                  <th scope="row">{{ slot | titlecase }}</th>
                  @for (day of days(); track day.day) {
                    @let cur = dayMealSelection(day.day, slot);
                    <td>
                      <app-combo [options]="mealOptions()" [value]="cur" placeholder="—" [ariaLabel]="slot + ' ' + day.day" (changed)="setMeal(day.day, slot, $event)" />
                    </td>
                  }
                </tr>
              }
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Protein (g)</th>
                @for (day of days(); track day.day) {
                  <td>
                    <div class="val" [class.over]="day.protein > proteinTgt(c.diet)" [class.under]="day.protein < proteinTgt(c.diet)">{{ day.protein }}</div>
                    <div class="progress progress-small"><i [class.over]="day.protein > proteinTgt(c.diet)" [style.width.%]="Math.min(100, (day.protein / proteinTgt(c.diet)) * 100)"></i></div>
                  </td>
                }
              </tr>
              <tr>
                <th scope="row">Energy (kcal)</th>
                @for (day of days(); track day.day) {
                  <td>
                    <div class="val" [class.over]="day.kcal > c.diet.energyTargetKcal" [class.under]="day.kcal < c.diet.energyTargetKcal">{{ day.kcal }}</div>
                    <div class="progress progress-small"><i [class.over]="day.kcal > c.diet.energyTargetKcal" [style.width.%]="Math.min(100, (day.kcal / c.diet.energyTargetKcal) * 100)"></i></div>
                  </td>
                }
              </tr>
              <tr><th scope="row">Carbs (g)</th>@for (day of days(); track day.day) { <td>{{ macro(day.carbs) }}</td> }</tr>
              <tr><th scope="row">Fat (g)</th>@for (day of days(); track day.day) { <td>{{ macro(day.fat) }}</td> }</tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div class="meals-head">
        <h2>Meals</h2>
        <span class="muted" style="font-size: var(--fs-sm)">Raw/dry weights. Typical label values, not measured.</span>
        <div class="new">
          <input #nm placeholder="New meal name" />
          <button (click)="newMeal(nm.value); nm.value = ''">+ New meal</button>
        </div>
      </div>

      <div class="meal-grid">
        @for (meal of mealNames(); track meal) {
          <div class="card">
            <div class="meal-head">
              <strong>{{ meal }}</strong>
              <span class="muted" style="font-size: var(--fs-sm)">{{ mealNutrition(meal).protein }}g protein, {{ mealNutrition(meal).kcal }} kcal / portion<br />{{ macro(mealNutrition(meal).carbs) }} carbs, {{ macro(mealNutrition(meal).fat) }} fat / portion</span>
            </div>
            <details>
              <summary>Edit ingredients</summary>
              <div class="scroll">
              <table class="ing-table">
                <thead>
                  <tr>
                    <th>Ingredient</th>
                    <th class="num">Grams</th>
                    <th class="num">Protein g/100g</th>
                    <th class="num">kcal/100g</th>
                    <th class="num">Carbs g/100g</th>
                    <th class="num">Fat g/100g</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  @for (r of ingredientsForMeal(meal); track $index) {
                    <tr>
                      <td><input [attr.aria-label]="meal + ' ingredient name ' + (r.i + 1)" [value]="r.ing.ingredient" (input)="setName(r.i, val($event))" /></td>
                      <td><input type="number" min="0" step="any" [attr.aria-label]="meal + ' ' + r.ing.ingredient + ' grams'" [value]="r.ing.grams" (input)="setNum(r.i, 'grams', $event)" /></td>
                      <td><input type="number" min="0" step="any" [attr.aria-label]="meal + ' ' + r.ing.ingredient + ' protein g per 100g'" [value]="r.ing.proteinPer100g" (input)="setNum(r.i, 'proteinPer100g', $event)" /></td>
                      <td><input type="number" min="0" step="any" [attr.aria-label]="meal + ' ' + r.ing.ingredient + ' kcal per 100g'" [value]="r.ing.kcalPer100g" (input)="setNum(r.i, 'kcalPer100g', $event)" /></td>
                      <td><input type="number" min="0" step="any" placeholder="Not set" [attr.aria-label]="meal + ' ' + r.ing.ingredient + ' carbs g per 100g'" [value]="r.ing.carbsPer100g ?? ''" (input)="setNum(r.i, 'carbsPer100g', $event)" /></td>
                      <td><input type="number" min="0" step="any" placeholder="Not set" [attr.aria-label]="meal + ' ' + r.ing.ingredient + ' fat g per 100g'" [value]="r.ing.fatPer100g ?? ''" (input)="setNum(r.i, 'fatPer100g', $event)" /></td>
                      <td><button class="icon danger" (click)="removeIngredient(r.i)" [attr.aria-label]="'Delete ' + r.ing.ingredient + ' from ' + meal">−</button></td>
                    </tr>
                  }
                </tbody>
              </table>
              </div>
              <button class="link" (click)="addIngredient(meal)" style="margin-top: var(--sp-2)">+ Add ingredient</button>
            </details>
          </div>
        }
      </div>

      @if (errorMessages().length) { <p class="err" role="alert">{{ errorMessages().join(' ') }}</p> }
      @if (dirty() || errorMessages().length) {
        <div class="savebar">
          Unsaved changes
          <button class="ghost" [disabled]="saving()" (click)="discard()">Discard</button>
          <button class="primary" [disabled]="saving() || !!errorMessages().length || !dirty()" (click)="save()">{{ saving() ? 'Saving…' : 'Save' }}</button>
        </div>
      }
    }
  `,
})
export class MealsComponent {
  protected fmt = fmt;
  protected slots = ['breakfast', 'lunch', 'snack', 'dinner', 'shake'];
  protected val = val;
  protected Math = Math;
  private api = inject(Api);
  private toast = inject(Toast);
  protected data = resource({ loader: () => this.api.config() });
  protected cfg = computed(() => this.data.value());
  protected draft = signal<Config | null>(null);
  protected saving = signal(false);
  private errors = signal<Record<string, string>>({});
  private invalidInputs = new Map<HTMLInputElement, { key: string; previous: string }>();
  protected errorMessages = computed(() => Object.values(this.errors()));
  protected macro = (value: number | undefined) => value === undefined ? 'Not set' : `${value}g`;
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
      if (cfg && !this.draft()) this.draft.set(structuredClone(cfg));
    });
  }

  protected proteinTgt = (diet: Config['diet']): number => {
    return proteinTarget(diet);
  };

  protected mealNames = computed(() => {
    const dft = this.draft();
    if (!dft) return [];
    const names = new Set<string>();
    for (const ing of dft.diet.ingredientsPerPortion) names.add(ing.meal);
    for (const d of dft.diet.week as unknown as Row[]) {
      for (const slot of this.slots) if (d[slot]) names.add(d[slot]);
    }
    return Array.from(names).sort();
  });

  protected days = computed(() => {
    const dft = this.draft();
    return dft ? dayTotals(dft.diet) : [];
  });

  protected avg = computed(() => {
    const dft = this.draft();
    return dft ? weekAverage(dft.diet) : { protein: 0, kcal: 0, carbs: undefined, fat: undefined };
  });

  protected mealNutrition = (meal: string) => {
    const dft = this.draft();
    if (!dft) return { protein: 0, kcal: 0, carbs: undefined, fat: undefined };
    const totals = mealTotals(dft.diet);
    return totals[meal] || { protein: 0, kcal: 0, carbs: undefined, fat: undefined };
  };

  protected dayMealSelection(day: string, slot: string): string {
    const dft = this.draft();
    if (!dft) return '';
    const dayObj = dft.diet.week.find((d) => (d as Record<string, string>)['day'] === day);
    return dayObj ? (dayObj as Record<string, string>)[slot] || '' : '';
  }

  protected ingredientsForMeal(meal: string) {
    const dft = this.draft();
    if (!dft) return [];
    return dft.diet.ingredientsPerPortion.flatMap((ing, i) => (ing.meal === meal ? [{ ing, i }] : []));
  }

  private edit = (fn: (c: Config) => void) => editDraft(this.draft, fn);

  protected mealOptions = computed(() => [{ value: '', label: '—' }, ...this.mealNames().map((m) => ({ value: m, label: m }))]);

  protected setMeal(day: string, slot: string, mealName: string) {
    this.edit((c) => {
      const d = (c.diet.week as unknown as Row[]).find((x) => x['day'] === day);
      if (d) d[slot] = mealName;
    });
  }

  protected setName(i: number, v: string) {
    this.edit((c) => (c.diet.ingredientsPerPortion[i].ingredient = v));
  }

  private validateNumber(key: string, e: Event, previous: number | undefined, positive = false, optional = false): number | undefined | null {
    const el = e.target as HTMLInputElement;
    const n = Number(el.value);
    const empty = el.value.trim() === '' && !el.validity.badInput;
    const valid = (optional && empty) || (!empty && !el.validity.badInput && Number.isFinite(n) && (positive ? n > 0 : n >= 0));
    const message = valid ? '' : `${el.getAttribute('aria-label') || key}: enter a finite number ${positive ? 'greater than zero' : 'zero or greater'}.`;
    el.setCustomValidity(message);
    el.setAttribute('aria-invalid', String(!valid));
    if (valid) this.invalidInputs.delete(el);
    else this.invalidInputs.set(el, { key, previous: previous === undefined ? '' : String(previous) });
    this.errors.update((errors) => {
      const next = { ...errors };
      if (valid) delete next[key];
      else next[key] = message;
      return next;
    });
    return valid ? (empty ? undefined : n) : null;
  }

  protected setTarget(k: 'bodyWeightKg' | 'proteinPerKg' | 'energyTargetKcal', e: Event) {
    const n = this.validateNumber(k, e, this.draft()!.diet[k], true);
    if (n !== null && n !== undefined) this.edit((c) => c.diet[k] = n);
  }

  protected setPlaceholder(e: Event) {
    this.edit((c) => c.diet.energyTargetIsPlaceholder = (e.target as HTMLInputElement).checked);
  }

  protected setNum(i: number, k: 'grams' | 'proteinPer100g' | 'kcalPer100g' | 'carbsPer100g' | 'fatPer100g', e: Event) {
    const optional = k === 'carbsPer100g' || k === 'fatPer100g';
    const n = this.validateNumber(`${i}.${k}`, e, this.draft()!.diet.ingredientsPerPortion[i][k], false, optional);
    if (n !== null) this.edit((c) => {
      if (n === undefined) delete c.diet.ingredientsPerPortion[i][k as 'carbsPer100g' | 'fatPer100g'];
      else c.diet.ingredientsPerPortion[i][k] = n;
    });
  }

  protected removeIngredient(i: number) {
    this.edit((c) => c.diet.ingredientsPerPortion.splice(i, 1));
    for (const [input, invalid] of this.invalidInputs) {
      const match = /^(\d+)\.(.*)$/.exec(invalid.key);
      if (!match) continue;
      const index = Number(match[1]);
      if (index === i) {
        input.value = invalid.previous;
        input.setCustomValidity('');
        input.removeAttribute('aria-invalid');
        this.invalidInputs.delete(input);
      } else if (index > i) invalid.key = `${index - 1}.${match[2]}`;
    }
    this.errors.update((errors) => Object.fromEntries(Object.entries(errors).flatMap(([key, message]) => {
      const match = /^(\d+)\.(.*)$/.exec(key);
      if (!match) return [[key, message]];
      const index = Number(match[1]);
      return index === i ? [] : [[`${index > i ? index - 1 : index}.${match[2]}`, message]];
    })));
  }

  protected addIngredient(meal: string) {
    this.edit((c) =>
      c.diet.ingredientsPerPortion.push({ meal, ingredient: 'New ingredient', grams: 100, proteinPer100g: 10, kcalPer100g: 100 }),
    );
  }

  protected newMeal(name: string) {
    name = name.trim();
    if (name && !this.mealNames().includes(name)) this.addIngredient(name);
  }

  protected discard() {
    const cfg = this.cfg();
    if (cfg) this.draft.set(structuredClone(cfg));
    this.errors.set({});
    for (const [input, { previous }] of this.invalidInputs) {
      input.value = previous;
      input.setCustomValidity('');
      input.removeAttribute('aria-invalid');
    }
    this.invalidInputs.clear();
  }

  protected async save() {
    if (!this.draft() || !this.dirty() || this.saving() || this.errorMessages().length) return;
    const snapshot = structuredClone(this.draft()!);
    this.saving.set(true);
    try {
      const saved = await this.api.saveConfig(snapshot);
      this.data.set(saved);
      if (JSON.stringify(this.draft()) === JSON.stringify(snapshot)) this.draft.set(structuredClone(saved));
      this.toast.show('Meal plan saved', 'ok');
    } catch {
      this.toast.show('Failed to save meal plan', 'err');
    } finally {
      this.saving.set(false);
    }
  }
}
