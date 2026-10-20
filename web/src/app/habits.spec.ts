import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { athensDay } from '../../../shared/src/month.ts';
import { config, mount } from './testing/fixtures';
import { HabitsComponent } from './habits';

const habits = [{ id: 'read', name: 'Read', time: '22:00' }, { id: 'stretch', name: 'Stretch', time: '07:30', note: 'Hamstrings' }];
const today = athensDay();
const open = (log: { day: string; habit: string }[] = [], key: string | null = null) =>
  mount(HabitsComponent, { '/api/config': { ...config(), habits }, '/api/habits': log, '/api/push/key': { key } });
Object.assign(window, { Notification: { permission: 'default' }, PushManager: class {} });
Object.defineProperty(navigator, 'serviceWorker', { value: { getRegistration: async () => undefined }, configurable: true });
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('Habits', () => {
  it('lists today sorted by time with ticks and streak', async () => {
    const el = await open([{ day: today, habit: 'stretch' }]);
    const names = [...el.querySelectorAll('section:first-of-type .row strong')].map((e) => e.textContent);
    expect(names).toEqual(['Stretch', 'Read']);
    expect(el.querySelector('button[aria-label="Stretch"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelector('button[aria-label="Read"]')!.getAttribute('aria-pressed')).toBe('false');
    expect(el.textContent).toContain('Streak 1');
    expect(el.textContent).not.toContain('Enable notifications');
  });

  it('tick sends PUT then DELETE', async () => {
    const el = await open();
    const http = TestBed.inject(HttpTestingController);
    const btn = el.querySelector<HTMLButtonElement>('button[aria-label="Read"]')!;
    btn.click();
    http.expectOne({ method: 'PUT', url: `/api/habits/${today}/read` }).flush(null);
    await tick();
    TestBed.tick();
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    btn.click();
    http.expectOne({ method: 'DELETE', url: `/api/habits/${today}/read` }).flush(null);
  });

  it('shows the empty state with no habits', async () => {
    const el = await mount(HabitsComponent, { '/api/config': { ...config(), habits: [] }, '/api/habits': [], '/api/push/key': { key: null } });
    expect(el.textContent).toContain('No habits yet');
  });

  it('offers notifications only when a key exists', async () => {
    const el = await open([], 'AAAA');
    expect(el.textContent).toContain('Enable notifications');
  });
});
