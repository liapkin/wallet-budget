import { signal, Signal } from '@angular/core';

/** Live media-query flag; false where matchMedia is missing (tests, SSR). */
function media(query: string): Signal<boolean> {
  const s = signal(false);
  const mq = window.matchMedia?.(query);
  if (mq) {
    s.set(mq.matches);
    mq.addEventListener('change', (e) => s.set(e.matches));
  }
  return s.asReadonly();
}

export const narrow = media('(max-width: 800px)');
export const phone = media('(max-width: 640px)');
