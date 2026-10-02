import { Component, computed, inject, signal } from '@angular/core';
import type { Currency } from '../../../shared/src/types.ts';
import { Api } from './api';
import { currency } from './format';
import { hidden, togglePrivacy } from './ui/privacy';
import { Refresh } from './ui/refresh';
import { setTheme, theme } from './ui/theme';
import { Toast } from './ui/toast';

@Component({
  selector: 'app-settings',
  template: `
    <div class="page-head"><h1>Settings</h1></div>
    <section class="card">
      <h2>Currency</h2>
      <p>Current database currency: {{ currency() }}</p>
      <label class="field" for="currency">Database currency</label>
      <select id="currency" [value]="selected()" [disabled]="blocked()" (change)="chooseCurrency($event)">
        <option value="EUR">EUR — Euro (€)</option>
        <option value="USD">USD — US dollar ($)</option>
      </select>
      <p class="muted">Choose before adding data. Currency locks after records, accounts or core actuals are stored. Existing EUR history stays EUR; demo uses USD. Changing currency never converts amounts. Wallet is available only for EUR.</p>
      @if (refresh.demo() === true) {
        <p class="muted">Demo currency is locked to USD.</p>
      } @else if (refresh.currencyLocked()) {
        <p class="muted">Database currency is locked.</p>
      }
      @if (loading() && !error()) { <p role="status">Loading currency settings…</p> }
      @if (error()) { <p class="err" role="alert">{{ error() }}</p> }
      <button class="primary" type="button" [disabled]="blocked() || selected() === currency()" (click)="save()">{{ saving() ? 'Saving…' : 'Save currency' }}</button>
    </section>
    <section class="card">
      <h2>Appearance</h2>
      <label class="field" for="theme">Theme</label>
      <select id="theme" [value]="theme()" (change)="chooseTheme($event)">
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
      <p class="muted">Applies immediately on this browser. Shift+T also switches theme.</p>
      <label class="switch"><input type="checkbox" [checked]="hidden()" (change)="togglePrivacy()" /> Hide amounts</label>
      <p class="muted">Applies immediately on this browser. Shift+H also toggles hidden amounts.</p>
    </section>
  `,
})
export class Settings {
  private api = inject(Api);
  private toast = inject(Toast);
  protected refresh = inject(Refresh);
  protected currency = currency;
  protected theme = theme;
  protected hidden = hidden;
  protected togglePrivacy = togglePrivacy;
  protected selected = signal<Currency>(currency());
  protected loading = signal(true);
  protected saving = signal(false);
  protected error = signal('');
  protected blocked = computed(() => this.loading() || this.saving() || this.refresh.currencyLocked() || this.refresh.demo() !== false);

  constructor() {
    this.api.config().then(
      (config) => { this.selected.set(config.currency ?? 'EUR'); this.loading.set(false); },
      () => this.error.set('Failed to load currency settings. Reload to retry.'),
    );
  }

  protected chooseCurrency(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    if (!this.blocked() && (value === 'EUR' || value === 'USD')) this.selected.set(value);
  }

  protected chooseTheme(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    if (value === 'light' || value === 'dark') setTheme(value);
  }

  protected async save() {
    if (this.blocked() || this.selected() === currency()) return;
    this.saving.set(true);
    this.error.set('');
    try {
      const config = await this.api.config();
      const saved = await this.api.saveConfig({ ...config, currency: this.selected() });
      currency.set(saved.currency ?? 'EUR');
      this.selected.set(currency());
      this.refresh.tick.update((n) => n + 1);
      this.toast.show('Currency saved');
    } catch (e: any) {
      this.error.set(e?.error?.error ?? 'Save failed. Your currency choice has not been applied.');
    } finally {
      this.saving.set(false);
    }
  }
}
