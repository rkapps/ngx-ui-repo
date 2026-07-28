import { Component, computed, input } from '@angular/core';
import { BarChartItem, BarChartSection } from '../message-renderer.types';

const FORMAT_UNITS: Record<string, string> = { currency: '$', percent: '%' };

@Component({
    selector: 'app-bar-chart-section',
    standalone: true,
    template: `
        <div class="rounded-xl border border-gray-200 bg-white overflow-hidden">
            @if (normalizedSection().title) {
                <div class="px-2 md:px-6 pt-2">
                    <div class="pb-2 border-b-2 border-primary-500 flex items-baseline gap-2">
                        <h3 class="text-lg font-bold text-gray-800">{{ normalizedSection().title }}</h3>
                        @if (normalizedSection().unit) {
                            <span class="text-xs font-medium text-gray-500 shrink-0">({{ normalizedSection().unit }})</span>
                        }
                    </div>
                </div>
            }
            <div class="px-2 py-2 md:px-6 md:py-5">
                @if (isGrouped()) {
                    <!-- Legend: data items (e.g. stock tickers) -->
                    @if (normalizedSection().data.length > 1) {
                        <div class="flex flex-wrap gap-x-4 gap-y-1 mb-5">
                            @for (item of normalizedSection().data; track item.name; let i = $index) {
                                <div class="flex items-center gap-1.5">
                                    <div class="w-3 h-3 rounded-sm" [class]="groupBgColor(i)"></div>
                                    <span class="text-xs text-gray-600">{{ item.name }}</span>
                                </div>
                            }
                        </div>
                    }
                    <div class="overflow-x-auto -mx-2 md:-mx-6 px-2 md:px-6">
                        <div class="flex items-start gap-2" style="min-width: max-content;">

                            <!-- Y-axis -->
                            <div class="relative shrink-0" style="width: 44px">
                                <div class="relative" [style.height.px]="CHART_HEIGHT_PX">
                                    @for (tick of yAxisTicks(); track tick.value) {
                                        <div class="absolute right-0 flex items-center gap-1"
                                             [style.bottom]="tick.bottomPct + '%'"
                                             style="transform: translateY(50%)">
                                            <span class="text-[10px] leading-none font-medium text-gray-500 whitespace-nowrap text-right">
                                                {{ formatValue(tick.value, normalizedSection().unit) }}
                                            </span>
                                            <div class="w-1.5 border-b border-gray-400"></div>
                                        </div>
                                    }
                                </div>
                                <!-- spacer to align with x-axis labels below bars -->
                                <div style="height: 20px"></div>
                            </div>

                            <!-- Bars with gridlines — iterate groups (x-axis) -->
                            <div class="relative flex" [class]="groupGapClass()">
                                <!-- Gridline overlay spanning all columns -->
                                <div class="absolute left-0 right-0 top-0 pointer-events-none z-0"
                                     [style.height.px]="CHART_HEIGHT_PX">
                                    @for (tick of yAxisTicks(); track tick.value) {
                                        <div class="absolute left-0 right-0 border-t"
                                             [class]="tick.value === 0 ? 'border-gray-300' : 'border-gray-100'"
                                             [style.bottom]="tick.bottomPct + '%'">
                                        </div>
                                    }
                                </div>

                                @for (group of (normalizedSection().groups ?? []); track $index; let gi = $index) {
                                    <div class="relative flex flex-col items-center gap-2 z-10"
                                         [style.width]="columnWidth(group)">
                                        <div class="flex flex-col w-full" [style.height.px]="CHART_HEIGHT_PX">
                                            <!-- Positive area: bars grow up from zero line -->
                                            <div class="flex items-end w-full justify-center"
                                                 [style.height.px]="positiveAreaPx()">
                                                @for (item of normalizedSection().data; track item.name; let i = $index) {
                                                    @let val = item.values?.[gi] ?? 0;
                                                    <div class="flex flex-col items-center justify-end h-full w-6 shrink-0">
                                                        @if (val > 0) {
                                                            <span class="mb-0.5 text-[10px] leading-none text-gray-600 font-semibold whitespace-nowrap"
                                                                  style="writing-mode: vertical-rl; transform: rotate(180deg);">
                                                                {{ formatValue(val) }}
                                                            </span>
                                                            <div class="w-6 rounded-t transition-all duration-700"
                                                                 [class]="groupBgColor(i)"
                                                                 [style.height.px]="posBarPx(val)">
                                                            </div>
                                                        }
                                                    </div>
                                                }
                                            </div>
                                            <!-- Zero axis line -->
                                            <div class="w-full border-b"
                                                 [class]="hasGroupNegatives() ? 'border-gray-400' : 'border-gray-200'">
                                            </div>
                                            <!-- Negative area: bars grow down from zero line -->
                                            @if (hasGroupNegatives()) {
                                                <div class="flex items-start w-full justify-center"
                                                     [style.height.px]="negativeAreaPx()">
                                                    @for (item of normalizedSection().data; track item.name; let i = $index) {
                                                        @let val = item.values?.[gi] ?? 0;
                                                        <div class="flex flex-col items-center justify-start h-full w-6 shrink-0">
                                                            @if (val < 0) {
                                                                <div class="w-6 rounded-b transition-all duration-700"
                                                                     [class]="groupBgColor(i)"
                                                                     [style.height.px]="negBarPx(val)">
                                                                </div>
                                                                <span class="mt-0.5 text-[10px] leading-none text-gray-600 font-semibold whitespace-nowrap"
                                                                      style="writing-mode: vertical-rl; transform: rotate(180deg);">
                                                                    {{ formatValue(val) }}
                                                                </span>
                                                            }
                                                        </div>
                                                    }
                                                </div>
                                            }
                                        </div>
                                        <!-- X-axis label (time period) -->
                                        <span class="text-[10px] text-gray-500 text-center leading-tight font-medium">{{ group }}</span>
                                    </div>
                                }
                            </div>

                        </div>
                    </div>
                } @else {
                    <div class="space-y-3">
                        @for (item of normalizedSection().data; track $index) {
                            @let sv = singleValue(item);
                            <div>
                                <div class="flex justify-between text-xs text-gray-600 mb-1.5">
                                    <span>{{ item.name }}</span>
                                    <span class="font-medium">{{ formatValue(sv, normalizedSection().unit) }}</span>
                                </div>
                                <div class="relative h-2 w-full rounded-full bg-gray-100">
                                    @if (hasSingleNegatives()) {
                                        <div class="absolute inset-y-0 w-px bg-gray-400 z-10"
                                             [style.left]="zeroPctSingle() + '%'"></div>
                                    }
                                    <div class="absolute inset-y-0 h-2 rounded-full transition-all duration-500"
                                        [class.bar-signal-up]="item.signal === 'up'"
                                        [class.bar-signal-down]="item.signal === 'down'"
                                        [class.bar-signal-neutral]="!item.signal || item.signal === 'neutral'"
                                        [style.left]="singleBarLeft(sv) + '%'"
                                        [style.width]="singleBarWidthPct(sv) + '%'">
                                    </div>
                                </div>
                                @if (hasSingleNegatives()) {
                                    <div class="relative h-3 mt-0.5">
                                        <span class="absolute text-[9px] text-gray-400"
                                              [style.left]="zeroPctSingle() + '%'"
                                              style="transform: translateX(-50%)">0</span>
                                    </div>
                                }
                            </div>
                        }
                    </div>
                }
            </div>
        </div>
    `,
})
export class BarChartSectionComponent {
    section = input.required<BarChartSection>();

