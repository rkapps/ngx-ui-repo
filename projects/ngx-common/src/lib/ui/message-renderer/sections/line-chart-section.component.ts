import { Component, computed, input } from '@angular/core';
import { LineChartItem, LineChartSection } from '../message-renderer.types';

const FORMAT_UNITS: Record<string, string> = { currency: '$', percent: '%' };

@Component({
    selector: 'app-line-chart-section',
    standalone: true,
    template: `
        <div class="rounded-xl border border-gray-200 bg-white overflow-hidden">
            @if (normalizedSection().title) {
                <div class="px-2 md:px-6 pt-2">
                    <div class="pb-2 border-b-2 border-primary-500">
                        <h3 class="text-lg font-bold text-gray-800">{{ normalizedSection().title }}</h3>
                    </div>
                </div>
            }
            <div class="px-2 py-2 md:px-6 md:py-5">
                @if (hasData()) {
                    <!-- Legend: series names (only when there's more than one) -->
                    @if (normalizedSection().data.length > 1) {
                        <div class="flex flex-wrap gap-x-4 gap-y-1 mb-5">
                            @for (item of normalizedSection().data; track item.name; let i = $index) {
                                <div class="flex items-center gap-1.5">
                                    <div class="w-3 h-0.5 rounded-full" [class]="dotColor(i)"></div>
                                    <span class="text-xs text-gray-600">{{ item.name }}</span>
                                </div>
                            }
                        </div>
                    }

                    <div class="overflow-x-auto -mx-2 md:-mx-6 px-2 md:px-6">
                        <div class="flex items-start gap-2" style="min-width: max-content;">

                            <!-- Y-axis -->
                            <div class="relative shrink-0" style="width: 36px">
                                <div class="relative" [style.height.px]="CHART_HEIGHT_PX">
                                    @for (tick of yAxisTicks(); track tick.value) {
                                        <div class="absolute right-0 flex items-center gap-1"
                                             [style.bottom]="tick.bottomPct + '%'"
                                             style="transform: translateY(50%)">
                                            <span class="text-[9px] leading-none text-gray-400 whitespace-nowrap text-right">
                                                {{ formatValue(tick.value, normalizedSection().unit) }}
                                            </span>
                                            <div class="w-1.5 border-b border-gray-300"></div>
                                        </div>
                                    }
                                </div>
                                <!-- spacer to align with x-axis labels below the plot -->
                                <div style="height: 20px"></div>
                            </div>

                            <!-- Plot -->
                            <div class="relative" [style.width.px]="chartWidth()">
                                <svg [attr.width]="chartWidth()" [attr.height]="CHART_HEIGHT_PX" [attr.viewBox]="'0 0 ' + chartWidth() + ' ' + CHART_HEIGHT_PX">
                                    <!-- Gridlines -->
                                    @for (tick of yAxisTicks(); track tick.value) {
                                        <line [attr.x1]="0" [attr.x2]="chartWidth()"
                                              [attr.y1]="yFor(tick.value)" [attr.y2]="yFor(tick.value)"
                                              [attr.class]="tick.value === 0 ? 'stroke-gray-300' : 'stroke-gray-100'" />
                                    }

                                    <!-- Series lines + points -->
                                    @for (item of normalizedSection().data; track item.name; let i = $index) {
                                        <g [class]="lineColor(i)">
                                            <path [attr.d]="pathFor(item)" fill="none" stroke="currentColor" stroke-width="2"
                                                  stroke-linecap="round" stroke-linejoin="round" />
                                            @for (val of item.values ?? []; track $index; let pi = $index) {
                                                <circle [attr.cx]="xPositions()[pi]" [attr.cy]="yFor(val)" r="3.5"
                                                        fill="white" stroke="currentColor" stroke-width="2">
                                                    <title>{{ (normalizedSection().groups ?? [])[pi] }}: {{ formatValue(val, normalizedSection().unit) }}</title>
                                                </circle>
                                            }
                                            <!-- Direct label on the endpoint only -->
                                            @if (lastValue(item) !== undefined) {
                                                <text [attr.x]="xPositions()[xPositions().length - 1] + 6"
                                                      [attr.y]="yFor(lastValue(item)!)"
                                                      dominant-baseline="middle"
                                                      class="fill-gray-700 text-[10px] font-semibold">
                                                    {{ formatValue(lastValue(item)!, normalizedSection().unit) }}
                                                </text>
                                            }
                                        </g>
                                    }
                                </svg>

                                <!-- X-axis labels -->
                                <div class="relative mt-1" style="height: 20px">
                                    @for (group of (normalizedSection().groups ?? []); track $index; let gi = $index) {
                                        <span class="absolute text-[10px] text-gray-500 whitespace-nowrap"
                                              [style.left.px]="xPositions()[gi]"
                                              style="transform: translateX(-50%)">
                                            {{ group }}
                                        </span>
                                    }
                                </div>
                            </div>

                        </div>
                    </div>
                } @else {
                    <p class="text-sm text-gray-400">No data</p>
                }
            </div>
        </div>
    `,
})
export class LineChartSectionComponent {
    section = input.required<LineChartSection>();

