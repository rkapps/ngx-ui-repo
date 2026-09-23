import { Component, input } from '@angular/core';
import { TableSection, TechnicalsSection, TableCell, TableRow, TableRowInput, TableRowType, ColumnAlign } from '../message-renderer.types';

interface NormalizedRow { cells: TableCell[]; rowType?: TableRowType; }

@Component({
    selector: 'app-table-section',
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
            <div class="px-2 py-2 md:px-6 md:py-5">
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    @if (headers().length) {
                        <thead>
                            <tr class="border-b border-gray-200 bg-gray-50">
                                @for (h of headers(); track $index; let i = $index) {
                                    <th class="px-2 md:px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500"
                                        [class.text-left]="alignFor(i) === 'left'"
                                        [class.text-right]="alignFor(i) === 'right'"
                                        [class.text-center]="alignFor(i) === 'center'">
                                        {{ h }}
                                    </th>
                                }
                            </tr>
                        </thead>
                    }
                    <tbody>
                        @for (row of normalizedRows(); track $index) {
                            <tr class="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors"
                                [class.bg-gray-50]="row.rowType === 'subtotal'">
                                @for (cell of row.cells; track $index; let i = $index) {
                                    <td class="px-2 md:px-3 py-1.5 align-top"
                                        [class.text-left]="alignFor(i) === 'left'"
                                        [class.text-right]="alignFor(i) === 'right'"
                                        [class.text-center]="alignFor(i) === 'center'"
                                        [class.font-semibold]="row.rowType === 'subtotal'"
                                        [class.font-medium]="row.rowType !== 'subtotal' && (cell.signal === 'up' || cell.signal === 'down')"
                                        [class.text-emerald-600]="cell.signal === 'up'"
                                        [class.text-red-600]="cell.signal === 'down'"
                                        [class.text-amber-600]="cell.signal === 'warning'"
                                        [class.text-gray-700]="!cell.signal || cell.signal === 'neutral'">
                                        <div class="inline-flex items-center gap-1 whitespace-nowrap">
                                            @if (cell.indicator === 'arrow') {
                                                <span class="font-bold">{{ cell.signal === 'up' ? '↑' : cell.signal === 'down' ? '↓' : '' }}</span>
                                            }
                                            {{ cell.value }}
                                        </div>
                                        @if (cell.note) {
                                            <div class="font-normal text-gray-500">({{ cell.note }})</div>
                                        }
                                    </td>
                                }
                            </tr>
                        }
                    </tbody>
                    @if (normalizedTotals().length) {
                        <tfoot>
                            @for (row of normalizedTotals(); track $index) {
                                <tr class="border-t-2 border-gray-200 bg-gray-50">
                                    @for (cell of row.cells; track $index; let i = $index) {
                                        <td class="px-2 md:px-3 py-1.5 text-sm font-semibold"
                                            [class.text-left]="alignFor(i) === 'left'"
                                            [class.text-right]="alignFor(i) === 'right'"
                                            [class.text-center]="alignFor(i) === 'center'"
                                            [class.text-emerald-600]="cell.signal === 'up'"
                                            [class.text-red-600]="cell.signal === 'down'"
                                            [class.text-amber-600]="cell.signal === 'warning'"
                                            [class.text-gray-800]="!cell.signal || cell.signal === 'neutral'">
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
    section = input.required<TableSection | TechnicalsSection>();

    isColumnLayout(): boolean {
        const s = this.section();
        return s.type === 'technicals' || s.layout === 'column';
    }

    alignFor(i: number): ColumnAlign {
        const align = this.section().column_align?.[i];
        if (align) return align;
        return (i === 0 || this.isColumnLayout()) ? 'left' : 'right';
    }

    headers(): string[] {
        return this.section().headers ?? [];
    }

    normalizedRows(): NormalizedRow[] {
        return this.normalizeRowSet(this.section().rows);
    }

    normalizedTotals(): NormalizedRow[] {
        const s = this.section();
        return this.normalizeRowSet(s.type === 'table' ? s.totals : undefined);
    }

    private normalizeRowSet(source: TableRowInput[] | undefined): NormalizedRow[] {
        const normalizeCell = (cell: TableCell | string | unknown): TableCell =>
            (cell && typeof cell === 'object' && 'value' in cell)
                ? cell as TableCell
                : { value: String(cell ?? '') };

        return (source ?? []).map(row => {
            if (Array.isArray(row)) {
                return { cells: row.map(normalizeCell) };
            }
            if (row && typeof row === 'object') {
                // Row wrapper: { row_type, cells: [...] }
                if ('cells' in row && Array.isArray((row as TableRow).cells)) {
                    const r = row as TableRow;
                    return { rowType: r.row_type, cells: r.cells.map(normalizeCell) };
                }
                // Single-cell row: { value, note, signal, indicator } — label + data in one object
                if ('value' in row) {
                    const r = row as Record<string, unknown>;
                    return {
                        cells: [
                            { value: String(r['value'] ?? '') },
                            { value: String(r['note'] ?? ''), signal: r['signal'] as TableCell['signal'], indicator: r['indicator'] as TableCell['indicator'] },
                        ],
                    };
                }
                // Keyed-by-header row: { "Metric": "Price", "CRUS": { value, ... } }
                return { cells: Object.values(row).map(normalizeCell) };
            }
            return { cells: [] };
        });
    }

    csvText(): string {
        const toCsv = (val: string) => val.includes(',') ? `"${val.replace(/"/g, '""')}"` : val;
        const lines: string[] = [];
        const h = this.headers();
        if (h.length) lines.push(h.map(toCsv).join(','));
        for (const row of this.normalizedRows()) {
            lines.push(row.cells.map(c => toCsv(c.value)).join(','));
        }
        return lines.join('\n');
    }
}
