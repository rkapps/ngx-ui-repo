import { Component, input } from '@angular/core';
import { PositioningSection } from '../message-renderer.types';

@Component({
    selector: 'app-positioning-section',
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
            <div class="px-2 py-2 md:px-6 md:py-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                @for (item of section().data; track item.symbol) {
                    <div class="rounded-lg border border-gray-100 bg-gray-50 px-3 py-3">
                        <p class="text-xs font-semibold text-gray-700 mb-2">{{ item.symbol }}</p>
                        <div class="flex flex-col gap-1.5">
                            @for (theme of item.themes; track theme.label) {
                                <div class="flex items-baseline justify-between gap-2">
                                    <span class="text-xs text-gray-600 shrink-0">{{ theme.label }}</span>
                                    <span class="text-xs font-medium text-right"
                                          [class.text-emerald-600]="theme.signal === 'up'"
                                          [class.text-red-600]="theme.signal === 'down'"
                                          [class.text-amber-600]="theme.signal === 'warning'"
                                          [class.text-gray-700]="!theme.signal || theme.signal === 'neutral'">
                                        {{ theme.value }}
                                    </span>
                                </div>
                            }
                        </div>
                    </div>
                }
            </div>
        </div>
    `,
})
export class PositioningSectionComponent {
    section = input.required<PositioningSection>();
}
