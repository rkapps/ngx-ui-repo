import type { ReportFormat, TargetItem } from './message-renderer.types';

const num = (value: number, max: number, min = 0) => value.toLocaleString('en-US', { minimumFractionDigits: min, maximumFractionDigits: max });

/** A report number as text, per rustic-report's `Format` (no format = plain number). */
export function formatReportNumber(value: number, format?: ReportFormat): string {
    if (!Number.isFinite(value)) return '—';
    switch (format) {
        case 'integer':
            return num(Math.round(value), 0);
        case 'currency':
            return `${value < 0 ? '-' : ''}$${num(Math.abs(value), 2, 2)}`;
        case 'percent':
            return `${num(value, 2)}%`;
        case 'percent_change':
            return `${value > 0 ? '+' : ''}${num(value, 2)}%`;
        case 'multiple':
            return `${num(value, 2)}x`;
        default:
            return num(value, 3);
    }
}

/** Change from current to target in percentage points, as the backend computes it; null when current is 0. */
export function targetChangePct(item: TargetItem): number | null {
    return item.current !== 0 ? ((item.target - item.current) / Math.abs(item.current)) * 100 : null;
}

/**
 * A section value as text: text as-is; a number formatted only when `format` is set, otherwise
 * exactly as sent — older agents send raw numbers (years, ids) that mustn't gain separators.
 */
export function displayValue(value: string | number | null | undefined, format?: ReportFormat): string {
    if (value == null) return '';
    if (typeof value !== 'number') return String(value);
    return format ? formatReportNumber(value, format) : String(value);
}
