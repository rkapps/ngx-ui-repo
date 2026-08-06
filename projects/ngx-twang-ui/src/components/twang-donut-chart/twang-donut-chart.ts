import { Component, computed, input } from '@angular/core';

export interface TwangDonutSegment {
  label: string;
  value: number;
  /** CSS color (hex, rgb(), var(), etc). Defaults to a palette color chosen by index when omitted. */
  color?: string;
}

interface TwangDonutArc {
  label: string;
  color: string;
  percentLabel: string;
  dashArray: string;
  dashOffset: number;
}

/** Default categorical palette, cycled by index for segments with no explicit `color`. */
const DEFAULT_PALETTE = ['#2563eb', '#7c3aed', '#0d9488', '#16a34a', '#d97706', '#db2777', '#4f46e5', '#64748b'];

/** SVG donut/ring chart with an optional legend, built from arbitrary label/value segments. */
@Component({
  selector: 'twang-donut-chart',
  standalone: true,
  templateUrl: './twang-donut-chart.html',
})
export class TwangDonutChartComponent {
  readonly segments = input<TwangDonutSegment[]>([]);
  readonly size = input(110);
  readonly strokeWidth = input(16);
  readonly showLegend = input(true);
  readonly emptyMessage = input('No data.');

  protected readonly radius = computed(() => (this.size() - this.strokeWidth()) / 2);
  private readonly circumference = computed(() => 2 * Math.PI * this.radius());

  protected readonly total = computed(() =>
    this.segments().reduce((sum, s) => sum + Math.max(s.value, 0), 0),
  );

  protected readonly arcs = computed<TwangDonutArc[]>(() => {
    const total = this.total();
    if (total <= 0) return [];
    const circumference = this.circumference();
    let cumulative = 0;

    return this.segments()
      .filter(s => s.value > 0)
      .map((s, i) => {
        const fraction = s.value / total;
        const dash = fraction * circumference;
        const arc: TwangDonutArc = {
          label: s.label,
          color: s.color ?? DEFAULT_PALETTE[i % DEFAULT_PALETTE.length],
          percentLabel: `${(fraction * 100).toFixed(1)}%`,
          dashArray: `${dash} ${circumference - dash}`,
          dashOffset: -cumulative,
        };
        cumulative += dash;
        return arc;
      });
  });
}
