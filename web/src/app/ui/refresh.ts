import { Injectable, signal } from '@angular/core';

/** Screens read `refresh()` inside effect/resource params to reload after a Wallet fetch. */
@Injectable({ providedIn: 'root' })
export class Refresh {
  readonly tick = signal(0);
  readonly lastFetch = signal<Date | null>(null);
  readonly syncing = signal(false);
  bump() {
    this.tick.update((n) => n + 1);
    this.lastFetch.set(new Date());
  }
}
