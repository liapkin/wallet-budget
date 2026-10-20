import { Component, effect, ElementRef, HostListener, inject, resource, signal, viewChild } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { dayLabel } from './format';
import { Api } from './api';
import { Brand } from './ui/brand';
import { Icon, IconName } from './ui/icons';
import { Pip } from './ui/pip';
import { hidden, togglePrivacy } from './ui/privacy';
import { cycleTheme, theme, themeLabel } from './ui/theme';
import { Refresh } from './ui/refresh';
import { Toasts } from './ui/toast';
import { Access } from './access';
import { narrow } from './ui/viewport';

const NAV: { label: string; items: { path: string; label: string; icon: IconName; badge?: boolean }[] }[] = [
  { label: 'Overview', items: [{ path: 'month', label: 'Month', icon: 'calendar' }, { path: 'history', label: 'History', icon: 'history' }, { path: 'inbox', label: 'Inbox', icon: 'inbox', badge: true }] },
  {
    label: 'Money',
    items: [
      { path: 'records', label: 'Records', icon: 'list' }, { path: 'budget', label: 'Budget', icon: 'sliders' },
      { path: 'actuals', label: 'Core actuals', icon: 'wallet' }, { path: 'investing', label: 'Investing', icon: 'trend' },
      { path: 'goals', label: 'Goals', icon: 'goals' }, { path: 'crypto', label: 'Crypto', icon: 'coin' }, { path: 'etfs', label: 'ETFs', icon: 'etf' },
    ],
  },
  { label: 'Insights', items: [{ path: 'recurring', label: 'Recurring', icon: 'repeat' }, { path: 'networth', label: 'Net worth', icon: 'networth' }, { path: 'year', label: 'Year', icon: 'calendar' }] },
  { label: 'Food', items: [{ path: 'meals', label: 'Meals', icon: 'utensils' }, { path: 'groceries', label: 'Groceries', icon: 'groceries' }] },
  { label: 'Health', items: [{ path: 'habits', label: 'Habits', icon: 'check' }] },
  { label: 'App', items: [{ path: 'settings', label: 'Settings', icon: 'settings' }] },
];

@Component({
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NgTemplateOutlet, Brand, Icon, Pip, Toasts],
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected nav = NAV;
  protected refresh = inject(Refresh);
  protected access = inject(Access);
  private api = inject(Api);
  private http = inject(HttpClient);
  /** Badge is decorative: a failed count shows nothing rather than an error. */
  private count = (url: string) => firstValueFrom(this.http.get<unknown[]>(url)).then((l) => l.length, () => 0);
  protected inbox = resource({
    params: () => this.refresh.tick(),
    loader: async () => (await Promise.all([this.count('/api/possible-duplicates'), this.count('/api/unclassified')])).reduce((n, c) => n + c, 0),
  });
  protected narrow = narrow;
  protected menuOpen = signal(false);
  private dialog = viewChild<ElementRef<HTMLDialogElement>>('navDialog');
  private moreBtn = viewChild<ElementRef<HTMLButtonElement>>('moreBtn');
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
    inject(Router).events.subscribe(() => this.closeMenu());
    effect(() => {
      document.documentElement.classList.toggle('has-tabbar', this.narrow());
    });
    effect(() => {
      document.body.classList.toggle('privacy', this.hidden());
    });
    effect(() => {
      if (this.meta.isLoading() || this.meta.error()) {
        this.refresh.demo.set(null);
        this.refresh.currencyLocked.set(true);
      } else if (this.meta.hasValue()) {
        this.refresh.applyMeta(this.meta.value()!);
        void this.refresh.resumeWalletSync();
        this.ready.set(true);
      }
    });
  }

  protected openMenu() {
    this.dialog()?.nativeElement.showModal();
    this.menuOpen.set(true);
  }

  protected closeMenu() {
    const d = this.dialog()?.nativeElement;
    if (d?.open) d.close();
    this.onMenuClosed();
  }

  /** Native Escape/close also lands here, keeping the signal in sync. */
  protected onMenuClosed() {
    if (!this.menuOpen()) return;
    this.menuOpen.set(false);
    this.moreBtn()?.nativeElement.focus();
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
