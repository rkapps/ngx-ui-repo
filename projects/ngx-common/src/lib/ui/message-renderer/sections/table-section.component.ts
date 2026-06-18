import { Component, input } from '@angular/core';
import { TableSection, TableCell } from '../message-renderer.types';

@Component({
    selector: 'app-table-section',
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
            <div class="px-6 py-5">
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    @if (headers().length) {
                        <thead>
                            <tr class="border-b border-gray-200 bg-gray-50">
                                @for (h of headers(); track $index; let i = $index) {
                                    <th class="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500"
                                        [class.text-left]="i === 0"
                                        [class.text-right]="i !== 0">
                                        {{ h }}
                                    </th>
                                }
                            </tr>
                        </thead>
                    }
                    <tbody>
                        @for (row of normalizedRows(); track $index) {
                            <tr class="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                                @for (cell of row; track $index; let i = $index) {
                                    <td class="px-3 py-1.5"
                                        [class.text-left]="i === 0"
                                        [class.text-right]="i !== 0"
                                        [class.font-medium]="cell.signal === 'up' || cell.signal === 'down'"
                                        [class.text-emerald-600]="cell.signal === 'up'"
                                        [class.text-red-600]="cell.signal === 'down'"
                                        [class.text-gray-700]="!cell.signal || cell.signal === 'neutral'">
                                        <span class="inline-flex items-center gap-1" [class.justify-end]="i !== 0">
                                            @if (cell.indicator === 'dot') {
                                                <span class="inline-block h-2 w-2 rounded-full flex-shrink-0"
                                                      [class.bg-emerald-500]="cell.signal === 'up'"
                                                      [class.bg-red-500]="cell.signal === 'down'"
                                                      [class.bg-gray-400]="!cell.signal || cell.signal === 'neutral'">
                                                </span>
                                            } @else if (cell.indicator === 'arrow') {
                                                <span class="font-bold">{{ cell.signal === 'up' ? '↑' : cell.signal === 'down' ? '↓' : '' }}</span>
                                            }
                                            {{ cell.value }}
                                        </span>
                                    </td>
                                }
                            </tr>
                        }
                    </tbody>
                    @if (normalizedTotals().length) {
                        <tfoot>
                            @for (row of normalizedTotals(); track $index) {
                                <tr class="border-t-2 border-gray-200 bg-gray-50">
                                    @for (cell of row; track $index; let i = $index) {
                                        <td class="px-3 py-1.5 text-sm font-semibold text-gray-800"
                                            [class.text-left]="i === 0"
                                            [class.text-right]="i !== 0"
                                            [class.text-emerald-600]="cell.signal === 'up'"
                                            [class.text-red-600]="cell.signal === 'down'"
                                            [class.text-gray-400]="cell.signal === 'neutral'">
                                            {{ cell.value }}
                                        </td>
                                    }
                                </tr>
                            }
                        </tfoot>
                    }
                </table>
            </div>
            </div>
        </div>
    `,
})
export class TableSectionComponent {
    section = input.required<TableSection>();

    headers(): string[] {
        return this.section().headers ?? [];
    }

    normalizedRows(): TableCell[][] {
        return this.normalizeRowSet(this.section().rows);
    }

    normalizedTotals(): TableCell[][] {
        return this.normalizeRowSet(this.section().totals);
    }

    private normalizeRowSet(source: TableSection['rows'] | TableSection['totals']): TableCell[][] {
        return (source ?? []).map(row => {
            const cells: unknown[] = Array.isArray(row) ? row
                : (row && typeof row === 'object') ? Object.values(row)
                : [];
            return cells.map(cell =>
                (cell && typeof cell === 'object' && 'value' in cell)
                    ? cell as TableCell
                    : { value: String(cell ?? '') }
            );
        });
    }

    csvText(): string {
        const toCsv = (val: string) => val.includes(',') ? `"${val.replace(/"/g, '""')}"` : val;
        const lines: string[] = [];
        const h = this.headers();
        if (h.length) lines.push(h.map(toCsv).join(','));
        for (const row of this.normalizedRows()) {
            lines.push(row.map(c => toCsv(c.value)).join(','));
        }
        return lines.join('\n');
    }
}
