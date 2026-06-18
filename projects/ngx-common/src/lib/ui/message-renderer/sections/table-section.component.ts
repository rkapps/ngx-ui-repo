import { Component, input } from '@angular/core';
import { TableSection, TableCell } from '../message-renderer.types';
import { TwangTableComponent, TwangTableColumn, TwangTableFooterCell } from 'ngx-twang-ui';

type TableRow = Record<string, TableCell>;

@Component({
    selector: 'app-table-section',
    standalone: true,
    imports: [TwangTableComponent],
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
                <twang-table
                    [rows]="tableRows"
                    [columns]="tableColumns"
                    [footer]="tableFooter"
                    tableMinWidthClass=""
                    [fillContainerWidth]="true">
                </twang-table>
            </div>
        </div>
    `,
})
export class TableSectionComponent {
    section = input.required<TableSection>();

    get tableRows(): TableRow[] {
        return this.section().rows.map(row => {
            const obj: TableRow = {};
            row.forEach((cell, i) => obj[`c${i}`] = cell);
            return obj;
        });
    }

    get tableColumns(): TwangTableColumn<TableRow>[] {
        return this.section().headers.map((header, i) => ({
            id: `c${i}`,
            header,
            align: i === 0 ? 'left' : 'right',
            value: (row: TableRow) => row[`c${i}`]?.value ?? '',
            cellClass: (row: TableRow) => {
                const sig = row[`c${i}`]?.signal;
                if (sig === 'up') return 'text-emerald-600 font-medium';
                if (sig === 'down') return 'text-red-600 font-medium';
                return '';
            },
        }));
    }

    get tableFooter(): TwangTableFooterCell[] {
        const rows = this.section().rows;
        const headers = this.section().headers;
        return headers.map((_, i) => {
            if (i === 0) return { text: 'Total', align: 'left' as const };
            const values = rows.map(row => row[i]?.value ?? '');
            const nums = values.map(v => this.parseAmount(v));
            if (nums.every(n => n !== null)) {
                const sum = nums.reduce((a, b) => a! + b!, 0)!;
                return { text: this.formatAmount(sum, values[0] ?? ''), align: 'right' as const };
            }
            return { text: '—', align: 'right' as const };
        });
    }

    private parseAmount(val: string): number | null {
        if (!val || val === '--' || val === '—') return null;
        if (val.includes('%')) return null;
        const n = parseFloat(val.replace(/[$,]/g, ''));
        return isNaN(n) ? null : n;
    }

    private formatAmount(num: number, sample: string): string {
        const formatted = num.toLocaleString('en-US', { maximumFractionDigits: 2 });
        return sample.trimStart().startsWith('$') ? `$${formatted}` : formatted;
    }
}
