import { Injectable, inject, signal } from '@angular/core';
import { Api } from '../api';
import { Toast } from './toast';

/** Screens read `refresh()` inside effect/resource params to reload after a Wallet fetch. */
@Injectable({ providedIn: 'root' })
export class Refresh {
  readonly tick = signal(0);
  readonly lastFetch = signal<Date | null>(null);
  readonly syncing = signal(false);
  private api = inject(Api);
  private toast = inject(Toast);

  bump() {
    this.tick.update((n) => n + 1);
    this.lastFetch.set(new Date());
  }

  async fetchWallet() {
    this.syncing.set(true);
    try {
      const r = await this.api.sync();
      this.toast.show(`${r.inserted} new records`);
      this.bump();
    } catch (e: any) {
      this.toast.show(e?.error?.error ?? 'Sync failed', 'err');
    } finally {
      this.syncing.set(false);
    }
  }
}
