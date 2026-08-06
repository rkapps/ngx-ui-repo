import { Component, computed, input } from '@angular/core';

export interface TwangLineChartPoint {
  /** X-axis label (e.g. a date string). Only `xTickCount` of these are shown, evenly spaced. */
  x: string;
  y: number;
}

export interface TwangXTick {
  /** Percent position (0-100) along the plot width, inset slightly so a centered label can't overflow past the edge. */
  xPercent: number;
  label: string;
}

export interface TwangLineSeries {
  label: string;
  /** CSS color (hex, rgb(), var(), etc). Defaults to a palette color chosen by index when omitted. */
  color?: string;
  points: TwangLineChartPoint[];
}

interface TwangStyledSeries extends TwangLineSeries {
  color: string;
}

/** Default categorical palette, cycled by index for series with no explicit `color`. */
const DEFAULT_PALETTE = ['#2563eb', '#7c3aed', '#d97706', '#16a34a', '#db2777', '#0d9488', '#4f46e5', '#64748b'];

/** Rounds a [min, max] range outward to "nice" round tick values. */
function niceRange(min: number, max: number, targetSteps: number): { min: number; max: number; step: number } {
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const rawStep = (max - min) / targetSteps;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const residual = rawStep / magnitude;
  const step = residual > 5 ? 10 * magnitude : residual > 2 ? 5 * magnitude : residual > 1 ? 2 * magnitude : magnitude;
  return { min: Math.floor(min / step) * step, max: Math.ceil(max / step) * step, step };
}

/** Simple multi-series line chart (e.g. price + moving averages over time), built from arbitrary x/y points. */
@Component({
  selector: 'twang-line-chart',
  standalone: true,
  templateUrl: './twang-line-chart.html',
})
export class TwangLineChartComponent {
  readonly series = input<TwangLineSeries[]>([]);
  readonly height = input(240);
  readonly yAxisWidth = input(64);
  readonly gridLines = input(5);
  readonly xTickCount = input(6);
  readonly formatValue = input<(v: number) => string>(v => `${Math.round(v)}`);
  readonly emptyMessage = input('No data.');

  protected readonly hasData = computed(() => this.series().some(s => s.points.length > 0));

  protected readonly styledSeries = computed<TwangStyledSeries[]>(() =>
    this.series().map((s, i) => ({ ...s, color: s.color ?? DEFAULT_PALETTE[i % DEFAULT_PALETTE.length] })),
  );

  private readonly range = computed(() => {
    const values = this.series().flatMap(s => s.points.map(p => p.y));
    if (!values.length) return { min: 0, max: 1, step: 1 };
    return niceRange(Math.min(...values), Math.max(...values), this.gridLines());
  });

  /** Descending (max → 0): top-to-bottom order for the y-axis label column. */
  protected readonly ticks = computed<number[]>(() => {
    const { min, max, step } = this.range();
    const ticks: number[] = [];
    for (let v = max; v >= min - step / 2; v -= step) ticks.push(v);
    return ticks;
  });

  // Picks evenly-spaced data points by index (matching how `pointsFor` places the line itself), then
  // maps them onto an inset [labelInset, 100 - labelInset] range instead of the full plot width — every
  // label is center-anchored, and the inset keeps the first/last ones from overflowing past the border.
  private static readonly LABEL_INSET_PERCENT = 6;

  protected readonly xTicks = computed<TwangXTick[]>(() => {
    const points = this.series().find(s => s.points.length)?.points;
    if (!points || points.length === 0) return [];
    const n = points.length;
    const count = Math.max(1, Math.min(this.xTickCount(), n));
    if (count === 1) return [{ xPercent: 50, label: points[0].x }];

    const inset = TwangLineChartComponent.LABEL_INSET_PERCENT;
    const ticks: TwangXTick[] = [];
    for (let i = 0; i < count; i++) {
      const idx = Math.round((i / (count - 1)) * (n - 1));
      const xPercent = inset + (i / (count - 1)) * (100 - 2 * inset);
      ticks.push({ xPercent, label: points[idx].x });
    }
    return ticks;
  });

  protected pointsFor(series: TwangLineSeries): string {
    const { min, max } = this.range();
    const n = series.points.length;
    return series.points
      .map((p, i) => {
        const x = n > 1 ? (i / (n - 1)) * 100 : 50;
        const y = max > min ? 100 - ((p.y - min) / (max - min)) * 100 : 50;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
  }
}
