import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Refresh } from './refresh';

describe('Refresh', () => {
  let refresh: Refresh;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    refresh = TestBed.inject(Refresh);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('blocks sync until metadata confirms non-demo mode', async () => {
    await refresh.fetchWallet();
    http.expectNone('/api/sync');

    refresh.demo.set(false);
    const syncing = refresh.fetchWallet();
    const request = http.expectOne('/api/sync');
    expect(request.request.method).toBe('POST');
    request.flush({ inserted: 0 });
    await syncing;
  });
});
