import { Component, input } from '@angular/core';
import { InlineMarkdownPipe } from '../../chat/inline-markdown.pipe';
import { InsightCardsSection, Signal } from '../message-renderer.types';

/**
 * rustic-report's insight signal styles: pill label, accent (pill text), its RGB for the pill fill,
 * and the left bar — light grey for neutral, which needn't stand out.
 */
const INSIGHT_STYLES: Partial<Record<Signal, { label: string; accent: string; rgb: string; bar: string }>> = {
    up:      { label: 'POSITIVE', accent: '#15803d', rgb: '21, 128, 61',   bar: '#15803d' },
    down:    { label: 'RISK',     accent: '#b91c1c', rgb: '185, 28, 28',   bar: '#b91c1c' },
    neutral: { label: 'WATCH',    accent: '#6b7280', rgb: '107, 114, 128', bar: '#d1d5db' },
};

@Component({
    selector: 'app-insight-cards-section',
    standalone: true,
    imports: [InlineMarkdownPipe],
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
                    @for (card of section().data; track $index; let i = $index) {
                        @let style = styleFor(card.signal);
                        <tr class="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                            <td class="px-1 md:px-3 pt-1.5 pb-4 w-10 text-center align-top"
                                [style.box-shadow]="style ? 'inset 3px 0 0 ' + style.bar : null">
                                <span class="inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold"
                                      [class.bg-emerald-100]="card.signal === 'up'"
                                      [class.text-emerald-700]="card.signal === 'up'"
                                      [class.bg-red-100]="card.signal === 'down'"
                                      [class.text-red-700]="card.signal === 'down'"
                                      [class.bg-gray-100]="!card.signal || card.signal === 'neutral'"
                                      [class.text-gray-600]="!card.signal || card.signal === 'neutral'">
                                    {{ card.number ?? i + 1 }}
                                </span>
                            </td>
                            <td class="px-1 md:px-3 pt-1.5 pb-4 font-medium text-gray-900 align-top">
                                @if (style) {
                                    <span class="mb-1 inline-block rounded px-1.5 py-0.5 text-[11px] font-bold leading-none tracking-wide"
                                          [style.color]="style.accent"
                                          [style.background-color]="'rgba(' + style.rgb + ', 0.2)'">{{ style.label }}</span>
                                    <br>
                                }
                                {{ card.title }}
                            </td>
                            <td class="px-1 md:px-3 pt-1.5 pb-4 text-gray-500 leading-relaxed align-top" [innerHTML]="card.evidence | inlineMarkdown"></td>
                            <td class="px-1 md:px-3 pt-1.5 pb-4 align-top">
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

    /** Pill and tint for a signalled insight; none for older insights without a signal. */
    protected styleFor(signal: Signal | null | undefined) {
        return signal ? INSIGHT_STYLES[signal] ?? null : null;
    }
}
