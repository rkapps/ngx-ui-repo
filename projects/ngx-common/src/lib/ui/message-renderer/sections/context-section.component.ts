import { Component, input } from '@angular/core';
import { ContextSection } from '../message-renderer.types';
import { MarkdownPipe } from '../../chat/markdown.pipe';

@Component({
    selector: 'app-context-section',
    standalone: true,
    imports: [MarkdownPipe],
    template: `
        <div class="rounded-xl border border-gray-200 bg-white overflow-hidden">
            @if (section().title) {
                <div class="px-2 pt-2">
                    <div class="pb-2 border-b-2 border-primary-500">
                        <h3 class="text-lg font-bold text-gray-800">{{ section().title }}</h3>
                    </div>
                </div>
            }
            <div class="px-2 py-2 prose prose-sm max-w-none text-gray-800">
                <div [innerHTML]="section().content | markdown"></div>
            </div>
        </div>
    `,
})
export class ContextSectionComponent {
    section = input.required<ContextSection>();
}
