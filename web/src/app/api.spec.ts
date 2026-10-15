import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Api } from './api';
import { config } from './testing/fixtures';

describe('Api cache', () => {
  let api: Api;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(Api);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('shares concurrent calls and reuses the value', async () => {
    const [a, b] = [api.config(), api.config()];
    http.expectOne('/api/config').flush(config());
    await Promise.all([a, b]);
    await api.config();
    http.expectNone('/api/config');
  });

  it('returns clones', async () => {
    const a = api.config();
    http.expectOne('/api/config').flush(config());
    (await a).wallet.groups.length = 0;
    expect((await api.config()).wallet.groups.length).toBeGreaterThan(0);
  });

  it('a mutation invalidates', async () => {
    const a = api.meta();
    http.expectOne('/api/meta').flush({});
    await a;
    const w = api.sync();
    http.expectOne('/api/sync').flush({});
    await w;
    const b = api.meta();
    http.expectOne('/api/meta').flush({});
    await b;
  });
});
