import { Component, input } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { MetricCard, MetricCardsSection, Signal } from '../message-renderer.types';
import { displayValue, formatReportNumber } from '../report-format';

@Component({
    selector: 'app-metric-cards-section',
    standalone: true,
    imports: [LucideAngularModule],
    template: `
        <div class="rounded-xl border border-gray-200 bg-white overflow-hidden">
            @if (section().title) {
                <div class="px-2 md:px-6 pt-2">
                    <div class="pb-2 border-b-2 border-primary-500">
                        <h3 class="text-lg font-bold text-gray-800">{{ section().title }}</h3>
                    </div>
                </div>
            }
            <div class="px-2 py-2 md:px-6 md:py-5">
                <div class="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-2">
                    @for (card of section().data; track $index) {
                        @let sig = signal(card);
                        @let change = showChange(card) ? changeText(card) : '';
                        <div class="rounded-lg border border-gray-200 bg-gray-100 px-3 py-3">
                            <p class="text-xs font-medium text-gray-500 mb-1">{{ card.label }}</p>
                            <span class="text-2xl font-bold text-gray-900">{{ valueText(card) }}</span>
                            @if (card.benchmark || change || (sig && sig !== 'neutral')) {
                                <div class="flex items-center gap-1.5 mt-1.5">
                                    @if (card.benchmark) {
                                        <span class="text-xs text-gray-500">vs {{ card.benchmark }}</span>
                                    }
                                    @if (change || (sig && sig !== 'neutral')) {
                                        <div class="flex items-center gap-0.5" [class]="card.benchmark ? 'pl-1.5 border-l border-gray-300' : ''">
                                            @if (sig === 'up') {
                                                <lucide-icon name="trending-up" [size]="13" class="text-emerald-500" />
                                            } @else if (sig === 'down') {
                                                <lucide-icon name="trending-down" [size]="13" class="text-red-500" />
                                            }
                                            @if (change) {
                                                <span class="text-xs font-semibold"
                                                      [class.text-emerald-600]="sig === 'up'"
                                                      [class.text-red-600]="sig === 'down'"
                                                      [class.text-gray-600]="sig !== 'up' && sig !== 'down'">
                                                    {{ change }}
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

    /** rustic-report's `signal`, or the older `status`. */
    signal(card: MetricCard): Signal | undefined {
        return card.signal ?? card.status;
    }

    valueText(card: MetricCard): string {
        return displayValue(card.value, card.format);
    }

    /**
     * A numeric `change` (rustic-report) always shows; an older text `change` (or one derived from
     * the benchmark) only beside a non-neutral status, as before.
     */
    showChange(card: MetricCard): boolean {
        if (typeof card.change === 'number') return true;
        const sig = this.signal(card);
        return !!sig && sig !== 'neutral';
    }

    changeText(card: MetricCard): string {
        if (typeof card.change === 'number') return formatReportNumber(card.change, card.change_format ?? 'percent_change');
        return card.change || this.pctDiff(card);
    }

    /** Older cards: the value's difference from a numeric benchmark, when both parse. */
    pctDiff(card: MetricCard): string {
        if (!card.benchmark) return '';
        const parse = (s: string | number) => (typeof s === 'number' ? s : parseFloat(s.replace(/[$,%\s]/g, '')));
        const val = parse(card.value);
        const bench = parse(card.benchmark);
        if (!bench || isNaN(val) || isNaN(bench)) return '';
        const pct = ((val - bench) / Math.abs(bench)) * 100;
        return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
    }
}
