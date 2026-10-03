import { Component, effect, HostListener, inject, resource, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { dayLabel } from './format';
import { Api } from './api';
import { Icon, IconName } from './ui/icons';
import { hidden, togglePrivacy } from './ui/privacy';
import { cycleTheme, theme, themeLabel } from './ui/theme';
import { Refresh } from './ui/refresh';
import { Toasts } from './ui/toast';

const NAV: { label: string; items: { path: string; label: string; icon: IconName; badge?: boolean }[] }[] = [
  { label: 'Overview', items: [{ path: 'month', label: 'Month', icon: 'calendar' }, { path: 'history', label: 'History', icon: 'history' }, { path: 'inbox', label: 'Inbox', icon: 'inbox', badge: true }] },
  {
    label: 'Money',
    items: [
      { path: 'records', label: 'Records', icon: 'list' }, { path: 'budget', label: 'Budget', icon: 'sliders' },
      { path: 'actuals', label: 'Core actuals', icon: 'wallet' }, { path: 'investing', label: 'Investing', icon: 'trend' },
    ],
  },
  { label: 'Insights', items: [{ path: 'recurring', label: 'Recurring', icon: 'repeat' }, { path: 'networth', label: 'Net worth', icon: 'trend' }, { path: 'year', label: 'Year', icon: 'calendar' }] },
  { label: 'Food', items: [{ path: 'meals', label: 'Meals', icon: 'utensils' }, { path: 'groceries', label: 'Groceries', icon: 'cart' }] },
  { label: 'App', items: [{ path: 'settings', label: 'Settings', icon: 'sliders' }] },
];

@Component({
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon, Toasts],
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected nav = NAV;
  protected refresh = inject(Refresh);
  private api = inject(Api);
  private http = inject(HttpClient);
  /** Badge is decorative: a failed count shows nothing rather than an error. */
  private count = (url: string) => firstValueFrom(this.http.get<unknown[]>(url)).then((l) => l.length, () => 0);
  protected inbox = resource({
    params: () => this.refresh.tick(),
    loader: async () => (await Promise.all([this.count('/api/possible-duplicates'), this.count('/api/unclassified')])).reduce((n, c) => n + c, 0),
  });
  protected drawer = signal(false);
  protected ready = signal(false);
  protected hidden = hidden;
  protected togglePrivacy = togglePrivacy;
  protected theme = theme;
  protected cycleTheme = cycleTheme;
  protected themeIcon = { light: 'sun', dark: 'moon' } as const;
  protected themeLabel = themeLabel;
  protected dayLabel = dayLabel;
  protected meta = resource({ params: () => this.refresh.tick(), loader: () => this.api.meta() });

  constructor() {
    inject(Router).events.subscribe(() => this.drawer.set(false));
    effect(() => {
      document.body.classList.toggle('privacy', this.hidden());
    });
    effect(() => {
      if (this.meta.isLoading() || this.meta.error()) {
        this.refresh.demo.set(null);
        this.refresh.currencyLocked.set(true);
      } else if (this.meta.hasValue()) {
        this.refresh.applyMeta(this.meta.value()!);
        this.ready.set(true);
      }
    });
  }

  @HostListener('window:keydown', ['$event'])
  handleKeydown(event: KeyboardEvent) {
    if (event.shiftKey && (event.code === 'KeyH' || event.code === 'KeyT')) {
      const target = event.target as any;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target?.contentEditable === 'true') {
        return;
      }
      event.preventDefault();
      if (event.code === 'KeyH') this.togglePrivacy();
      else cycleTheme();
    }
  }
}
