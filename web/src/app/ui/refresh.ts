import { computed, DestroyRef, Injectable, inject, signal } from '@angular/core';
import type { SyncJob } from '../../../../shared/src/sync-job.ts';
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
  private pollTimer: ReturnType<typeof setTimeout> | undefined;
  private pollGeneration = 0;
  private resumeChecked = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.cancelPolling();
      this.syncing.set(false);
    });
  }

  applyMeta(meta: Meta) {
    currency.set(meta.currency === 'USD' ? 'USD' : 'EUR');
    this.currencyLocked.set(meta.currencyLocked !== false);
    this.demo.set(meta.demo === true);
    if (!this.walletAvailable()) {
      this.cancelPolling();
      this.syncing.set(false);
    }
  }

  bump() {
    this.api.clearCache();
    this.tick.update((n) => n + 1);
    this.lastFetch.set(new Date());
  }

  async fetchWallet() {
    if (!this.walletAvailable() || this.syncing()) return;
    this.cancelPolling();
    const generation = this.pollGeneration;
    this.syncing.set(true);
    try {
      const job = await this.api.sync();
      if (generation === this.pollGeneration) this.accept(job, true);
    } catch (e: any) {
      if (generation !== this.pollGeneration) return;
      this.toast.show(e?.error?.error ?? 'Sync failed', 'err');
      this.syncing.set(false);
    }
  }

  /** Check once after app metadata loads, then continue any server-side job. */
  async resumeWalletSync() {
    if (!this.walletAvailable() || this.resumeChecked) return;
    this.resumeChecked = true;
    const generation = this.pollGeneration;
    try {
      const job = await this.api.syncStatus();
      if (generation === this.pollGeneration && job.status === 'running') {
        this.syncing.set(true);
        this.schedulePoll();
      }
    } catch (e: any) {
      if (generation !== this.pollGeneration) return;
      this.toast.show(e?.error?.error ?? 'Sync status unavailable', 'err');
    }
  }

  private accept(job: SyncJob, notify: boolean) {
    if (job.status === 'running') {
      this.schedulePoll();
      return;
    }
    this.cancelPolling();
    this.syncing.set(false);
    if (!notify || job.status === 'idle') return;
    if (job.status === 'failed') {
      this.toast.show(job.error ?? 'Sync failed', 'err');
      return;
    }
    this.toast.show(`${job.inserted} new, ${job.updated} updated, ${job.deleted} removed`);
    this.bump();
  }

  private schedulePoll() {
    const generation = ++this.pollGeneration;
    clearTimeout(this.pollTimer);
    this.pollTimer = setTimeout(() => void this.poll(generation), 1000);
  }

  private async poll(generation: number) {
    try {
      const job = await this.api.syncStatus();
      if (generation === this.pollGeneration) this.accept(job, true);
    } catch (e: any) {
      if (generation !== this.pollGeneration) return;
      this.cancelPolling();
      this.syncing.set(false);
      this.toast.show(e?.error?.error ?? 'Sync status unavailable', 'err');
    }
  }

  private cancelPolling() {
    this.pollGeneration++;
    clearTimeout(this.pollTimer);
    this.pollTimer = undefined;
  }
}
