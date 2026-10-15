import { afterNextRender, Directive, DestroyRef, ElementRef, inject } from '@angular/core';
import { placeMenu } from './placement';

/** Close a popover on a click or scroll outside `host`. Listeners live until `destroyRef` fires. */
export function closeOnOutside(host: ElementRef<HTMLElement>, isOpen: () => boolean, close: () => void, destroyRef: DestroyRef, opts: { scroll?: boolean } = {}) {
  const scroll = opts.scroll ?? true;
  const outside = (e: Event) => isOpen() && !(e.target instanceof Node && host.nativeElement.contains(e.target)) && close();
  document.addEventListener('click', outside);
  if (scroll) window.addEventListener('scroll', outside, true);
  destroyRef.onDestroy(() => {
    document.removeEventListener('click', outside);
    if (scroll) window.removeEventListener('scroll', outside, true);
  });
}

/** Keeps an absolutely positioned `.popover` inside the visible area: shifts it sideways, flips it above its anchor, or caps its height and scrolls. */
@Directive({ selector: '.popover' })
export class PopoverFit {
  constructor() {
    const el: HTMLElement = inject(ElementRef).nativeElement;
    const fit = () => {
      const anchor = el.parentElement?.getBoundingClientRect();
      if (!anchor) return;
      Object.assign(el.style, { left: '', right: '', top: '', bottom: '', maxHeight: '', overflowY: '' });
      const r = el.getBoundingClientRect();
      const vv = window.visualViewport;
      const p = placeMenu({
        anchor,
        menu: { width: r.width, height: r.height },
        viewport: { width: vv?.width ?? window.innerWidth, height: vv?.height ?? window.innerHeight, offsetTop: vv?.offsetTop, offsetLeft: vv?.offsetLeft },
      });
      el.style.left = `${p.left - anchor.left}px`;
      el.style.right = 'auto';
      if (p.placement === 'above') Object.assign(el.style, { top: 'auto', bottom: 'calc(100% + var(--sp-1))' });
      if (p.maxHeight < r.height) Object.assign(el.style, { maxHeight: `${p.maxHeight}px`, overflowY: 'auto' });
    };
    // fit once when the panel opens; re-fitting on every keyboard/viewport change made it jump on phones
    afterNextRender(fit);
  }
}
