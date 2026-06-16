import { Component, input } from '@angular/core';
import { EconomicSignalsSection } from '../message-renderer.types';

@Component({
    selector: 'app-economic-signals-section',
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
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    @for (item of section().data; track item.label) {
                        <div class="rounded-lg border border-gray-100 bg-gray-50 px-3 py-3">
                            <div class="flex items-start justify-between gap-1 mb-1">
                                <p class="text-xs text-gray-400 leading-snug">{{ item.label }}</p>
                                @if (item.signal === 'up') {
                                    <span class="shrink-0 text-xs font-semibold signal-up">↑</span>
                                } @else if (item.signal === 'down') {
                                    <span class="shrink-0 text-xs font-semibold signal-down">↓</span>
                                }
                            </div>
                            <p class="text-lg font-semibold text-gray-900">{{ item.value }}</p>
                            <div class="flex items-center gap-1.5 mt-1">
                                @if (item.date) {
                                    <span class="text-xs text-gray-400">{{ item.date }}</span>
                                }
                                @if (item.source) {
                                    <span class="text-xs text-gray-300">·</span>
                                    <span class="text-xs text-gray-400">{{ item.source }}</span>
                                }
                            </div>
                        </div>
                    }
                </div>
            </div>
        </div>
    `,
})
export class EconomicSignalsSectionComponent {
    section = input.required<EconomicSignalsSection>();
}
