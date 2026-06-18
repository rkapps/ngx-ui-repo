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
            <div class="px-6 py-5">
            <table class="w-full text-sm">
                <thead>
                    <tr class="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        <th class="px-6 py-3 w-8">#</th>
                        <th class="px-4 py-3">Insight</th>
                        <th class="px-4 py-3">Evidence</th>
                        <th class="px-4 py-3 w-40">Source</th>
                    </tr>
                </thead>
                <tbody>
                    @for (card of section().data; track card.number) {
                        <tr class="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                            <td class="px-6 py-3 align-top">
                                <span class="flex h-6 w-6 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-700">
                                    {{ card.number }}
                                </span>
                            </td>
                            <td class="px-4 py-3 font-medium text-gray-900 align-top">{{ card.title }}</td>
                            <td class="px-4 py-3 text-gray-500 leading-relaxed align-top">{{ card.evidence }}</td>
                            <td class="px-4 py-3 align-top">
                                @if (card.source) {
                                    <span class="text-xs font-medium text-primary-500">{{ card.source }}</span>
                                }
                            </td>
                        </tr>
                    }
                </tbody>
            </table>
            </div>
        </div>
    `,
})
export class InsightCardsSectionComponent {
    section = input.required<InsightCardsSection>();
}