    readonly CHART_HEIGHT_PX = 220;
    private readonly PAD_X = 10;
    private readonly POINT_GAP_PX = 70;
    private readonly END_LABEL_PX = 40;

    // Normalize the LLM's {label,value}[] format into the renderer's number[] + groups format.
    protected normalizedSection = computed<LineChartSection>(() => {
        const s = this.section();
        const firstValues = s.data?.[0]?.values;

        const unit = s.unit ?? (s.format ? FORMAT_UNITS[s.format] : undefined);
        let result = unit !== s.unit ? { ...s, unit } : s;

        if (!firstValues?.length || typeof firstValues[0] === 'number') return result;

        if (typeof firstValues[0] === 'object' && firstValues[0] !== null) {
            type RichVal = { label: string; value: number };
            const groups = (firstValues as unknown as RichVal[]).map(v => v.label);
            const data = s.data.map(item => ({
                ...item,
                values: (item.values as unknown as RichVal[]).map(v => v.value),
            }));
            return { ...result, groups, data };
        }

        if (typeof firstValues[0] === 'string') {
            const data = s.data.map(item => ({
                ...item,
                values: (item.values as unknown as string[]).map(v => this.parseFormattedValue(v)),
            }));
            return { ...result, data };
        }

        return result;
    });

    private parseFormattedValue(val: string): number {
        const s = val.replace(/[$,%\s,]/g, '');
        const suffix = s.slice(-1).toUpperCase();
        const multipliers: Record<string, number> = { T: 1e12, B: 1e9, M: 1e6, K: 1e3 };
        if (multipliers[suffix]) return parseFloat(s.slice(0, -1)) * multipliers[suffix];
        return parseFloat(s) || 0;
    }

    hasData = computed(() =>
        !!this.normalizedSection().groups?.length &&
        this.normalizedSection().data?.some(d => d.values?.length)
    );

    private allValues = computed(() => this.normalizedSection().data.flatMap(d => d.values ?? []));
    private rawMin = computed(() => Math.min(...this.allValues()));
    private rawMax = computed(() => Math.max(...this.allValues()));

    // Pad the value range so the line doesn't touch the top/bottom edge of the plot.
    private displayMin = computed(() => {
        const range = this.rawMax() - this.rawMin();
        return this.rawMin() - (range === 0 ? 1 : range * 0.1);
    });
    private displayMax = computed(() => {
        const range = this.rawMax() - this.rawMin();
        return this.rawMax() + (range === 0 ? 1 : range * 0.1);
    });
    private displayRange = computed(() => this.displayMax() - this.displayMin());

