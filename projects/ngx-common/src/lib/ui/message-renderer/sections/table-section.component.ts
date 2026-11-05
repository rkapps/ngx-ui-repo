import { Component, computed, input } from '@angular/core';
import { TableSection, TechnicalsSection, TableCell, TableCellInput, TableRow, TableRowInput, TableRowType, ColumnAlign, ReportFormat } from '../message-renderer.types';
import { displayValue } from '../report-format';

/** A row ready to draw: display text in each cell's `value`, the label column first. */
export interface NormalizedRow { cells: TableCell[]; rowType?: TableRowType; }

/** rustic-report's row object: `{ label, format, cells }`. */
const isReportRow = (row: unknown): row is TableRow & { label: string } =>
    !!row && typeof row === 'object' && !Array.isArray(row) && typeof (row as TableRow).label === 'string' && Array.isArray((row as TableRow).cells);

/** True when the rows use rustic-report's `{ label, format, cells }` shape. */
export const isReportTable = (rows: TableRowInput[] | null | undefined): boolean => (rows ?? []).some(isReportRow);

/**
 * A cell with its display text: a bare value or a `{ value, ... }` object. A number is formatted
 * with the cell's format, else the row's (rustic-report); with neither it shows as sent.
 */
function normalizeCell(cell: TableCellInput | unknown, rowFormat?: ReportFormat | null): TableCell {
    if (cell && typeof cell === 'object' && 'value' in cell) {
        const c = cell as TableCell;
        return { ...c, value: displayValue(c.value, c.format ?? rowFormat ?? undefined) };
    }
    return { value: displayValue(cell as string | number | null | undefined, rowFormat ?? undefined) };
}

/**
 * Every row shape — rustic-report's `{ label, format, cells }` and the older ones — as display cells.
 * `formats` are per-column formats (index 0 = label column); a cell's or row's own format wins.
 */
export function normalizeRows(source: TableRowInput[] | null | undefined, formats?: (ReportFormat | null)[] | null): NormalizedRow[] {
    const col = (i: number) => formats?.[i] ?? null;
    return (source ?? []).map(row => {
        if (Array.isArray(row)) {
            return { cells: row.map((c, i) => normalizeCell(c, col(i))) };
        }
        if (row && typeof row === 'object') {
            // rustic-report: { label, format, cells } — the label is the first column.
            if (isReportRow(row)) {
                return { rowType: row.row_type, cells: [{ value: row.label }, ...row.cells.map((c, j) => normalizeCell(c, row.format ?? col(j + 1)))] };
            }
            // Row wrapper: { row_type, cells: [...] }
            if ('cells' in row && Array.isArray((row as TableRow).cells)) {
                const r = row as TableRow;
                return { rowType: r.row_type, cells: r.cells.map((c, i) => normalizeCell(c, col(i))) };
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
            return { cells: Object.values(row).map((c, i) => normalizeCell(c, col(i))) };
        }
        return { cells: [] };
    });
}

/** The table as CSV: headers, then each row's display text. */
export function tableCsv(headers: string[], rows: NormalizedRow[]): string {
    const toCsv = (val: string) => (val.includes(',') ? `"${val.replace(/"/g, '""')}"` : val);
    const lines: string[] = [];
    if (headers.length) lines.push(headers.map(toCsv).join(','));
    for (const row of rows) lines.push(row.cells.map(c => toCsv(String(c.value))).join(','));
    return lines.join('\n');
}

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
                            <tr class="border-b border-gray-200 bg-gray-100">
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
                                            } @else if (cell.indicator === 'dot') {
                                                <span class="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                                                      [class.bg-emerald-500]="cell.signal === 'up'"
                                                      [class.bg-red-500]="cell.signal === 'down'"
                                                      [class.bg-amber-500]="cell.signal === 'warning'"
                                                      [class.bg-gray-400]="!cell.signal || cell.signal === 'neutral'"></span>
                                            }
                                            @if (cell.indicator === 'badge') {
                                                <span class="rounded px-1.5 py-0.5 text-xs font-medium"
                                                      [class.bg-emerald-50]="cell.signal === 'up'"
                                                      [class.bg-red-50]="cell.signal === 'down'"
                                                      [class.bg-amber-50]="cell.signal === 'warning'"
                                                      [class.bg-gray-100]="!cell.signal || cell.signal === 'neutral'">{{ cell.value }}</span>
                                            } @else {
                                                {{ cell.value }}
                                            }
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

    private readonly formats = computed(() => {
        const s = this.section();
        return s.type === 'table' ? s.formats : undefined;
    });
    protected readonly normalizedRows = computed(() => normalizeRows(this.section().rows, this.formats()));
    protected readonly normalizedTotals = computed(() => {
        const s = this.section();
        return normalizeRows(s.type === 'table' ? s.totals : undefined, this.formats());
    });
    protected readonly headers = computed(() => this.section().headers ?? []);

    /**
     * A rustic-report table's numeric columns, for when `align` is missing — the backend adds it
     * after the fact, so a report still streaming in arrives without it. A column is numeric when
     * it has a format or any of its cells holds a number.
     */
    private readonly numericColumns = computed(() => {
        const s = this.section();
        const numeric = new Set<number>();
        if (s.type !== 'table' || !isReportTable(s.rows)) return numeric;
        s.formats?.forEach((f, i) => { if (f) numeric.add(i); });
        const isNum = (c: unknown) =>
            typeof c === 'number' || (!!c && typeof c === 'object' && typeof (c as TableCell).value === 'number');
        for (const row of [...(s.rows ?? []), ...(s.totals ?? [])]) {
            if (isReportRow(row)) row.cells.forEach((c, j) => { if (isNum(c)) numeric.add(j + 1); });
        }
        return numeric;
    });

    /**
     * Column alignment. rustic-report computes `align` (missing entries = left); without it, its
     * numeric columns right and the rest left. Otherwise the older `column_align`, and for older
     * tables without either, label left and values right (all left in column layout).
     */
    protected alignFor(i: number): ColumnAlign {
        const s = this.section();
        const align = s.type === 'table' ? s.align : undefined;
        if (align?.length) return align[i] ?? 'left';
        const legacy = s.column_align?.[i];
        if (legacy) return legacy;
        if (isReportTable(s.rows)) return this.numericColumns().has(i) ? 'right' : 'left';
        return i === 0 || s.type === 'technicals' || s.layout === 'column' ? 'left' : 'right';
    }

    csvText(): string {
        return tableCsv(this.headers(), this.normalizedRows());
    }
}
