import { Component, computed, input } from '@angular/core';

/** 16x16 pixel icons, each one path of filled rectangles. */
const PATHS = {
  calendar: 'M4 2h1v2h-1zM11 2h1v2h-1zM2 4h12v2h-12zM2 6h1v7h-1zM13 6h1v7h-1zM4 7h1v1h-1zM7 7h1v1h-1zM10 7h1v1h-1zM4 9h1v1h-1zM7 9h1v1h-1zM10 9h1v1h-1zM4 11h1v1h-1zM7 11h1v1h-1zM2 13h12v1h-12z',
  history: 'M4 2h8v1h-8zM2 3h3v1h-3zM11 3h2v1h-2zM2 4h2v1h-2zM12 4h1v1h-1zM2 5h1v1h-1zM7 5h1v3h-1zM13 5h1v6h-1zM2 7h1v4h-1zM7 8h4v1h-4zM3 11h1v1h-1zM12 11h1v1h-1zM3 12h2v1h-2zM11 12h2v1h-2zM4 13h8v1h-8z',
  list: 'M2 4h2v1h-2zM6 4h8v1h-8zM2 8h2v1h-2zM6 8h8v1h-8zM2 12h2v1h-2zM6 12h8v1h-8z',
  wallet: 'M2 3h12v1h-12zM1 4h1v9h-1zM14 4h1v2h-1zM9 6h6v1h-6zM9 7h1v2h-1zM11 7h1v1h-1zM14 7h1v2h-1zM9 9h6v1h-6zM14 10h1v3h-1zM2 13h12v1h-12z',
  pencil: 'M12 1h2v1h-2zM11 2h4v1h-4zM10 3h4v1h-4zM9 4h4v1h-4zM8 5h4v1h-4zM7 6h4v1h-4zM6 7h4v1h-4zM5 8h4v1h-4zM4 9h4v1h-4zM3 10h4v1h-4zM2 11h4v1h-4zM2 12h3v1h-3zM2 13h1v1h-1z',
  sliders: 'M4 3h3v1h-3zM2 4h12v1h-12zM4 5h3v1h-3zM8 7h3v1h-3zM2 8h12v1h-12zM8 9h3v1h-3zM6 11h3v1h-3zM2 12h12v1h-12zM6 13h3v1h-3z',
  chart: 'M2 2h1v11h-1zM13 6h1v1h-1zM12 7h1v1h-1zM7 8h1v1h-1zM11 8h1v1h-1zM6 9h1v1h-1zM8 9h1v1h-1zM10 9h1v1h-1zM5 10h1v1h-1zM9 10h1v1h-1zM4 11h1v1h-1zM2 13h12v1h-12z',
  trend: 'M7 3h6v1h-6zM11 4h2v1h-2zM10 5h1v1h-1zM12 5h1v4h-1zM9 6h1v1h-1zM8 7h1v1h-1zM7 8h1v1h-1zM6 9h1v1h-1zM5 10h1v1h-1zM4 11h1v1h-1zM3 12h1v1h-1z',
  utensils: 'M3 2h1v4h-1zM5 2h1v4h-1zM7 2h1v4h-1zM11 2h2v6h-2zM3 6h5v1h-5zM5 7h1v7h-1zM11 8h1v6h-1z',
  cart: 'M1 3h3v1h-3zM3 4h1v1h-1zM3 5h12v1h-12zM4 6h1v2h-1zM13 6h1v2h-1zM5 8h1v1h-1zM12 8h1v1h-1zM6 9h6v1h-6zM5 11h2v2h-2zM10 11h2v2h-2z',
  refresh: 'M8 1h1v1h-1zM8 2h2v1h-2zM4 3h7v1h-7zM3 4h2v1h-2zM8 4h2v1h-2zM3 5h1v1h-1zM8 5h1v1h-1zM2 6h1v6h-1zM13 6h1v6h-1zM3 12h1v1h-1zM12 12h1v1h-1zM3 13h2v1h-2zM11 13h2v1h-2zM4 14h8v1h-8z',
  monitor: 'M2 2h12v1h-12zM1 3h1v8h-1zM14 3h1v8h-1zM1 11h14v1h-14zM7 12h2v1h-2zM4 13h8v1h-8z',
  sun: 'M7 1h2v2h-2zM3 3h1v1h-1zM12 3h1v1h-1zM6 5h4v1h-4zM5 6h6v4h-6zM1 7h2v2h-2zM13 7h2v2h-2zM6 10h4v1h-4zM3 12h1v1h-1zM12 12h1v1h-1zM7 13h2v2h-2z',
  moon: 'M5 2h2v1h-2zM3 3h3v1h-3zM2 4h4v2h-4zM1 6h5v2h-5zM1 8h6v1h-6zM1 9h7v1h-7zM2 10h8v1h-8zM12 10h1v1h-1zM2 11h11v1h-11zM3 12h9v1h-9zM5 13h5v1h-5z',
  menu: 'M2 3h12v2h-12zM2 7h12v2h-12zM2 11h12v2h-12z',
  x: 'M3 3h2v1h-2zM11 3h2v1h-2zM4 4h2v1h-2zM10 4h2v1h-2zM5 5h2v1h-2zM9 5h2v1h-2zM6 6h4v1h-4zM7 7h2v1h-2zM6 8h4v1h-4zM5 9h2v1h-2zM9 9h2v1h-2zM4 10h2v1h-2zM10 10h2v1h-2zM3 11h2v1h-2zM11 11h2v1h-2zM2 12h2v1h-2zM12 12h2v1h-2z',
  chevronLeft: 'M10 2h2v1h-2zM9 3h2v1h-2zM8 4h2v1h-2zM7 5h2v1h-2zM6 6h2v1h-2zM5 7h2v2h-2zM6 9h2v1h-2zM7 10h2v1h-2zM8 11h2v1h-2zM9 12h2v1h-2zM10 13h2v1h-2z',
  chevronRight: 'M4 2h2v1h-2zM5 3h2v1h-2zM6 4h2v1h-2zM7 5h2v1h-2zM8 6h2v1h-2zM9 7h2v2h-2zM8 9h2v1h-2zM7 10h2v1h-2zM6 11h2v1h-2zM5 12h2v1h-2zM4 13h2v1h-2z',
  plus: 'M7 3h2v4h-2zM2 7h12v2h-12zM7 9h2v4h-2z',
  trash: 'M6 2h4v1h-4zM2 3h12v1h-12zM3 4h1v8h-1zM12 4h1v8h-1zM6 6h1v6h-1zM9 6h1v6h-1zM3 12h10v1h-10z',
  check: 'M12 4h2v1h-2zM11 5h2v1h-2zM10 6h2v1h-2zM9 7h2v1h-2zM2 8h2v1h-2zM8 8h2v1h-2zM3 9h2v1h-2zM7 9h2v1h-2zM4 10h4v1h-4zM5 11h2v1h-2z',
  logo: 'M4 2h8v1h-8zM3 3h2v1h-2zM11 3h2v1h-2zM3 4h1v1h-1zM12 4h1v1h-1zM2 5h1v6h-1zM13 5h1v6h-1zM5 6h1v2h-1zM10 6h1v2h-1zM5 9h1v1h-1zM10 9h1v1h-1zM6 10h4v1h-4zM3 11h1v1h-1zM12 11h1v1h-1zM3 12h2v1h-2zM11 12h2v1h-2zM4 13h8v1h-8z',
  repeat: 'M11 2h1v1h-1zM12 3h1v1h-1zM1 4h13v1h-13zM12 5h1v1h-1zM11 6h1v1h-1zM4 9h1v1h-1zM3 10h1v1h-1zM2 11h13v1h-13zM3 12h1v1h-1zM4 13h1v1h-1z',
  inbox: 'M7 2h2v4h-2zM5 6h6v1h-6zM6 7h4v1h-4zM7 8h2v1h-2zM2 10h1v3h-1zM13 10h1v3h-1zM2 13h12v1h-12z',
  eye: 'M5 3h6v1h-6zM2 4h3v1h-3zM11 4h3v1h-3zM1 5h1v1h-1zM6 5h4v1h-4zM14 5h1v1h-1zM0 6h1v4h-1zM5 6h1v4h-1zM10 6h1v4h-1zM15 6h1v4h-1zM7 7h2v2h-2zM1 10h1v1h-1zM6 10h4v1h-4zM14 10h1v1h-1zM2 11h3v1h-3zM11 11h3v1h-3zM5 12h6v1h-6z',
  eyeOff: 'M5 3h5v1h-5zM12 3h1v1h-1zM2 4h3v1h-3zM11 4h1v1h-1zM1 5h1v1h-1zM6 5h2v1h-2zM10 5h1v1h-1zM14 5h1v1h-1zM0 6h1v4h-1zM5 6h1v2h-1zM9 6h1v1h-1zM15 6h1v4h-1zM8 7h1v1h-1zM7 8h1v1h-1zM10 8h1v2h-1zM6 9h1v1h-1zM1 10h1v1h-1zM5 10h1v1h-1zM8 10h2v1h-2zM14 10h1v1h-1zM4 11h1v1h-1zM11 11h3v1h-3zM3 12h1v1h-1zM6 12h5v1h-5z',
  arrowRight: 'M10 4h2v1h-2zM11 5h2v1h-2zM12 6h2v1h-2zM2 7h12v2h-12zM12 9h2v1h-2zM11 10h2v1h-2zM10 11h2v1h-2z',
  selector: 'M7 2h2v1h-2zM6 3h1v1h-1zM9 3h1v1h-1zM5 4h1v1h-1zM10 4h1v1h-1zM4 5h1v1h-1zM11 5h1v1h-1zM4 10h1v1h-1zM11 10h1v1h-1zM5 11h1v1h-1zM10 11h1v1h-1zM6 12h1v1h-1zM9 12h1v1h-1zM7 13h2v1h-2z',
  template: 'M2 2h12v1h-12zM1 3h1v2h-1zM14 3h1v2h-1zM1 5h14v1h-14zM1 6h1v7h-1zM6 6h1v7h-1zM14 6h1v7h-1zM2 13h12v1h-12z',
  styles: 'M7 1h2v2h-2zM6 3h1v2h-1zM9 3h1v2h-1zM5 5h1v2h-1zM10 5h1v2h-1zM4 7h1v1h-1zM11 7h1v1h-1zM3 8h1v3h-1zM12 8h1v3h-1zM5 9h1v2h-1zM4 11h1v1h-1zM11 11h1v1h-1zM5 12h1v1h-1zM10 12h1v1h-1zM6 13h4v1h-4z',
  networth: 'M12 3h2v10h-2zM7 6h2v7h-2zM2 9h2v4h-2zM1 13h14v1h-14z',
  goals: 'M4 2h8v1h-8zM3 3h2v1h-2zM11 3h2v1h-2zM3 4h1v1h-1zM12 4h1v1h-1zM2 5h1v6h-1zM7 5h2v1h-2zM13 5h1v6h-1zM6 6h1v1h-1zM9 6h1v1h-1zM5 7h1v2h-1zM7 7h2v2h-2zM10 7h1v2h-1zM6 9h1v1h-1zM9 9h1v1h-1zM7 10h2v1h-2zM3 11h1v1h-1zM12 11h1v1h-1zM3 12h2v1h-2zM11 12h2v1h-2zM4 13h8v1h-8z',
  coin: 'M4 2h8v1h-8zM3 3h2v1h-2zM11 3h2v1h-2zM3 4h1v1h-1zM12 4h1v1h-1zM2 5h1v6h-1zM6 5h3v1h-3zM13 5h1v6h-1zM6 6h1v1h-1zM9 6h1v1h-1zM6 7h3v1h-3zM6 8h1v2h-1zM9 8h1v2h-1zM6 10h3v1h-3zM3 11h1v1h-1zM12 11h1v1h-1zM3 12h2v1h-2zM11 12h2v1h-2zM4 13h8v1h-8z',
  etf: 'M4 2h8v1h-8zM3 3h2v1h-2zM7 3h1v5h-1zM11 3h2v1h-2zM3 4h1v1h-1zM12 4h1v1h-1zM2 5h1v6h-1zM13 5h1v3h-1zM7 8h7v1h-7zM13 9h1v2h-1zM3 11h1v1h-1zM12 11h1v1h-1zM3 12h2v1h-2zM11 12h2v1h-2zM4 13h8v1h-8z',
  groceries: 'M6 3h4v1h-4zM5 4h1v2h-1zM10 4h1v2h-1zM2 6h12v1h-12zM2 7h1v6h-1zM13 7h1v6h-1zM2 13h12v1h-12z',
  settings: 'M7 1h2v2h-2zM2 2h2v2h-2zM12 2h2v2h-2zM6 3h4v1h-4zM4 4h2v1h-2zM10 4h2v1h-2zM4 5h1v1h-1zM11 5h1v1h-1zM3 6h1v1h-1zM6 6h4v1h-4zM12 6h1v1h-1zM1 7h3v2h-3zM6 7h1v2h-1zM9 7h1v2h-1zM12 7h3v2h-3zM3 9h1v1h-1zM6 9h4v1h-4zM12 9h1v1h-1zM4 10h1v1h-1zM11 10h1v1h-1zM4 11h2v1h-2zM10 11h2v1h-2zM2 12h2v2h-2zM6 12h4v1h-4zM12 12h2v2h-2zM7 13h2v2h-2z',
} as const;
export type IconName = keyof typeof PATHS;

/** `<app-icon name="calendar">`: 16px pixel icon, inherits currentColor. Sizes snap to a multiple of 16 so pixels stay sharp. */
@Component({
  selector: 'app-icon',
  template: `<svg [attr.width]="px()" [attr.height]="px()" viewBox="0 0 16 16" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true"><path [attr.d]="d()" /></svg>`,
  styles: `:host { display: inline-flex; flex: none; } svg { display: block; }`,
})
export class Icon {
  name = input.required<IconName>();
  size = input(16);
  protected px = computed(() => Math.max(16, Math.round(this.size() / 16) * 16));
  protected d = computed(() => PATHS[this.name()]);
}