    // Normalize the LLM's {label,value}[] format into the renderer's number[] + groups format.
    protected normalizedSection = computed<BarChartSection>(() => {
        const s = this.section();
        const firstValues = s.data?.[0]?.values;

        // Derive unit from format field if not already set
        const unit = s.unit ?? (s.format ? FORMAT_UNITS[s.format] : undefined);
        let result = unit !== s.unit ? { ...s, unit } : s;

        if (!firstValues?.length || typeof firstValues[0] === 'number') return result;

        // Case 1: values is { label, value }[] — extract groups from labels
        if (typeof firstValues[0] === 'object' && firstValues[0] !== null) {
            type RichVal = { label: string; value: number };
            const groups = (firstValues as unknown as RichVal[]).map(v => v.label);
            const data = s.data.map(item => ({
                ...item,
                values: (item.values as unknown as RichVal[]).map(v => v.value),
            }));
            return { ...result, groups, data };
        }

        // Case 2: values is string[] — parse formatted currency/number strings to numbers
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

    isGrouped = computed(() =>
        !!this.normalizedSection().groups?.length &&
        this.normalizedSection().data?.some(d => d.values?.length)
    );

    private maxGroupValue = computed(() =>
        Math.max(...this.normalizedSection().data.flatMap(d => d.values ?? []), 0)
    );
    private minGroupValue = computed(() =>
        Math.min(...this.normalizedSection().data.flatMap(d => d.values ?? []), 0)
    );
    private groupRange = computed(() => this.maxGroupValue() - this.minGroupValue());

    protected singleValue(d: BarChartItem): number { return d.value ?? d.values?.[0] ?? 0; }

    private maxSingleValue = computed(() =>
        Math.max(...this.normalizedSection().data.map(d => this.singleValue(d)), 0)
    );
    private minSingleValue = computed(() =>
        Math.min(...this.normalizedSection().data.map(d => this.singleValue(d)), 0)
    );
    private singleRange = computed(() => this.maxSingleValue() - this.minSingleValue());

    hasGroupNegatives = computed(() => this.minGroupValue() < 0);
    hasSingleNegatives = computed(() => this.minSingleValue() < 0);

    readonly CHART_HEIGHT_PX = 280;

    positiveAreaPx = computed(() => {
        const range = this.groupRange();
        if (range === 0) return this.CHART_HEIGHT_PX;
        return (this.maxGroupValue() / range) * this.CHART_HEIGHT_PX;
    });

    negativeAreaPx = computed(() => {
        const range = this.groupRange();
        if (range === 0) return 0;
        return (-this.minGroupValue() / range) * this.CHART_HEIGHT_PX;
    });

    zeroPctSingle = computed(() => {
        const range = this.singleRange();
        if (range === 0) return 0;
        return (-this.minSingleValue() / range) * 100;
    });

    yAxisTicks = computed(() => {
        const min = this.minGroupValue();
        const max = this.maxGroupValue();
        const range = this.groupRange();
        if (range === 0) return [{ value: 0, bottomPct: 50 }];

        const step = this.niceStep(range / 12);
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

    private readonly groupBgColors = [
        'bg-primary-500', 'bg-orange-500', 'bg-emerald-500',
        'bg-rose-500', 'bg-violet-500', 'bg-amber-500',
        'bg-cyan-500', 'bg-pink-500',
    ];

    // Number of bars per x-axis column = number of data series (stocks)
    private numSeries = computed(() => this.section().data?.length ?? 1);

    groupGapClass = computed(() => {
        const n = this.numSeries();
        if (n <= 1) return 'gap-6';
        if (n <= 3) return 'gap-10';
        if (n <= 5) return 'gap-8';
        return 'gap-6';
    });

    columnWidth(groupLabel: string | null | undefined): string {
        const n = this.numSeries();
        const BAR_PX = 24;  // w-6, bars sit flush with no gap
        const minForBars = n * BAR_PX + 8;
        const minForLabel = Math.max(32, String(groupLabel ?? '').length * 7);
        return `${Math.max(minForBars, minForLabel)}px`;
    }

    groupBgColor(index: number): string {
        return this.groupBgColors[index % this.groupBgColors.length];
    }

    posBarPx(val: number): number {
        const range = this.groupRange();
        if (range === 0 || val <= 0) return 0;
        return Math.max(2, (val / range) * this.CHART_HEIGHT_PX);
    }

    negBarPx(val: number): number {
        const range = this.groupRange();
        if (range === 0 || val >= 0) return 0;
        return Math.max(2, (-val / range) * this.CHART_HEIGHT_PX);
    }

    singleBarLeft(value: number): number {
        if (!this.hasSingleNegatives()) return 0;
        const range = this.singleRange();
        if (range === 0) return this.zeroPctSingle();
        return this.zeroPctSingle() + Math.min(0, (value / range) * 100);
    }

    singleBarWidthPct(value: number): number {
        const range = this.singleRange();
        if (range === 0) return 0;
        return Math.abs((value / range) * 100);
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
