import { computed, Injectable, inject, signal } from '@angular/core';
import { Api, type Meta } from '../api';
import { currency } from '../format';
import { Toast } from './toast';

/** Screens read `refresh()` inside effect/resource params to reload after a Wallet fetch. */
@Injectable({ providedIn: 'root' })
export class Refresh {
  readonly tick = signal(0);
  readonly lastFetch = signal<Date | null>(null);
  readonly syncing = signal(false);
  /** `null` means metadata has not confirmed a safe mode yet. */
  readonly demo = signal<boolean | null>(null);
  readonly currencyLocked = signal(true);
  readonly walletAvailable = computed(() => this.demo() === false && currency() === 'EUR');
  private api = inject(Api);
  private toast = inject(Toast);

  applyMeta(meta: Meta) {
    currency.set(meta.currency === 'USD' ? 'USD' : 'EUR');
    this.currencyLocked.set(meta.currencyLocked !== false);
    this.demo.set(meta.demo === true);
  }

  bump() {
    this.tick.update((n) => n + 1);
    this.lastFetch.set(new Date());
  }

  async fetchWallet() {
    if (!this.walletAvailable()) return;
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
