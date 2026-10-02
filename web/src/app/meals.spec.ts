import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import type { Config } from '../../../shared/src/types.ts';
import { Api } from './api';
import { MealsComponent } from './meals';
import { Toast } from './ui/toast';

describe('Meal editing', () => {
  let stored: Config;
  let api: { config: () => Promise<Config>; saveConfig: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    stored = { diet: {
      bodyWeightKg: 80, proteinPerKg: 2, energyTargetKcal: 2400, energyTargetIsPlaceholder: true,
      week: [{ day: 'Monday', breakfast: 'Oats', lunch: '', snack: '', dinner: '', shake: '' }],
      ingredientsPerPortion: [{ meal: 'Oats', ingredient: 'Oats', grams: 100, proteinPer100g: 10, kcalPer100g: 400 }],
      nutritionNote: 'Label values',
    } } as unknown as Config;
    api = {
      config: async () => structuredClone(stored),
      saveConfig: vi.fn(async (config: Config) => { stored = structuredClone(config); return structuredClone(stored); }),
    };
    TestBed.configureTestingModule({ providers: [
      { provide: Api, useValue: api }, { provide: Toast, useValue: { show: vi.fn() } },
    ] });
  });

  async function mount() {
    const fixture = TestBed.createComponent(MealsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const component = fixture.componentInstance as any;
    const input = (label: string, value: string) => {
      const el = fixture.nativeElement.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement;
      expect(el).toBeTruthy();
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      fixture.detectChanges();
      return el;
    };
    return { fixture, component, input };
  }

  it('updates ingredients, macros and targets immediately; saves and reloads', async () => {
    const { fixture, component, input } = await mount();
    expect(fixture.nativeElement.textContent).toContain('Edit ingredients');
    expect(fixture.nativeElement.textContent).toContain('Not set');
    input('Oats Oats grams', '200');
    input('Oats Oats protein g per 100g', '12');
    input('Oats Oats kcal per 100g', '350');
    input('Oats Oats carbs g per 100g', '60');
    input('Oats Oats fat g per 100g', '0');
    input('Body weight (kg)', '90');
    input('Protein (g/kg)', '1.5');
    input('Energy (kcal/day)', '2200');
    expect(component.days()[0]).toMatchObject({ protein: 24, kcal: 700, carbs: 120, fat: 0 });
    expect(component.avg()).toMatchObject({ carbs: 120, fat: 0 });
    expect(fixture.nativeElement.textContent).toContain('135g');
    expect(fixture.nativeElement.textContent).toContain('120g carbs, 0g fat');
    const placeholder = fixture.nativeElement.querySelector('input[type="checkbox"]') as HTMLInputElement;
    placeholder.checked = false;
    placeholder.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('2200 kcal target');
    await component.save();
    fixture.detectChanges();
    expect(component.dirty()).toBe(false);
    expect(api.saveConfig).toHaveBeenCalledTimes(1);
    const reloaded = await mount();
    expect(reloaded.component.draft().diet).toEqual(stored.diet);
    input('Oats Oats carbs g per 100g', '');
    expect(component.days()[0].carbs).toBeUndefined();
    expect(component.days()[0].fat).toBe(0);
    component.discard();
    fixture.detectChanges();
    expect(component.draft().diet).toEqual(stored.diet);
    expect(component.dirty()).toBe(false);
  });

  it('preserves valid draft and blocks invalid targets/nutrition; discard clears errors', async () => {
    const { fixture, component, input } = await mount();
    input('Oats Oats grams', '150');
    const invalid = input('Oats Oats protein g per 100g', '-1');
    input('Body weight (kg)', '0');
    input('Energy (kcal/day)', '');
    input('Oats Oats fat g per 100g', '-2');
    const incomplete = document.createElement('input');
    incomplete.type = 'number';
    Object.defineProperty(incomplete, 'validity', { value: { badInput: true } });
    component.setNum(0, 'grams', { target: incomplete });
    expect(component.draft().diet.ingredientsPerPortion[0]).toMatchObject({ grams: 150, proteinPer100g: 10 });
    expect(component.draft().diet.bodyWeightKg).toBe(80);
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('greater than zero');
    expect(invalid.getAttribute('aria-invalid')).toBe('true');
    await component.save();
    expect(api.saveConfig).not.toHaveBeenCalled();
    component.discard();
    fixture.detectChanges();
    expect(component.errorMessages()).toEqual([]);
    expect(component.dirty()).toBe(false);
    expect(invalid.value).toBe('10');
    expect(invalid.validity.valid).toBe(true);
  });

  it('clears removed ingredient validation when next row reuses its inputs', async () => {
    stored.diet.ingredientsPerPortion.push({ meal: 'Oats', ingredient: 'Milk', grams: 100, proteinPer100g: 3, kcalPer100g: 60 });
    const { fixture, component, input } = await mount();
    const invalid = input('Oats Oats grams', '-1');
    component.removeIngredient(0);
    fixture.detectChanges();
    const reused = fixture.nativeElement.querySelector('input[aria-label="Oats Milk grams"]') as HTMLInputElement;
    expect(reused).toBe(invalid);
    expect(reused.value).toBe('100');
    expect(reused.validity.valid).toBe(true);
    expect(reused.getAttribute('aria-invalid')).not.toBe('true');
    expect(component.errorMessages()).toEqual([]);
    await component.save();
    expect(api.saveConfig).toHaveBeenCalledTimes(1);
    expect(stored.diet.ingredientsPerPortion[0].ingredient).toBe('Milk');
  });

  it('keeps edits on failed save and keeps later edits during a successful save', async () => {
    const { fixture, component, input } = await mount();
    input('Oats Oats grams', '150');
    api.saveConfig.mockRejectedValueOnce(new Error('offline'));
    await component.save();
    expect(component.dirty()).toBe(true);
    expect(component.draft().diet.ingredientsPerPortion[0].grams).toBe(150);
    let finish!: (config: Config) => void;
    api.saveConfig.mockImplementationOnce(() => new Promise<Config>((resolve) => finish = resolve));
    const saving = component.save();
    const snapshot = structuredClone(component.draft());
    input('Oats Oats grams', '200');
    finish(snapshot);
    await saving;
    fixture.detectChanges();
    expect(component.draft().diet.ingredientsPerPortion[0].grams).toBe(200);
    expect(component.dirty()).toBe(true);
    component.discard();
    expect(component.draft().diet.ingredientsPerPortion[0].grams).toBe(150);
  });
});
