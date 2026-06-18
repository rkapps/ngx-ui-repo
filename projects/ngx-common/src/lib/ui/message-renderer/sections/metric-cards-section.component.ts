import { Component, input } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { MetricCard, MetricCardsSection } from '../message-renderer.types';

@Component({
    selector: 'app-metric-cards-section',
    standalone: true,
    imports: [LucideAngularModule],
    template: `
        <div class="rounded-xl border border-gray-200 bg-white overflow-hidden">
            @if (section().title) {
                <div class="px-6 pt-3">
                    <div class="pb-4 border-b-2 border-primary-500">
                        <h3 class="text-lg font-bold text-gray-800">{{ section().title }}</h3>
                    </div>
                </div>
            }
            <div class="px-6 py-5">
                <div class="grid gap-3" style="grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));">
                    @for (card of section().data; track card.label) {
                        <div class="rounded-lg border border-gray-200 bg-gray-100 px-4 py-4">
                            <p class="text-base font-medium text-gray-600 mb-2">{{ card.label }}</p>
                            <span class="text-3xl font-bold text-gray-900">{{ card.value }}</span>
                            <div class="flex items-center gap-2 mt-2">
                                <span class="text-sm text-gray-500">vs {{ card.benchmark }}</span>
                                <div class="flex items-center gap-1 pl-2 border-l border-gray-300">
                                    @if (card.status === 'up') {
                                        <lucide-icon name="trending-up" [size]="16" class="text-emerald-500" />
                                    } @else if (card.status === 'down') {
                                        <lucide-icon name="trending-down" [size]="16" class="text-red-500" />
                                    }
                                    @if (pctDiff(card); as pct) {
                                        <span class="text-base font-semibold"
                                              [class.text-emerald-600]="card.status === 'up'"
                                              [class.text-red-600]="card.status === 'down'">
                                            {{ pct }}
                                        </span>
                                    }
                                </div>
                            </div>
                        </div>
                    }
                </div>
            </div>
        </div>
    `,
})
export class MetricCardsSectionComponent {
    section = input.required<MetricCardsSection>();

    pctDiff(card: MetricCard): string {
        const parse = (s: string) => parseFloat(s.replace(/[$,%\s]/g, '').replace(/,/g, ''));
        const val = parse(card.value);
        const bench = parse(card.benchmark);
        if (!bench || isNaN(val) || isNaN(bench)) return '';
        const pct = ((val - bench) / Math.abs(bench)) * 100;
        return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
    }
}
