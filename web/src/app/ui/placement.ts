interface Box { top: number; bottom: number; left: number; right: number }
interface Size { width: number; height: number }

export interface Placement { top: number; left: number; maxHeight: number; placement: 'below' | 'above' }

const MIN_HEIGHT = 120;

/** Viewport-relative position for a menu next to `anchor`: below if it fits, else the roomier side (scrolling when neither fits). */
export function placeMenu({ anchor, menu, viewport, gap = 4, margin = 8 }: {
  anchor: Box; menu: Size; viewport: Size & { offsetTop?: number; offsetLeft?: number }; gap?: number; margin?: number;
}): Placement {
  const top0 = (viewport.offsetTop ?? 0) + margin;
  const bottom0 = (viewport.offsetTop ?? 0) + viewport.height - margin;
  const left0 = (viewport.offsetLeft ?? 0) + margin;
  const right0 = (viewport.offsetLeft ?? 0) + viewport.width - margin;
  const roomBelow = bottom0 - anchor.bottom - gap;
  const roomAbove = anchor.top - gap - top0;
  const below = menu.height <= roomBelow || (menu.height > roomAbove && roomBelow >= roomAbove);
  const room = Math.max(below ? roomBelow : roomAbove, Math.min(MIN_HEIGHT, viewport.height - 2 * margin));
  const height = Math.min(menu.height, room);
  const top = below ? anchor.bottom + gap : Math.max(top0, anchor.top - gap - height);
  const left = Math.max(left0, Math.min(anchor.left, right0 - menu.width));
  return { top, left, maxHeight: room, placement: below ? 'below' : 'above' };
}
