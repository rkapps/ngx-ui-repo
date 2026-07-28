import { Component, input } from '@angular/core';
import { PriceTargetItem, PriceTargetsSection } from '../message-renderer.types';

@Component({
    selector: 'app-price-targets-section',
    standalone: true,
    template: `
        <div class="rounded-xl border border-gray-200 bg-white overflow-hidden">
            @if (section().title) {
                <div class="px-2 md:px-6 pt-2">
                    <div class="pb-2 border-b-2 border-primary-500">
                        <h3 class="text-lg font-bold text-gray-800">{{ section().title }}</h3>
                    </div>
                </div>
            }
            <div class="px-2 md:px-6 py-1">
                @for (item of section().data; track item.symbol) {
                    <div class="flex items-center gap-3 py-2.5 border-b border-gray-100 last:border-0">
                        <span class="w-12 shrink-0 text-sm font-semibold text-gray-800">{{ item.symbol }}</span>
                        <div class="flex-1 min-w-0">
                            <div class="flex justify-between text-xs mb-1">
                                <span class="text-gray-500">{{ formatPrice(item.current) }}</span>
                                <span class="text-gray-900 font-medium">{{ formatPrice(item.target) }}</span>
                            </div>
                            <div class="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden flex">
                                @if (item.upside >= 0) {
                                    <div class="h-full bg-primary-500" [style.width.%]="fillPct(item)"></div>
                                    <div class="h-full bg-emerald-300" [style.width.%]="100 - fillPct(item)"></div>
                                } @else {
                                    <div class="h-full w-full bg-red-500"></div>
                                }
                            </div>
                        </div>
                        <div class="shrink-0 flex items-baseline gap-2 text-xs w-24 justify-end">
                            <span class="font-semibold"
                                  [class.text-emerald-600]="item.upside >= 0"
                                  [class.text-red-600]="item.upside < 0">
                                {{ item.upside >= 0 ? '+' : '' }}{{ item.upside.toFixed(1) }}%
                            </span>
                            @if (item.consensus) {
                                <span class="text-gray-500">{{ item.consensus }}</span>
                            }
                        </div>
                    </div>
                }
            </div>
        </div>
    `,
})
export class PriceTargetsSectionComponent {
    section = input.required<PriceTargetsSection>();

    private scaleMax(item: PriceTargetItem): number {
        return Math.max(item.current, item.target) || 1;
    }

    fillPct(item: PriceTargetItem): number {
        return Math.min(100, (item.current / this.scaleMax(item)) * 100);
    }

    formatPrice(value: number): string {
        return `$${value.toFixed(2)}`;
    }
}
