import { Component, input } from '@angular/core';
import { InsightCardsSection } from '../message-renderer.types';

@Component({
    selector: 'app-insight-cards-section',
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
            <div class="px-6 py-5 space-y-2">
                @for (card of section().data; track card.number) {
                    <div class="flex gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-3">
                        <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-700">
                            {{ card.number }}
                        </span>
                        <div>
                            <p class="text-sm font-medium text-gray-900">{{ card.title }}</p>
                            <p class="text-xs text-gray-500 mt-0.5 leading-relaxed">{{ card.evidence }}</p>
                            @if (card.source) {
                                <p class="text-xs text-primary-500 mt-1 font-medium">{{ card.source }}</p>
                            }
                        </div>
                    </div>
                }
            </div>
        </div>
    `,
})
export class InsightCardsSectionComponent {
    section = input.required<InsightCardsSection>();
}
