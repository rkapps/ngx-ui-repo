import { Component, input } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { MetricCardsSection } from '../message-renderer.types';

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
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    @for (card of section().data; track card.label) {
                        <div class="rounded-lg border border-gray-200 bg-gray-100 px-4 py-4">
                            <p class="text-base font-medium text-gray-600 mb-2">{{ card.label }}</p>
                            <div class="flex items-center gap-2">
                                <span class="text-3xl font-bold text-gray-900">{{ card.value }}</span>
                                @if (card.status === 'up') {
                                    <lucide-icon name="trending-up" [size]="24" class="signal-icon-up"></lucide-icon>
                                } @else if (card.status === 'down') {
                                    <lucide-icon name="trending-down" [size]="24" class="signal-icon-down"></lucide-icon>
                                }
                            </div>
                            <p class="text-sm text-gray-500 mt-2">vs {{ card.benchmark }}</p>
                        </div>
                    }
                </div>
            </div>
        </div>
    `,
})
export class MetricCardsSectionComponent {
    section = input.required<MetricCardsSection>();
}
