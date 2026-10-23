import { Component, input } from '@angular/core';
import { TargetItem, TargetsSection } from '../message-renderer.types';
import { formatReportNumber, targetChangePct } from '../report-format';

/**
 * rustic-report `targets`: current value against a target per subject (price targets, quota,
 * budget) — same look as `price_targets`, but values use the section's `format` and the change is
 * computed here (the report doesn't carry it).
 */
@Component({
    selector: 'app-targets-section',
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
            <div class="px-2 md:px-6 py-1">
                @for (item of section().data; track $index) {
                    @let change = targetChangePct(item);
                    <div class="flex items-center gap-3 py-2.5 border-b border-gray-100 last:border-0">
                        <span class="w-28 shrink-0 truncate text-sm font-semibold text-gray-800" [title]="item.subject">{{ item.subject }}</span>
                        <div class="flex-1 min-w-0">
                            <div class="flex justify-between text-xs mb-1">
                                <span class="text-gray-500">{{ format(item.current) }}</span>
                                <span class="text-gray-900 font-medium">{{ format(item.target) }}</span>
                            </div>
                            <div class="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden flex">
                                @if ((change ?? 0) >= 0) {
                                    <div class="h-full bg-primary-500" [style.width.%]="fillPct(item)"></div>
                                    <div class="h-full bg-emerald-300" [style.width.%]="100 - fillPct(item)"></div>
                                } @else {
                                    <div class="h-full w-full bg-red-500"></div>
                                }
                            </div>
                        </div>
                        <div class="shrink-0 flex items-baseline gap-2 text-xs w-32 justify-end">
                            @if (change !== null) {
                                <span class="font-semibold"
                                      [class.text-emerald-600]="change >= 0"
                                      [class.text-red-600]="change < 0">
                                    {{ change >= 0 ? '+' : '' }}{{ change.toFixed(1) }}%
                                </span>
                            }
                            @if (item.label) {
                                <span class="truncate text-gray-500" [title]="item.label">{{ item.label }}</span>
                            }
                        </div>
                    </div>
                }
            </div>
        </div>
    `,
})
export class TargetsSectionComponent {
    section = input.required<TargetsSection>();

    protected readonly targetChangePct = targetChangePct;

    format(value: number): string {
        return formatReportNumber(value, this.section().format);
    }

    /** How far the current value is toward the target, on a scale of the larger of the two. */
    fillPct(item: TargetItem): number {
        const max = Math.max(Math.abs(item.current), Math.abs(item.target)) || 1;
        return Math.min(100, (Math.abs(item.current) / max) * 100);
    }
}
