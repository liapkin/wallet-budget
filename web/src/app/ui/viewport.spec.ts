import { vi } from 'vitest';

type Listener = (e: { matches: boolean }) => void;

function fakeMatchMedia(initial: boolean) {
  const listeners: Listener[] = [];
  window.matchMedia = ((q: string) => ({
    matches: initial, media: q,
    addEventListener: (_: string, l: Listener) => listeners.push(l),
  })) as unknown as typeof window.matchMedia;
  return (matches: boolean) => listeners.forEach((l) => l({ matches }));
}

describe('viewport', () => {
  it('reads the initial match and updates on change', async () => {
    vi.resetModules();
    const fire = fakeMatchMedia(true);
    const { narrow, phone } = await import('./viewport');
    expect(narrow()).toBe(true);
    expect(phone()).toBe(true);
    fire(false);
    expect(narrow()).toBe(false);
    expect(phone()).toBe(false);
  });

  it('defaults to false without matchMedia', async () => {
    vi.resetModules();
    (window as any).matchMedia = undefined;
    const { narrow } = await import('./viewport');
    expect(narrow()).toBe(false);
  });
});
