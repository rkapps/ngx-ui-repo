import { Component, input } from '@angular/core';
import { InsightCardsSection } from '../message-renderer.types';

@Component({
    selector: 'app-insight-cards-section',
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
            <div class="overflow-x-auto">
            <div class="px-2 py-2 md:px-6 md:py-5">
            <table class="w-full text-sm min-w-[480px]">
                <thead>
                    <tr class="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        <th class="px-1 md:px-3 py-1.5 w-10 text-center">#</th>
                        <th class="px-1 md:px-3 py-1.5 w-[20%]">Insight</th>
                        <th class="px-1 md:px-3 py-1.5 w-[55%]">Evidence</th>
                        <th class="px-1 md:px-3 py-1.5 w-40">Source</th>
                    </tr>
                </thead>
                <tbody>
                    @for (card of section().data; track $index) {
                        <tr class="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                            <td class="px-1 md:px-3 py-1.5 w-10 text-center align-top">
                                <span class="inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold"
                                      [class.bg-emerald-100]="card.signal === 'up'"
                                      [class.text-emerald-700]="card.signal === 'up'"
                                      [class.bg-red-100]="card.signal === 'down'"
                                      [class.text-red-700]="card.signal === 'down'"
                                      [class.bg-gray-100]="!card.signal || card.signal === 'neutral'"
                                      [class.text-gray-600]="!card.signal || card.signal === 'neutral'">
                                    {{ card.number }}
                                </span>
                            </td>
                            <td class="px-1 md:px-3 py-1.5 font-medium text-gray-900 align-top">{{ card.title }}</td>
                            <td class="px-1 md:px-3 py-1.5 text-gray-500 leading-relaxed align-top">{{ card.evidence }}</td>
                            <td class="px-1 md:px-3 py-1.5 align-top">
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
        </div>
    `,
})
export class InsightCardsSectionComponent {
    section = input.required<InsightCardsSection>();
}
