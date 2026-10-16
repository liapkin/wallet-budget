import { Component } from '@angular/core';

/** Pip's head on the brand green: [fill, path] layers on a 16x16 grid. */
const MARK = [['var(--accent)', 'M2 8h12v2h-12zM1 10h6v2h-6zM9 10h6v2h-6zM1 12h14v2h-14zM2 14h12v1h-12z'], ['var(--surface-2)', 'M0 0h16v1h-16zM0 1h4v1h-4zM5 1h6v1h-6zM12 1h4v1h-4zM0 2h3v1h-3zM13 2h3v1h-3zM0 3h4v2h-4zM12 3h4v2h-4zM0 5h3v2h-3zM13 5h3v2h-3zM0 7h4v1h-4zM12 7h4v1h-4zM0 8h2v2h-2zM14 8h2v2h-2zM0 10h1v4h-1zM15 10h1v4h-1zM0 14h2v1h-2zM14 14h2v1h-2zM0 15h16v1h-16z'], ['#d9a548', 'M4 1h1v1h-1zM11 1h1v1h-1zM3 2h10v1h-10zM4 3h8v2h-8zM3 5h3v2h-3zM7 5h2v2h-2zM10 5h3v2h-3zM4 7h8v1h-8zM7 10h1v1h-1z'], ['#1e211d', 'M6 5h1v2h-1zM9 5h1v2h-1zM8 10h1v1h-1zM7 11h2v1h-2z']] as const;
/** "Budget" in a 5x7 pixel font on a 35x9 grid: [class, path] layers. */
const WORD = [['a', 'M0 0h4v1h-4zM0 1h1v2h-1zM4 1h1v2h-1zM0 3h4v1h-4zM0 4h1v2h-1zM4 4h1v2h-1zM0 6h4v1h-4z'], ['t', 'M16 0h1v2h-1zM31 1h1v1h-1zM6 2h1v4h-1zM10 2h1v4h-1zM13 2h4v1h-4zM19 2h4v1h-4zM25 2h3v1h-3zM30 2h4v1h-4zM12 3h1v3h-1zM16 3h1v3h-1zM18 3h1v3h-1zM22 3h1v3h-1zM24 3h1v1h-1zM28 3h1v1h-1zM31 3h1v3h-1zM24 4h5v1h-5zM24 5h1v1h-1zM34 5h1v1h-1zM7 6h4v1h-4zM13 6h4v1h-4zM19 6h4v1h-4zM25 6h4v1h-4zM32 6h2v1h-2zM22 7h1v1h-1zM19 8h3v1h-3z']] as const;

/** `<app-brand />`: Pip mark plus pixel wordmark. Each pixel is 2 CSS px so edges stay sharp. */
@Component({
  selector: 'app-brand',
  template: `
    <svg class="mark" viewBox="0 0 16 16" width="32" height="32" shape-rendering="crispEdges" aria-hidden="true">@for (l of mark; track l[0]) {<path [style.fill]="l[0]" [attr.d]="l[1]" />}</svg>
    <svg viewBox="0 0 35 9" width="70" height="18" shape-rendering="crispEdges" aria-hidden="true">@for (l of word; track l[0]) {<path [attr.class]="'p-' + l[0]" [attr.d]="l[1]" />}</svg>`,
  host: { role: 'img', 'aria-label': 'Budget' },
  styles: `
    :host { display: inline-flex; align-items: center; gap: var(--sp-2); }
    svg { display: block; flex: none; }
    .mark { border-radius: var(--r-sm); }
    .p-a { fill: var(--accent); } .p-t { fill: var(--text); }`,
})
export class Brand {
  protected mark = MARK;
  protected word = WORD;
}
