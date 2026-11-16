import { Component, computed, effect, ElementRef, HostListener, inject, resource, signal, viewChild } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { dayLabel, fmt } from './format';
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
  { label: 'Insights', items: [{ path: 'networth', label: 'Net worth', icon: 'networth' }, { path: 'year', label: 'Year', icon: 'calendar' }] },
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
  private count = (url: string) => firstValueFrom(this.http.get<unknown[] | { items: unknown[] }>(url)).then((l) => (Array.isArray(l) ? l : l.items).length, () => 0);
  protected inbox = resource({
    params: () => this.refresh.tick(),
    loader: async () => (await Promise.all([this.count('/api/possible-duplicates'), this.count('/api/unclassified'), this.count('/api/cash-topups')])).reduce((n, c) => n + c, 0),
  });
  protected narrow = narrow;
  protected menuOpen = signal(false);
  /** Top bar title on the narrow shell; empty (brand shown) for pages outside the menu. */
  protected title = signal('');
  /** Pull-to-refresh distance in px, 0 when idle. */
  protected pull = signal(0);
  private pullY: number | null = null;
  private dialog = viewChild<ElementRef<HTMLDialogElement>>('navDialog');
  private moreBtn = viewChild<ElementRef<HTMLButtonElement>>('moreBtn');
  protected ready = signal(false);
  protected hidden = hidden;
  protected backgrounded = signal(document.visibilityState === 'hidden');
  private hiddenAt = 0;
  protected togglePrivacy = togglePrivacy;
  protected theme = theme;
  protected cycleTheme = cycleTheme;
  protected themeIcon = { light: 'sun', dark: 'moon' } as const;
  protected themeLabel = themeLabel;
  protected dayLabel = dayLabel;
  protected accounts = resource({ params: () => this.refresh.tick(), loader: () => this.api.accounts() });
  protected shown = computed(() => (this.accounts.value() ?? []).filter((a) => !a.id.startsWith('local:') && a.balanceCents !== null));
  protected total = computed(() => this.shown().filter((a) => a.currency === 'EUR').reduce((s, a) => s + a.balanceCents!, 0));
  protected fmt = fmt;
  protected foreign = (cents: number, cur: string) => (hidden() ? '••••' : new Intl.NumberFormat('en-GB', { style: 'currency', currency: cur }).format(cents / 100));
  protected meta = resource({ params: () => this.refresh.tick(), loader: () => this.api.meta() });

  constructor() {
    const router = inject(Router);
    const labels = new Map(NAV.flatMap((g) => g.items.map((i) => [i.path, i.label] as const)));
    router.events.subscribe((e) => {
      this.closeMenu();
      if (e instanceof NavigationEnd) this.title.set(labels.get(e.urlAfterRedirects.split(/[/?#]/)[1]) ?? '');
    });
    effect(() => {
      document.documentElement.classList.toggle('has-tabbar', this.narrow());
    });
    effect(() => {
      document.body.classList.toggle('privacy', this.hidden() || this.backgrounded());
    });
    effect(() => {
      if (!('setAppBadge' in navigator)) return;
      const n = this.inbox.value() ?? 0;
      const badge = n > 0 ? navigator.setAppBadge(n) : navigator.clearAppBadge();
      // iOS rejects without notification permission; nothing to recover.
      badge.catch(() => {});
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

  @HostListener('document:visibilitychange')
  onVisibilityChange() {
    const away = document.visibilityState === 'hidden';
    this.backgrounded.set(away);
    if (away) return void (this.hiddenAt = Date.now());
    // the server syncs hourly on its own; an installed app resumed later would keep showing what it loaded before
    if (this.hiddenAt && Date.now() - this.hiddenAt > 5 * 60_000) {
      this.api.clearCache();
      this.refresh.tick.update((n) => n + 1);
    }
  }

  // Pull to refresh: the browser's own gesture is off (overscroll-behavior) and would reload the whole app.
  @HostListener('document:touchstart', ['$event'])
  onTouchStart(e: TouchEvent) {
    let el = e.target as HTMLElement | null;
    let free = this.narrow() && window.scrollY <= 0 && !document.querySelector('dialog[open]');
    for (; free && el; el = el.parentElement) free = el.scrollTop <= 0 && !el.hasAttribute('popover') && !el.classList.contains('pop');
    this.pullY = free ? e.touches[0].clientY : null;
  }

  @HostListener('document:touchmove', ['$event'])
  onTouchMove(e: TouchEvent) {
    if (this.pullY === null) return;
    if (window.scrollY > 0) return this.endPull(false);
    this.pull.set(Math.max(0, Math.min((e.touches[0].clientY - this.pullY) / 2, 80)));
  }

  @HostListener('document:touchend')
  @HostListener('document:touchcancel')
  onTouchEnd() {
    this.endPull(this.pull() >= 60);
  }

  private endPull(go: boolean) {
    this.pullY = null;
    this.pull.set(0);
    if (!go) return;
    navigator.vibrate?.(10);
    if (this.refresh.walletAvailable()) return void this.refresh.fetchWallet();
    this.api.clearCache();
    this.refresh.tick.update((n) => n + 1);
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
