import { HttpErrorResponse, HttpHeaders, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Access, accessInterceptor } from './access';
import { Api } from './api';

describe('API access failures', () => {
  let access: Access;
  let api: Api;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([accessInterceptor])), provideHttpClientTesting()],
    });
    access = TestBed.inject(Access);
    api = TestBed.inject(Api);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('presents expired sessions for 401 and stale HTML auth redirects', async () => {
    const unauthorized = api.meta().catch(() => undefined);
    http.expectOne('/api/meta').flush({ error: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });
    await unauthorized;
    expect(access.problem()).toBe('session');

    access.problem.set(null);
    access.report(new HttpErrorResponse({
      status: 403,
      error: '<!doctype html><title>Sign in</title>',
      headers: new HttpHeaders({ 'content-type': 'text/html' }),
    }));
    expect(access.problem()).toBe('session');
  });

  it('keeps validation 403 errors out of session handling', async () => {
    const request = api.saveConfig({} as never).catch(() => undefined);
    http.expectOne('/api/config').flush({ error: 'Invalid config' }, { status: 403, statusText: 'Forbidden' });
    await request;
    expect(access.problem()).toBeNull();
  });
});
