import { Component, computed, input } from '@angular/core';

export interface TwangBarDatum {
  label: string;
  value: number;
  /** CSS color (hex, rgb(), var(), etc). Defaults to a palette color chosen by index when omitted. */
  color?: string;
}

export type TwangBarChartOrientation = 'vertical' | 'horizontal';

interface TwangStyledBar extends TwangBarDatum {
  color: string;
}

/** Default categorical palette, cycled by index for bars with no explicit `color`. */
const DEFAULT_PALETTE = ['#2563eb', '#7c3aed', '#0d9488', '#16a34a', '#d97706', '#db2777', '#4f46e5', '#64748b'];

/** Rounds a chart max up to a "nice" round number so gridlines land on clean values. */
function niceScale(maxValue: number, targetSteps: number): { max: number; step: number } {
  if (maxValue <= 0) return { max: targetSteps, step: 1 };
  const rawStep = maxValue / targetSteps;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const residual = rawStep / magnitude;
  const step = residual > 5 ? 10 * magnitude : residual > 2 ? 5 * magnitude : residual > 1 ? 2 * magnitude : magnitude;
  let max = step * targetSteps;
  while (max < maxValue) max += step;
  return { max, step };
}

/** Simple bar chart (vertical columns or horizontal bars) with gridlines and a value scale. */
@Component({
  selector: 'twang-bar-chart',
  standalone: true,
  templateUrl: './twang-bar-chart.html',
})
export class TwangBarChartComponent {
  readonly bars = input<TwangBarDatum[]>([]);
  readonly orientation = input<TwangBarChartOrientation>('vertical');
  readonly height = input(240);
  /** Vertical mode: value-axis label column width. Horizontal mode: category-label column max-width (labels size to content up to this cap, then truncate). */
  readonly yAxisWidth = input(56);
  /** Horizontal mode only: fixed bar thickness (row height) in px. */
  readonly barThickness = input(14);
  /** Vertical mode only: counterclockwise tilt (degrees) for x-axis labels. `0` = plain centered, truncated labels. */
  readonly labelAngle = input(0);
  readonly gridLines = input(8);
  readonly formatValue = input<(v: number) => string>(v => `${Math.round(v)}`);
  readonly emptyMessage = input('No data.');

  protected readonly styledBars = computed<TwangStyledBar[]>(() =>
    this.bars().map((b, i) => ({ ...b, color: b.color ?? DEFAULT_PALETTE[i % DEFAULT_PALETTE.length] })),
  );

  /** Narrower bars with few categories (otherwise a lone bar reads as a giant block), wider as more are packed in. */
  protected readonly barWidthPercent = computed(() => {
    const n = this.bars().length;
    if (n <= 1) return 16;
    if (n <= 3) return 24;
    if (n <= 6) return 36;
    return 50;
  });

  private readonly scale = computed(() =>
    niceScale(Math.max(...this.bars().map(b => b.value), 0), this.gridLines()),
  );

  /** Descending (max → 0): top-to-bottom order for the vertical mode's y-axis label column. */
  protected readonly ticks = computed<number[]>(() => {
    const { max, step } = this.scale();
    const ticks: number[] = [];
    for (let v = max; v > 0; v -= step) ticks.push(v);
    ticks.push(0);
    return ticks;
  });

  /** Ascending (0 → max): left-to-right order for the horizontal mode's bottom value axis. */
  protected readonly ascendingTicks = computed<number[]>(() => [...this.ticks()].reverse());

  protected percentOf(value: number): number {
    const max = this.scale().max;
    return max > 0 ? Math.max(0, (value / max) * 100) : 0;
  }
}
