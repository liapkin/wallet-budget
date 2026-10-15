import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { App } from './app';
import { Api } from './api';
import { routes } from './app.routes';
import { setTheme, theme } from './ui/theme';
import { Access } from './access';
import { vi } from 'vitest';

describe('App', () => {
  it('should create the app', () => {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting()],
    });
    expect(TestBed.createComponent(App).componentInstance).toBeTruthy();
  });

  it('toggles theme with Shift+T and shows demo mode in both shells', async () => {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: Api, useValue: { meta: async () => ({ groups: [], excludedGroups: [], accounts: [], months: [], demo: true }) } },
      ],
    });
    setTheme('light');
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.match('/api/possible-duplicates').forEach((r) => r.flush([]));
    http.match('/api/unclassified').forEach((r) => r.flush([]));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.accent-soft').length).toBe(2);
    expect(fixture.nativeElement.textContent).not.toContain('Fetch from Wallet');

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyT', shiftKey: true }));
    expect(theme()).toBe('dark');
  });

  it('shows a top-level sign-in action for expired sessions', () => {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const access = TestBed.inject(Access);
    vi.spyOn(access, 'reload').mockImplementation(() => undefined);
    access.problem.set('session');
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const alert = fixture.nativeElement.querySelector('[role="alert"]');
    expect(alert.textContent).toContain('Session expired');
    const button = alert.querySelector('button') as HTMLButtonElement;
    expect(button.textContent).toContain('Reload and sign in');
    button.click();
    expect(access.reload).toHaveBeenCalledOnce();
  });
});
