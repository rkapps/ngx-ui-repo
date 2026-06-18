import { Component, input } from '@angular/core';
import { ConsumerBuzzSection } from '../message-renderer.types';

@Component({
    selector: 'app-consumer-buzz-section',
    standalone: true,
    template: `
        <div class="rounded-xl border border-gray-200 bg-white overflow-hidden">
            @if (section().title) {
                <div class="px-6 pt-2">
                <div class="pb-2 border-b-2 border-primary-500">
                    <h3 class="text-lg font-bold text-gray-800">{{ section().title }}</h3>
                </div>
            </div>
            }
            <div class="px-6 py-5 space-y-4">
                @if (section().sentiment.length) {
                    <div class="space-y-2">
                        @for (item of section().sentiment; track $index) {
                            <div class="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
                                <div class="flex-1 min-w-0">
                                    <div class="flex items-center gap-2">
                                        <span class="text-sm font-medium text-gray-900 truncate">{{ item.source }}</span>
                                        @if (item.signal === 'up') {
                                            <span class="text-xs font-semibold signal-up">{{ item.rating }}</span>
                                        } @else if (item.signal === 'down') {
                                            <span class="text-xs font-semibold signal-down">{{ item.rating }}</span>
                                        } @else {
                                            <span class="text-xs font-semibold text-gray-500">{{ item.rating }}</span>
                                        }
                                    </div>
                                    @if (item.theme) {
                                        <p class="text-xs text-gray-400 mt-0.5">{{ item.theme }}</p>
                                    }
                                </div>
                            </div>
                        }
                    </div>
                }
                @if (section().related_searches?.length) {
                    <div>
                        <p class="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Related searches</p>
                        <div class="flex flex-wrap gap-1.5">
                            @for (term of section().related_searches; track term) {
                                <span class="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-600">
                                    {{ term }}
                                </span>
                            }
                        </div>
                    </div>
                }
            </div>
        </div>
    `,
})
export class ConsumerBuzzSectionComponent {
    section = input.required<ConsumerBuzzSection>();
}
