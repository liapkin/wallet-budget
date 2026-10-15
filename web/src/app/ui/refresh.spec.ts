import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { Refresh } from './refresh';
import { Toast } from './toast';

describe('Refresh', () => {
  let refresh: Refresh;
  let http: HttpTestingController;
  let toast: { show: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    toast = { show: vi.fn() };
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), { provide: Toast, useValue: toast }] });
    refresh = TestBed.inject(Refresh);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    vi.useRealTimers();
    http.verify();
  });

  it('blocks sync until metadata confirms non-demo mode', async () => {
    await refresh.fetchWallet();
    http.expectNone('/api/sync');

    refresh.demo.set(false);
    const syncing = refresh.fetchWallet();
    const request = http.expectOne('/api/sync');
    expect(request.request.method).toBe('POST');
    request.flush({ status: 'succeeded', inserted: 0, updated: 0, deleted: 0 });
    await syncing;
  });

  it('does not POST twice for concurrent clicks', async () => {
    refresh.demo.set(false);
    const first = refresh.fetchWallet();
    const second = refresh.fetchWallet();
    const requests = http.match('/api/sync');
    expect(requests).toHaveLength(1);
    expect(requests[0].request.method).toBe('POST');
    requests[0].flush({ status: 'succeeded', inserted: 0, updated: 0, deleted: 0 });
    await Promise.all([first, second]);
  });

  it('polls a running job to success once and refreshes screens', async () => {
    vi.useFakeTimers();
    refresh.applyMeta({ groups: [], excludedGroups: [], accounts: [], months: [], demo: false, currency: 'EUR' });

    const started = refresh.fetchWallet();
    http.expectOne('/api/sync').flush({ status: 'running', inserted: 0, updated: 0, deleted: 0 });
    await started;
    expect(refresh.syncing()).toBe(true);

    await vi.advanceTimersByTimeAsync(1000);
    http.expectOne('/api/sync').flush({ status: 'succeeded', inserted: 2, updated: 1, deleted: 1 });
    await Promise.resolve();
    expect(refresh.syncing()).toBe(false);
    expect(refresh.tick()).toBe(1);
    expect(toast.show).toHaveBeenCalledWith('2 new, 1 updated, 1 removed');

    await vi.advanceTimersByTimeAsync(2000);
    http.expectNone('/api/sync');
  });

  it('resumes a running server job after reload without another POST', async () => {
    vi.useFakeTimers();
    refresh.applyMeta({ groups: [], excludedGroups: [], accounts: [], months: [], demo: false, currency: 'EUR' });

    const resumed = refresh.resumeWalletSync();
    http.expectOne('/api/sync').flush({ status: 'running', inserted: 1, updated: 0, deleted: 0 });
    await resumed;
    expect(refresh.syncing()).toBe(true);
    http.expectNone((request) => request.method === 'POST');

    await vi.advanceTimersByTimeAsync(1000);
    http.expectOne('/api/sync').flush({ status: 'succeeded', inserted: 1, updated: 0, deleted: 0 });
    await Promise.resolve();
    expect(refresh.syncing()).toBe(false);
    expect(refresh.tick()).toBe(1);
  });

  it('stops polling after status errors and when eligibility is cancelled', async () => {
    vi.useFakeTimers();
    refresh.applyMeta({ groups: [], excludedGroups: [], accounts: [], months: [], demo: false, currency: 'EUR' });

    const started = refresh.fetchWallet();
    http.expectOne('/api/sync').flush({ status: 'running', inserted: 0, updated: 0, deleted: 0 });
    await started;
    await vi.advanceTimersByTimeAsync(1000);
    http.expectOne('/api/sync').flush({ error: 'Unavailable' }, { status: 503, statusText: 'Unavailable' });
    await Promise.resolve();
    expect(refresh.syncing()).toBe(false);
    expect(toast.show).toHaveBeenCalledWith('Unavailable', 'err');
    await vi.advanceTimersByTimeAsync(2000);
    http.expectNone('/api/sync');

    toast.show.mockClear();
    const restarted = refresh.fetchWallet();
    http.expectOne('/api/sync').flush({ status: 'running', inserted: 0, updated: 0, deleted: 0 });
    await restarted;
    refresh.applyMeta({ groups: [], excludedGroups: [], accounts: [], months: [], demo: true, currency: 'EUR' });
    await vi.advanceTimersByTimeAsync(2000);
    http.expectNone('/api/sync');
    expect(refresh.syncing()).toBe(false);
  });
});
