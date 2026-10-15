import { Component, effect, ElementRef, input, OnDestroy, viewChild } from '@angular/core';
import { hidden } from './privacy.ts';
import { isDark } from './theme.ts';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import { DatasetComponent, GridComponent, LegendComponent, MarkLineComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([BarChart, LineChart, PieChart, GridComponent, TooltipComponent, LegendComponent, DatasetComponent, MarkLineComponent, CanvasRenderer]);

const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

function theme(narrow: boolean) {
  const text = css('--text'), muted = css('--muted'), grid = css('--border');
  const axis = { axisLine: { lineStyle: { color: grid } }, axisTick: { show: false }, axisLabel: { color: muted, ...(narrow && { hideOverlap: true }) }, splitLine: { lineStyle: { color: grid, opacity: 0.6 } } };
  return {
    color: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => css(`--c${i}`)),
    backgroundColor: 'transparent',
    textStyle: { fontFamily: css('--font'), color: muted },
    categoryAxis: { ...axis, splitLine: { show: false } },
    valueAxis: { ...axis, axisLine: { show: false } },
    legend: { top: 0, type: 'scroll', orient: 'horizontal', ...(narrow ? { left: 0, right: 0 } : { right: 0 }), textStyle: { color: muted, fontFamily: css('--font'), fontSize: narrow ? 11 : 12 }, icon: 'roundRect', itemWidth: 10, itemHeight: 10, itemGap: narrow ? 10 : 14 },
    tooltip: { confine: true, backgroundColor: css('--surface'), borderColor: grid, borderWidth: 1, textStyle: { color: text, fontFamily: css('--font') }, extraCssText: 'box-shadow:' + css('--shadow-pop') + ';max-width:calc(100vw - 3rem);white-space:normal' },
    line: { lineStyle: { width: 2 }, symbolSize: 6, showSymbol: false },
    pie: { itemStyle: { borderColor: css('--surface'), borderWidth: 2 }, label: { color: text, textBorderWidth: 0 }, labelLine: { lineStyle: { color: muted } } },
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
  private dark = isDark();
  private narrow = false;
  private ro = new ResizeObserver(() => {
    if (!this.chart) return;
    const n = this.host().nativeElement.clientWidth < 480;
    if (n === this.narrow) return this.chart.resize();
    this.dispose();
    this.render();
  });

  constructor() {
    effect(() => {
      this.option();
      hidden();
      if (isDark() !== this.dark) {
        this.dark = isDark();
        this.dispose();
      }
      this.render();
    });
  }

  private render() {
    const el = this.host().nativeElement;
    if (!this.chart) {
      this.narrow = el.clientWidth < 480;
      echarts.registerTheme('app', theme(this.narrow));
      this.chart = echarts.init(el, 'app');
      this.ro.observe(el);
    }
    const narrow = this.narrow;
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
    let legend: unknown;
    if (narrow) {
      const pcts = new Map<string, string>();
      const series = (Array.isArray(opt.series) ? opt.series : opt.series ? [opt.series] : []).map((s: any) => {
        if (s?.type !== 'pie') return s;
        const data: { name: string; value: number }[] = s.data ?? [];
        const sum = data.reduce((a, d) => a + (Number(d.value) || 0), 0);
        data.forEach((d) => pcts.set(d.name, sum ? ((Number(d.value) / sum) * 100).toFixed(1) : '0.0'));
        // a slice's own label settings beat the series-level ones, so hide them per slice too
        const hidden = data.map((d: any) => ({ ...d, label: { ...d.label, show: false }, labelLine: { ...d.labelLine, show: false } }));
        return { ...s, data: hidden, center: ['50%', '40%'], label: { ...s.label, show: false }, labelLine: { ...s.labelLine, show: false } };
      });
      if (pcts.size) {
        opt = { ...opt, series };
        legend = { show: true, type: 'plain', orient: 'horizontal', top: 'auto', bottom: 0, left: 0, right: 0, itemGap: 10, textStyle: { fontSize: 11, color: css('--muted') }, formatter: (name: string) => `${name}  ${pcts.get(name) ?? ''}%` };
      }
    }
    const n = Array.isArray(opt.series) ? opt.series.length : opt.series ? 1 : 0;
    if (opt.tooltip && typeof opt.tooltip === 'object') opt = { ...opt, tooltip: { ...opt.tooltip, confine: true } };
    this.chart.setOption({ tooltip: { show: true, trigger: 'item', confine: true }, legend: { show: n >= 2 }, ...opt, ...(legend ? { legend } : {}) }, true);
  }

  private dispose() {
    this.ro.disconnect();
    this.chart?.dispose();
    this.chart = undefined;
  }

  ngOnDestroy() {
    this.dispose();
  }
}
