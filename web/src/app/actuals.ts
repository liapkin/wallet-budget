import { Component, computed, inject, resource, signal } from '@angular/core';
import { fmt, toCents } from '../../../shared/src/money.ts';
import { athensMonth } from '../../../shared/src/month.ts';
import { Api, type Actuals as Typed } from './api';

@Component({
  selector: 'app-actuals',
  template: `
    <h1>Core actuals</h1>
    <p class="muted">Cells marked W are read from Wallet. Type cash on top in the small box.</p>
    @if (error()) {
      <p class="err">{{ error() }}</p>
    }
    @if (cfg.value(); as cfg) {
      <div class="scroll">
        <table>
          <thead>
            <tr>
              <th>Month</th>
              @for (l of cfg.coreExpenses; track l.key) {
                <th class="num">{{ l.label }}</th>
              }
            </tr>
          </thead>
          <tbody>
            @for (m of months(); track m) {
              <tr>
                <td>{{ m }}</td>
                @for (l of cfg.coreExpenses; track l.key) {
                  <td class="num" [class.walletcell]="wallet(l.source)">
                    @if (wallet(l.source)) {
                      <span class="badge">W</span> {{ fmt(walletSum(l.source, m)) }}
                      <input class="cell" placeholder="+ cash" [value]="eur(typed()[m]?.[l.key])" (change)="save(m, l.key, $event)" />
                    } @else {
                      <input class="cell" [value]="eur(typed()[m]?.[l.key])" (change)="save(m, l.key, $event)" />
                    }
                  </td>
                }
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class Actuals {
  protected fmt = fmt;
  private api = inject(Api);
  protected cfg = resource({ loader: () => this.api.config() });
  private summary = resource({ loader: () => this.api.summary() });
  protected typed = signal<Typed>({});
  protected error = signal('');

  constructor() {
    this.api.actuals().then((a) => this.typed.set(a));
  }

  protected months = computed(() => {
    const now = athensMonth(new Date().toISOString());
    return [...new Set([now, ...Object.keys(this.summary.value()?.spend ?? {}), ...Object.keys(this.typed())])].sort().reverse();
  });

  protected wallet = (src: string) => src.startsWith('wallet:');
  protected walletSum = (src: string, m: string) =>
    src.slice(7).split('+').reduce((s, g) => s + (this.summary.value()?.spend[m]?.[g]?.cents ?? 0), 0);
  protected eur = (c?: number) => (c === undefined ? '' : String(c / 100));

  protected async save(m: string, key: string, e: Event) {
    const raw = (e.target as HTMLInputElement).value.trim().replace(',', '.');
    const n = Number(raw);
    if (raw !== '' && !Number.isFinite(n)) return void this.error.set('Not a number: ' + raw);
    const cents = raw === '' ? null : toCents(n);
    try {
      await this.api.setActual(m, key, cents);
      this.error.set('');
      this.typed.update((t) => {
        const row = { ...t[m] };
        if (cents === null) delete row[key];
        else row[key] = cents;
        return { ...t, [m]: row };
      });
    } catch (err: any) {
      this.error.set(err?.error?.error ?? 'Save failed');
    }
  }
}
