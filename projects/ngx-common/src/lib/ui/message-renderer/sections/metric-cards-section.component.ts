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
                <div class="px-2 pt-2">
                    <div class="pb-2 border-b-2 border-primary-500">
                        <h3 class="text-lg font-bold text-gray-800">{{ section().title }}</h3>
                    </div>
                </div>
            }
            <div class="px-2 py-2">
                <div class="grid gap-2" style="grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));">
                    @for (card of section().data; track $index) {
                        <div class="rounded-lg border border-gray-200 bg-gray-100 px-3 py-3">
                            <p class="text-xs font-medium text-gray-500 mb-1">{{ card.label }}</p>
                            <span class="text-2xl font-bold text-gray-900">{{ card.value }}</span>
                            @if (card.benchmark || card.status) {
                                <div class="flex items-center gap-1.5 mt-1.5">
                                    @if (card.benchmark) {
                                        <span class="text-xs text-gray-400">vs {{ card.benchmark }}</span>
                                    }
                                    @if (card.status && card.status !== 'neutral') {
                                        <div class="flex items-center gap-0.5 pl-1.5 border-l border-gray-300">
                                            @if (card.status === 'up') {
                                                <lucide-icon name="trending-up" [size]="13" class="text-emerald-500" />
                                            } @else if (card.status === 'down') {
                                                <lucide-icon name="trending-down" [size]="13" class="text-red-500" />
                                            }
                                            @if (card.change || pctDiff(card); as pct) {
                                                <span class="text-xs font-semibold"
                                                      [class.text-emerald-600]="card.status === 'up'"
                                                      [class.text-red-600]="card.status === 'down'">
                                                    {{ pct }}
                                                </span>
                                            }
                                        </div>
                                    }
                                </div>
                            }
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
        if (!card.benchmark) return '';
        const parse = (s: string) => parseFloat(s.replace(/[$,%\s]/g, '').replace(/,/g, ''));
        const val = parse(card.value);
        const bench = parse(card.benchmark);
        if (!bench || isNaN(val) || isNaN(bench)) return '';
        const pct = ((val - bench) / Math.abs(bench)) * 100;
        return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
    }
}
