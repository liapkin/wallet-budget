import { placeMenu } from './placement';

const vp = { width: 400, height: 800 };
const at = (top: number, left = 20) => ({ top, bottom: top + 30, left, right: left + 100 });

describe('placeMenu', () => {
  it('opens below when it fits', () => {
    expect(placeMenu({ anchor: at(100), menu: { width: 150, height: 200 }, viewport: vp })).toEqual({ top: 134, left: 20, maxHeight: 658, placement: 'below' });
  });

  it('flips above when there is more room above', () => {
    const p = placeMenu({ anchor: at(600), menu: { width: 150, height: 300 }, viewport: vp });
    expect(p).toMatchObject({ top: 296, placement: 'above' });
  });

  it('limits height and scrolls when neither side fits', () => {
    const p = placeMenu({ anchor: at(150), menu: { width: 150, height: 900 }, viewport: { width: 400, height: 400 } });
    expect(p.placement).toBe('below');
    expect(p.maxHeight).toBe(400 - 8 - 180 - 4);
    const q = placeMenu({ anchor: at(250), menu: { width: 150, height: 900 }, viewport: { width: 400, height: 400 } });
    expect(q).toMatchObject({ placement: 'above', top: 8, maxHeight: 238 });
  });

  it('clamps horizontally at both edges', () => {
    expect(placeMenu({ anchor: at(100, 350), menu: { width: 150, height: 100 }, viewport: vp }).left).toBe(242);
    expect(placeMenu({ anchor: at(100, -30), menu: { width: 150, height: 100 }, viewport: vp }).left).toBe(8);
  });

  it('honours visual viewport offsets', () => {
    const p = placeMenu({ anchor: at(450), menu: { width: 100, height: 100 }, viewport: { width: 400, height: 300, offsetTop: 200, offsetLeft: 50 } });
    expect(p.left).toBe(58);
    expect(p.placement).toBe('above');
  });

  it('keeps a usable height unless the viewport is tiny', () => {
    expect(placeMenu({ anchor: at(20), menu: { width: 100, height: 500 }, viewport: { width: 400, height: 300 } }).maxHeight).toBeGreaterThanOrEqual(120);
    expect(placeMenu({ anchor: at(10), menu: { width: 100, height: 500 }, viewport: { width: 300, height: 100 } }).maxHeight).toBe(84);
  });
});
