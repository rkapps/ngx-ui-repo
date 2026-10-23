import { Component, input } from '@angular/core';
import { ProfilesSection } from '../message-renderer.types';

/** rustic-report `profiles`: one card per subject with labelled values — same look as `positioning`. */
@Component({
    selector: 'app-profiles-section',
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
                @for (profile of section().data; track $index) {
                    <div class="rounded-lg border border-gray-200 overflow-hidden">
                        <p class="text-sm font-semibold text-gray-700 bg-gray-100 px-3 py-2">{{ profile.subject }}</p>
                        <div class="flex flex-col gap-1.5 px-3 py-3">
                            @for (item of profile.items; track $index) {
                                <div class="flex items-baseline justify-between gap-2">
                                    <span class="text-sm text-gray-600 shrink-0">{{ item.label }}</span>
                                    <span class="text-sm font-medium text-right"
                                          [class.text-emerald-600]="item.signal === 'up'"
                                          [class.text-red-600]="item.signal === 'down'"
                                          [class.text-gray-700]="!item.signal || item.signal === 'neutral'">
                                        {{ item.value }}
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
export class ProfilesSectionComponent {
    section = input.required<ProfilesSection>();
}
