import { Component, computed, input } from '@angular/core';
import { BarChartSection } from '../message-renderer.types';

@Component({
    selector: 'app-bar-chart-section',
    standalone: true,
    template: `
        <div class="rounded-xl border border-gray-200 bg-white overflow-hidden">
            @if (section().title) {
                <div class="px-6 pt-3">
                <div class="pb-4 border-b-2 border-primary-500">
                    <h3 class="text-lg font-bold text-gray-800">{{ section().title }}</h3>
                </div>
            </div>
            }
            <div class="px-6 py-5 space-y-3">
                @for (item of section().data; track item.name) {
                    <div>
                        <div class="flex justify-between text-xs text-gray-600 mb-1.5">
                            <span>{{ item.name }}</span>
                            <span class="font-medium">{{ item.value }}%</span>
                        </div>
                        <div class="h-2 w-full rounded-full bg-gray-100">
                            <div class="h-2 rounded-full transition-all duration-500"
                                [class.bar-signal-up]="item.signal === 'up'"
                                [class.bar-signal-down]="item.signal === 'down'"
                                [class.bar-signal-neutral]="!item.signal || item.signal === 'neutral'"
                                [style.width]="barWidth(item.value)">
                            </div>
                        </div>
                    </div>
                }
            </div>
        </div>
    `,
})
export class BarChartSectionComponent {
    section = input.required<BarChartSection>();

    private maxValue = computed(() => Math.max(...this.section().data.map(d => d.value)));

    barWidth(value: number): string {
        const max = this.maxValue();
        return max === 0 ? '0%' : `${Math.min(100, (value / max) * 100).toFixed(1)}%`;
    }
}
