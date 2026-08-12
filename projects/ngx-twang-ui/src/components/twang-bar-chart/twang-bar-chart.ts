import { Component, computed, input } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';

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

/** One stacked series, e.g. an expense group — colors and the legend follow this array's order. */
export interface TwangStackedBarSeries {
  label: string;
  /** CSS color. Defaults to a palette color chosen by index when omitted. */
  color?: string;
}

/** One stacked row (e.g. a month); `values` align 1:1 with the `series` input array. */
export interface TwangStackedBarRow {
  label: string;
  values: number[];
}

interface TwangStyledStackedSeries extends TwangStackedBarSeries {
  color: string;
}

interface TwangStackedSegment {
  label: string;
  value: number;
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
  const step =
    residual > 5 ? 10 * magnitude
    : residual > 2.5 ? 5 * magnitude
    : residual > 2 ? 2.5 * magnitude
    : residual > 1 ? 2 * magnitude
    : magnitude;
  const max = Math.ceil(maxValue / step) * step;
  return { max, step };
}

/** Simple bar chart (vertical columns or horizontal bars) with gridlines and a value scale. */
@Component({
  selector: 'twang-bar-chart',
  standalone: true,
  imports: [LucideAngularModule],
  templateUrl: './twang-bar-chart.html',
})
export class TwangBarChartComponent {
  readonly bars = input<TwangBarDatum[]>([]);
  /** Optional header rendered above the chart (e.g. a card title) — keeps callers from repeating the same `<p>` markup. */
  readonly title = input('');
  /**
   * Horizontal-mode only: renders each row as a stacked bar (one colored segment per series)
   * instead of `bars()`'s single segment. Ignored when empty. `series` supplies the shared
   * legend/colors; each row's `values` align to it by index.
   */
  readonly stackedRows = input<TwangStackedBarRow[]>([]);
  readonly series = input<TwangStackedBarSeries[]>([]);
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
  /** Shows a spinner overlay (over existing bars if any, or in place of the empty message). */
  readonly loading = input(false);

  protected readonly styledBars = computed<TwangStyledBar[]>(() =>
    this.bars().map((b, i) => ({ ...b, color: b.color ?? DEFAULT_PALETTE[i % DEFAULT_PALETTE.length] })),
  );

  protected readonly isStacked = computed(() => this.stackedRows().length > 0);

  protected readonly styledSeries = computed<TwangStyledStackedSeries[]>(() =>
    this.series().map((s, i) => ({ ...s, color: s.color ?? DEFAULT_PALETTE[i % DEFAULT_PALETTE.length] })),
  );

  /** Each row's values paired with their series' label/color, for rendering successive segments. */
  protected readonly stackedSegmentsByRow = computed<TwangStackedSegment[][]>(() => {
    const series = this.styledSeries();
    return this.stackedRows().map(row => row.values.map((value, i) => ({ label: series[i]?.label ?? '', value, color: series[i]?.color ?? DEFAULT_PALETTE[i % DEFAULT_PALETTE.length] })));
  });

  protected readonly stackedRowTotals = computed(() => this.stackedRows().map(row => row.values.reduce((sum, v) => sum + v, 0)));

  /** Narrower bars with few categories (otherwise a lone bar reads as a giant block), wider as more are packed in. */
  protected readonly barWidthPercent = computed(() => {
    const n = this.bars().length;
    if (n <= 1) return 16;
    if (n <= 3) return 24;
    if (n <= 6) return 36;
    return 50;
  });

  private readonly scale = computed(() => {
    const maxValue = this.isStacked()
      ? Math.max(...this.stackedRowTotals(), 0)
      : Math.max(...this.bars().map(b => b.value), 0);
    return niceScale(maxValue, this.gridLines());
  });

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
