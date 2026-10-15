import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Api } from './api';

// Fake matchMedia installed before viewport.ts is first imported (via ./app below).
const listeners: ((e: { matches: boolean }) => void)[] = [];
window.matchMedia = ((q: string) => ({
  matches: false, media: q,
  addEventListener: (_: string, l: (e: { matches: boolean }) => void) => listeners.push(l),
})) as unknown as typeof window.matchMedia;
const isNarrow = { set: (v: boolean) => listeners.forEach((l) => l({ matches: v })) };

async function setup(narrow: boolean, inbox = 0) {
  const { App } = await import('./app');
  isNarrow.set(narrow);
  TestBed.configureTestingModule({
    imports: [App],
    providers: [
      provideRouter([{ path: 'month', children: [] }, { path: 'records', children: [] }]),
      provideHttpClient(), provideHttpClientTesting(),
      { provide: Api, useValue: { meta: async () => ({ groups: [], excludedGroups: [], accounts: [], months: [], demo: false }) } },
    ],
  });
  const fixture = TestBed.createComponent(App);
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  http.match('/api/possible-duplicates').forEach((r) => r.flush(Array(inbox).fill({})));
  http.match('/api/unclassified').forEach((r) => r.flush([]));
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('narrow navigation', () => {
  beforeEach(() => {
    const p = HTMLDialogElement.prototype;
    p.showModal = function () { this.setAttribute('open', ''); };
    p.close = function () { this.removeAttribute('open'); this.dispatchEvent(new Event('close')); };
  });

  it('renders the tab bar only when narrow', async () => {
    const f = await setup(true);
    const tabs = f.nativeElement.querySelectorAll('nav.tabbar > *');
    expect([...tabs].map((t: HTMLElement) => t.textContent!.trim())).toEqual(['Month', 'Records', 'Inbox', 'More']);
    expect(f.nativeElement.querySelector('aside.side')).toBeNull();
  });

  it('has no tab bar on desktop', async () => {
    const f = await setup(false);
    expect(f.nativeElement.querySelector('.tabbar')).toBeNull();
    expect(f.nativeElement.querySelector('aside.side nav')).toBeTruthy();
  });

  it('shows the inbox badge when count > 0', async () => {
    const f = await setup(true, 3);
    expect(f.nativeElement.querySelector('.tabbar .badge')?.textContent).toBe('3');
  });

  it('opens and closes the menu, closes on route change, returns focus', async () => {
    const f = await setup(true);
    const el: HTMLElement = f.nativeElement;
    const dialog = el.querySelector('dialog')!;
    const more = el.querySelector('.tabbar button') as HTMLButtonElement;
    more.click();
    f.detectChanges();
    expect(dialog.open).toBe(true);
    expect(more.getAttribute('aria-expanded')).toBe('true');
    (el.querySelector('[aria-label="Close menu"]') as HTMLButtonElement).click();
    f.detectChanges();
    expect(dialog.open).toBe(false);
    expect(more.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(more);

    more.click();
    await TestBed.inject(Router).navigateByUrl('/records');
    f.detectChanges();
    expect(dialog.open).toBe(false);
  });
});
