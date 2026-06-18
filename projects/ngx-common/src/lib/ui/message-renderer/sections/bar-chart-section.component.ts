import { Component, computed, input } from '@angular/core';
import { BarChartSection } from '../message-renderer.types';

@Component({
    selector: 'app-bar-chart-section',
    standalone: true,
    template: `
        <div class="rounded-xl border border-gray-200 bg-white overflow-hidden">
            @if (section().title) {
                <div class="px-6 pt-2">
                    <div class="pb-2 border-b-2 border-primary-500">
                        <h3 class="text-lg font-bold text-gray-800">{{ section().title }}</h3>
                    </div>
                </div>
            }
            <div class="px-6 py-5">
                @if (isGrouped()) {
                    @if (section().groups?.length) {
                        <div class="flex gap-4 mb-5">
                            @for (group of section().groups; track group; let i = $index) {
                                <div class="flex items-center gap-1.5">
                                    <div class="w-3 h-3 rounded-sm" [class]="groupBgColor(i)"></div>
                                    <span class="text-xs text-gray-600">{{ group }}</span>
                                </div>
                            }
                        </div>
                    }
                    <div class="overflow-x-auto -mx-6 px-6">
                        <div class="flex" [class]="groupGapClass()" style="min-width: max-content;">
                            @for (item of section().data; track $index) {
                                <div class="flex flex-col items-center gap-2" [class]="groupItemClass()">
                                    <div class="flex items-end gap-1 w-full justify-center border-b border-gray-200"
                                         style="height: 220px;">
                                        @for (val of (item.values ?? []); track $index; let i = $index) {
                                            <div class="flex flex-col items-center justify-end gap-0.5 h-full">
                                                <span class="text-[10px] leading-none text-gray-600 font-semibold">
                                                    {{ formatValue(val, section().unit) }}
                                                </span>
                                                <div class="w-6 rounded-t transition-all duration-700"
                                                     [class]="groupBgColor(i)"
                                                     [style.height]="verticalBarHeight(val)">
                                                </div>
                                            </div>
                                        }
                                    </div>
                                    <span class="text-[10px] text-gray-500 text-center leading-tight font-medium">{{ item.name }}</span>
                                </div>
                            }
                        </div>
                    </div>
                } @else {
                    <div class="space-y-3">
                        @for (item of section().data; track $index) {
                            <div>
                                <div class="flex justify-between text-xs text-gray-600 mb-1.5">
                                    <span>{{ item.name }}</span>
                                    <span class="font-medium">{{ formatValue(item.value ?? 0, section().unit) }}</span>
                                </div>
                                <div class="h-2 w-full rounded-full bg-gray-100">
                                    <div class="h-2 rounded-full transition-all duration-500"
                                        [class.bar-signal-up]="item.signal === 'up'"
                                        [class.bar-signal-down]="item.signal === 'down'"
                                        [class.bar-signal-neutral]="!item.signal || item.signal === 'neutral'"
                                        [style.width]="singleBarWidth(item.value!)">
                                    </div>
                                </div>
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

    isGrouped = computed(() =>
        !!this.section().groups?.length ||
        this.section().data?.some(d => d.values?.length)
    );

    private maxGroupValue = computed(() => {
        const allValues = this.section().data.flatMap(d => d.values ?? []);
        return Math.max(...allValues, 0);
    });

    private maxSingleValue = computed(() =>
        Math.max(...this.section().data.map(d => d.value ?? 0), 0)
    );

    private groupTotals = computed(() => {
        const numGroups = this.section().groups?.length ?? 0;
        const totals = new Array<number>(numGroups).fill(0);
        for (const item of this.section().data) {
            (item.values ?? []).forEach((v, i) => { totals[i] += v; });
        }
        return totals;
    });

    private readonly CHART_HEIGHT_PX = 220;
    private readonly groupBgColors = ['bg-primary-500', 'bg-blue-400', 'bg-amber-400', 'bg-emerald-400'];

    private numGroups = computed(() =>
        this.section().groups?.length
            ?? this.section().data[0]?.values?.length
            ?? 1
    );

    groupGapClass = computed(() => this.numGroups() <= 1 ? 'gap-3' : 'gap-12');

    groupItemClass = computed(() => this.numGroups() <= 1 ? 'w-6' : 'w-20');

    groupBgColor(index: number): string {
        return this.groupBgColors[index % this.groupBgColors.length];
    }

    pctLabel(value: number, groupIndex: number): string {
        const total = this.groupTotals()[groupIndex] ?? 0;
        if (total === 0) return '';
        return `${((value / total) * 100).toFixed(1)}%`;
    }

    verticalBarHeight(value: number): string {
        const max = this.maxGroupValue();
        if (max === 0) return '2px';
        return `${Math.max(2, (value / max) * this.CHART_HEIGHT_PX).toFixed(0)}px`;
    }

    singleBarWidth(value: number): string {
        const max = this.maxSingleValue();
        return max === 0 ? '0%' : `${Math.min(100, (value / max) * 100).toFixed(1)}%`;
    }

    formatValue(value: number, unit?: string): string {
        const u = unit ?? '';
        const prefix = u === '$' ? '$' : '';
        const suffix = u !== '$' && u ? u : '';
        if (value >= 1_000_000) return `${prefix}${(value / 1_000_000).toFixed(1)}M${suffix}`;
        if (value >= 1_000) return `${prefix}${(value / 1_000).toFixed(0)}K${suffix}`;
        const num = value % 1 === 0 ? `${value}` : `${value.toFixed(1)}`;
        return `${prefix}${num}${suffix}`;
    }
}
