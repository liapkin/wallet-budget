import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { Combo } from './combo';

describe('Combo menu placement', () => {
  it('positions and caps the menu when opened, and drops listeners on close', async () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const f = TestBed.createComponent(Combo);
    f.componentRef.setInput('options', [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]);
    f.detectChanges();
    const trigger = f.nativeElement.querySelector('.trigger') as HTMLButtonElement;
    trigger.click();
    f.detectChanges();
    await f.whenStable();
    const pop = f.nativeElement.querySelector('.pop') as HTMLElement;
    expect(pop.style.top).toMatch(/px$/);
    expect(pop.style.left).toMatch(/px$/);
    expect((f.nativeElement.querySelector('.list') as HTMLElement).style.maxHeight).toMatch(/px$/);
    expect(add.mock.calls.some(([t]) => t === 'resize')).toBe(true);

    trigger.click();
    f.detectChanges();
    await f.whenStable();
    expect(f.nativeElement.querySelector('.pop')).toBeNull();
    expect(remove.mock.calls.some(([t]) => t === 'resize')).toBe(true);
    add.mockRestore();
    remove.mockRestore();
  });

  it('stays open when the page scrolls or the viewport changes, and closes on an outside click', async () => {
    const f = TestBed.createComponent(Combo);
    f.componentRef.setInput('options', [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]);
    f.detectChanges();
    document.body.appendChild(f.nativeElement);
    (f.nativeElement.querySelector('.trigger') as HTMLButtonElement).click();
    f.detectChanges();
    await f.whenStable();
    expect(f.nativeElement.querySelector('.pop')).not.toBeNull();

    // opening focuses the search box, which scrolls the page on phones; resize comes from the keyboard
    document.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('resize'));
    f.detectChanges();
    await f.whenStable();
    expect(f.nativeElement.querySelector('.pop')).not.toBeNull();

    document.body.click();
    f.detectChanges();
    await f.whenStable();
    expect(f.nativeElement.querySelector('.pop')).toBeNull();
    f.nativeElement.remove();
  });
});
