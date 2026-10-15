import { createEnvironmentInjector, EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import type { SyncJob } from '../../../../shared/src/sync-job.ts';
import { Api } from '../api';
import { Refresh } from './refresh';
import { Toast } from './toast';

describe('Refresh lifecycle', () => {
  it('does not restart polling when an in-flight start finishes after destruction', async () => {
    vi.useFakeTimers();
    let resolve!: (job: SyncJob) => void;
    const syncStatus = vi.fn();
    const api = {
      sync: () => new Promise<SyncJob>((done) => { resolve = done; }),
      syncStatus,
    };
    const parent = TestBed.inject(EnvironmentInjector);
    const injector = createEnvironmentInjector([
      Refresh,
      { provide: Api, useValue: api },
      { provide: Toast, useValue: { show: vi.fn() } },
    ], parent);
    const refresh = injector.get(Refresh);
    refresh.demo.set(false);

    const started = refresh.fetchWallet();
    expect(refresh.syncing()).toBe(true);
    injector.destroy();
    resolve({ status: 'running', inserted: 0, updated: 0, deleted: 0 });
    await started;
    await vi.advanceTimersByTimeAsync(2000);

    expect(refresh.syncing()).toBe(false);
    expect(syncStatus).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
