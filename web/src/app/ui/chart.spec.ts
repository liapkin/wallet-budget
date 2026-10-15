import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import * as echarts from 'echarts/core';
import { ChartView } from './chart';

// jsdom has no canvas.
vi.mock('echarts/core', () => ({
  use() {}, registerTheme: vi.fn(), init: vi.fn(),
}));

let trigger: () => void;
const disconnect = vi.fn();
class FakeRO {
  constructor(cb: () => void) { trigger = cb; }
  observe() {}
  disconnect = disconnect;
}

@Component({ imports: [ChartView], template: `<app-chart [option]="opt()" />` })
class Host { opt = signal({ series: [{ type: 'pie', data: [{ name: 'a', value: 1 }] }] }); }

describe('ChartView resize', () => {
  let width: number;
  let inst: { setOption: any; resize: any; dispose: any };

  beforeEach(() => {
    width = 600;
    vi.stubGlobal('ResizeObserver', FakeRO);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => width);
    disconnect.mockClear();
    vi.mocked(echarts.registerTheme).mockClear();
    vi.mocked(echarts.init).mockReset().mockImplementation(() => (inst = { setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn() }) as any);
  });
  afterEach(() => vi.restoreAllMocks());

  const mount = () => {
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    return f;
  };

  it('disconnects the observer on destroy', () => {
    mount().destroy();
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(inst.dispose).toHaveBeenCalledTimes(1);
  });

  it('re-inits once when crossing 480px, only resizes otherwise', () => {
    mount();
    expect(echarts.init).toHaveBeenCalledTimes(1);
    const first = inst;
    width = 500;
    trigger();
    expect(first.resize).toHaveBeenCalledTimes(1);
    expect(echarts.init).toHaveBeenCalledTimes(1);

    width = 400;
    trigger();
    expect(first.dispose).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(echarts.init).toHaveBeenCalledTimes(2);
    expect(vi.mocked(echarts.registerTheme).mock.calls.at(-1)![1]).toMatchObject({ legend: { left: 0 } });
    expect(inst.setOption).toHaveBeenCalledTimes(1);
    expect((inst.setOption.mock.calls[0][0] as any).legend.bottom).toBe(0);
  });

  it('does not re-init again at the same width', () => {
    mount();
    width = 400;
    trigger();
    trigger();
    trigger();
    expect(echarts.init).toHaveBeenCalledTimes(2);
    expect(inst.resize).toHaveBeenCalledTimes(2);
  });
});
