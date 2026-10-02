import { Component, effect, ElementRef, input, OnDestroy, viewChild } from '@angular/core';
import { hidden } from './privacy.ts';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import { DatasetComponent, GridComponent, LegendComponent, MarkLineComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([BarChart, LineChart, PieChart, GridComponent, TooltipComponent, LegendComponent, DatasetComponent, MarkLineComponent, CanvasRenderer]);

const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

function theme() {
  const text = css('--text'), muted = css('--muted'), grid = css('--border');
  const axis = { axisLine: { lineStyle: { color: grid } }, axisTick: { show: false }, axisLabel: { color: muted }, splitLine: { lineStyle: { color: grid, opacity: 0.6 } } };
  return {
    color: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => css(`--c${i}`)),
    backgroundColor: 'transparent',
    textStyle: { fontFamily: css('--font'), color: muted },
    categoryAxis: { ...axis, splitLine: { show: false } },
    valueAxis: { ...axis, axisLine: { show: false } },
    legend: { top: 0, right: 0, type: 'scroll', textStyle: { color: muted, fontFamily: css('--font'), fontSize: 12 }, icon: 'roundRect', itemWidth: 10, itemHeight: 10, itemGap: 14 },
    tooltip: { backgroundColor: css('--surface'), borderColor: grid, borderWidth: 1, textStyle: { color: text, fontFamily: css('--font') }, extraCssText: 'box-shadow:' + css('--shadow-pop') },
    line: { lineStyle: { width: 2 }, symbolSize: 6, showSymbol: false },
    bar: { barMaxWidth: 28, itemStyle: { borderRadius: [4, 4, 0, 0] } },
  };
}

/**
 * `<app-chart [option]="opt" [height]="260">`: ECharts wrapper. Defaults: item/axis tooltip, legend only for 2+ series.
 * Use `tooltip: { trigger: 'axis' }` for line/bar; any default can be overridden in `option`.
 */
@Component({
  selector: 'app-chart',
  template: `<div #host class="host" [style.height.px]="height()"></div>`,
  styles: `.host { width: 100%; }`,
})
export class ChartView implements OnDestroy {
  option = input.required<echarts.EChartsCoreOption>();
  height = input(260);
  private host = viewChild.required<ElementRef<HTMLDivElement>>('host');
  private chart?: echarts.ECharts;
  private mq = window.matchMedia('(prefers-color-scheme: dark)');
  private ro = new ResizeObserver(() => this.chart?.resize());
  private retheme = () => {
    this.dispose();
    this.render();
  };

  constructor() {
    this.mq.addEventListener('change', this.retheme);
    effect(() => {
      this.option();
      hidden();
      this.render();
    });
  }

  private render() {
    const el = this.host().nativeElement;
    if (!this.chart) {
      echarts.registerTheme('app', theme());
      this.chart = echarts.init(el, 'app');
      this.ro.observe(el);
    }
    let opt = this.option() as { series?: unknown; xAxis?: unknown; yAxis?: unknown; tooltip?: unknown };
    if (hidden()) {
      opt = JSON.parse(JSON.stringify(opt));
      const hideAxis = (axis: unknown) => {
        if (Array.isArray(axis)) {
          axis.forEach((a: any) => { if (a && a.type === 'value') a.axisLabel = { ...a.axisLabel, show: false }; });
        } else if (axis && typeof axis === 'object') {
          const a = axis as any;
          if (a.type === 'value') a.axisLabel = { ...a.axisLabel, show: false };
        }
      };
      hideAxis(opt.xAxis);
      hideAxis(opt.yAxis);
      (opt as any).tooltip = { show: false };
      if (Array.isArray(opt.series)) {
        (opt.series as any[]).forEach((s) => {
          if (s && typeof s === 'object') {
            if (s.label) s.label.show = false;
            if (s.markLine?.label) s.markLine.label.show = false;
          }
        });
      }
    }
    const n = Array.isArray(opt.series) ? opt.series.length : opt.series ? 1 : 0;
    this.chart.setOption({ tooltip: { show: true, trigger: 'item' }, legend: { show: n >= 2 }, ...opt }, true);
  }

  private dispose() {
    this.ro.disconnect();
    this.chart?.dispose();
    this.chart = undefined;
  }

  ngOnDestroy() {
    this.mq.removeEventListener('change', this.retheme);
    this.dispose();
  }
}
