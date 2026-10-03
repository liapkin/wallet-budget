import type { DestroyRef, ElementRef } from '@angular/core';

/** Close a popover on a click or scroll outside `host`. Listeners live until `destroyRef` fires. */
export function closeOnOutside(host: ElementRef<HTMLElement>, isOpen: () => boolean, close: () => void, destroyRef: DestroyRef) {
  const outside = (e: Event) => isOpen() && !(e.target instanceof Node && host.nativeElement.contains(e.target)) && close();
  document.addEventListener('click', outside);
  window.addEventListener('scroll', outside, true);
  destroyRef.onDestroy(() => {
    document.removeEventListener('click', outside);
    window.removeEventListener('scroll', outside, true);
  });
}
