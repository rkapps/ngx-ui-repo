import { Component, input } from '@angular/core';
import { ContextSection } from '../message-renderer.types';

@Component({
    selector: 'app-context-section',
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
                <p class="text-sm text-gray-800 leading-relaxed">{{ section().content }}</p>
            </div>
        </div>
    `,
})
export class ContextSectionComponent {
    section = input.required<ContextSection>();
}