    chartWidth = computed(() => {
        const n = (this.normalizedSection().groups ?? []).length;
        const base = n <= 1 ? this.PAD_X * 2 : (n - 1) * this.POINT_GAP_PX + this.PAD_X * 2;
        return Math.max(240, base) + this.END_LABEL_PX;
    });

    xPositions = computed(() => {
        const n = (this.normalizedSection().groups ?? []).length;
        const w = this.chartWidth() - this.END_LABEL_PX;
        if (n <= 1) return [w / 2];
        const usable = w - this.PAD_X * 2;
        return Array.from({ length: n }, (_, i) => this.PAD_X + (usable * i) / (n - 1));
    });

    yFor(value: number): number {
        const range = this.displayRange();
        if (range === 0) return this.CHART_HEIGHT_PX / 2;
        return this.CHART_HEIGHT_PX - ((value - this.displayMin()) / range) * this.CHART_HEIGHT_PX;
    }

    pathFor(item: LineChartItem): string {
        const xs = this.xPositions();
        const values = item.values ?? [];
        return values
            .map((v, i) => `${i === 0 ? 'M' : 'L'} ${xs[i]},${this.yFor(v)}`)
            .join(' ');
    }

    lastValue(item: LineChartItem): number | undefined {
        const values = item.values ?? [];
        return values.length ? values[values.length - 1] : undefined;
    }

    yAxisTicks = computed(() => {
        const min = this.displayMin();
        const max = this.displayMax();
        const range = this.displayRange();
        if (range === 0) return [{ value: min, bottomPct: 50 }];

        const step = this.niceStep(range / 4);
        const firstTick = Math.ceil(min / step) * step;
        const ticks: { value: number; bottomPct: number }[] = [];

        for (let v = firstTick; v <= max + step * 0.01; v += step) {
            const rounded = Math.round(v * 1e10) / 1e10;
            const bottomPct = ((rounded - min) / range) * 100;
            ticks.push({ value: rounded, bottomPct });
        }
        return ticks;
    });

    private niceStep(roughStep: number): number {
        const magnitude = Math.pow(10, Math.floor(Math.log10(Math.abs(roughStep))));
        const normalized = roughStep / magnitude;
        if (normalized <= 1) return magnitude;
        if (normalized <= 2) return 2 * magnitude;
        if (normalized <= 5) return 5 * magnitude;
        return 10 * magnitude;
    }

    private readonly lineColors = [
        'text-primary-500', 'text-orange-500', 'text-emerald-500',
        'text-rose-500', 'text-violet-500', 'text-amber-500',
        'text-cyan-500', 'text-pink-500',
    ];
    private readonly dotColors = [
        'bg-primary-500', 'bg-orange-500', 'bg-emerald-500',
        'bg-rose-500', 'bg-violet-500', 'bg-amber-500',
        'bg-cyan-500', 'bg-pink-500',
    ];

    lineColor(index: number): string {
        return this.lineColors[index % this.lineColors.length];
    }

    dotColor(index: number): string {
        return this.dotColors[index % this.dotColors.length];
    }

    formatValue(value: number, unit?: string): string {
        const u = unit ?? '';
        const prefix = u === '$' ? '$' : '';
        const suffix = u !== '$' && u ? u : '';
        const sign = value < 0 ? '-' : '';
        const abs = Math.abs(value);
        if (abs >= 1_000_000_000) return `${sign}${prefix}${(abs / 1_000_000_000).toFixed(2)}B${suffix}`;
        if (abs >= 1_000_000) return `${sign}${prefix}${(abs / 1_000_000).toFixed(1)}M${suffix}`;
        if (abs >= 1_000) return `${sign}${prefix}${(abs / 1_000).toFixed(0)}K${suffix}`;
        const num = abs % 1 === 0 ? `${abs}` : `${abs.toFixed(1)}`;
        return `${sign}${prefix}${num}${suffix}`;
    }
}
