import type { Rating, ReportFormat, TargetItem } from './message-renderer.types';

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

/**
 * A dollar amount abbreviated for a headline (metric cards): $192.0M, $16.9M, $7.5K, $1.3B.
 * Under $1,000 it shows in full with cents.
 */
export function formatCompactCurrency(value: number): string {
    if (!Number.isFinite(value)) return '—';
    const abs = Math.abs(value);
    const sign = value < 0 ? '-' : '';
    const units: [number, string][] = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
    for (let i = 0; i < units.length; i++) {
        const [size, suffix] = units[i];
        if (abs < size) continue;
        const text = (abs / size).toFixed(1);
        // Rounding can carry into the unit above (999,950 → 1000.0K): show that unit instead.
        if (text === '1000.0' && i > 0) return `${sign}$1.0${units[i - 1][1]}`;
        return `${sign}$${text}${suffix}`;
    }
    return `${sign}$${num(abs, 2, 2)}`;
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

/** A rating's score as text: two decimals on a narrow scale (sentiment 0–1), one on a wider one (stars 0–5). */
export function ratingScore(rating: Rating): string {
    const span = rating.max_rating - (rating.min_rating ?? 0);
    return span <= 2 ? rating.rating.toFixed(2) : rating.rating.toFixed(1);
}

/** How much of the gauge's arc a rating fills, 0–1, from `min_rating` (default 0) to `max_rating`. */
export function ratingFill(rating: Rating): number {
    const min = rating.min_rating ?? 0;
    const span = rating.max_rating - min;
    return span > 0 ? Math.min(1, Math.max(0, (rating.rating - min) / span)) : 0;
}
