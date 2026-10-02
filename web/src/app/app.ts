import { Component, effect, HostListener, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { dayLabel } from './format';
import { Icon, IconName } from './ui/icons';
import { hidden, togglePrivacy } from './ui/privacy';
import { Refresh } from './ui/refresh';
import { Toasts } from './ui/toast';

const NAV: { label: string; items: { path: string; label: string; icon: IconName }[] }[] = [
  { label: 'Overview', items: [{ path: 'month', label: 'Month', icon: 'calendar' }, { path: 'history', label: 'History', icon: 'history' }] },
  {
    label: 'Money',
    items: [
      { path: 'records', label: 'Records', icon: 'list' }, { path: 'budget', label: 'Budget', icon: 'sliders' },
      { path: 'actuals', label: 'Core actuals', icon: 'wallet' }, { path: 'investing', label: 'Investing', icon: 'trend' },
    ],
  },
  { label: 'Food', items: [{ path: 'meals', label: 'Meals', icon: 'utensils' }, { path: 'groceries', label: 'Groceries', icon: 'cart' }] },
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
  protected drawer = signal(false);
  protected hidden = hidden;
  protected togglePrivacy = togglePrivacy;
  protected dayLabel = dayLabel;

  constructor() {
    inject(Router).events.subscribe(() => this.drawer.set(false));
    effect(() => {
      document.body.classList.toggle('privacy', this.hidden());
    });
  }

  @HostListener('window:keydown', ['$event'])
  handleKeydown(event: KeyboardEvent) {
    if (event.shiftKey && event.code === 'KeyH') {
      const target = event.target as any;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target?.contentEditable === 'true') {
        return;
      }
      event.preventDefault();
      this.togglePrivacy();
    }
  }
}
