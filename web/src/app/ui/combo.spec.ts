import { TestBed } from '@angular/core/testing';
import { Combo } from './combo';

const open = async (f: ReturnType<typeof TestBed.createComponent<Combo>>) => {
  f.componentRef.setInput('options', [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]);
  f.detectChanges();
  document.body.appendChild(f.nativeElement);
  (f.nativeElement.querySelector('.trigger') as HTMLButtonElement).click();
  f.detectChanges();
  await f.whenStable();
};

describe('Combo menu', () => {
  it('is placed under its trigger and capped to the visible area when opened', async () => {
    const f = TestBed.createComponent(Combo);
    await open(f);
    const pop = f.nativeElement.querySelector('.pop') as HTMLElement;
    expect(pop.style.top).toMatch(/px$/);
    expect(pop.style.left).toMatch(/px$/);
    expect((f.nativeElement.querySelector('.list') as HTMLElement).style.maxHeight).toMatch(/px$/);
    f.nativeElement.remove();
  });

  it('does not track the viewport: keyboard and resize events leave it open and untouched', async () => {
    const f = TestBed.createComponent(Combo);
    await open(f);
    const pop = f.nativeElement.querySelector('.pop') as HTMLElement;
    const before = pop.style.top;
    window.dispatchEvent(new Event('resize'));
    window.visualViewport?.dispatchEvent(new Event('resize'));
    f.detectChanges();
    await f.whenStable();
    expect(f.nativeElement.querySelector('.pop')).not.toBeNull();
    expect(pop.style.top).toBe(before);
    f.nativeElement.remove();
  });

  it('stays open for a small scroll (focus shifts) and closes on an outside click', async () => {
    const f = TestBed.createComponent(Combo);
    await open(f);
    document.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('scroll'));
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
