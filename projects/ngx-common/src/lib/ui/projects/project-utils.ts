import { formatDate } from '@angular/common';

export const DATE_FORMAT = 'MMM d, y, HH:mm';
export const formatWhen = (iso: string | number | null) => (iso ? formatDate(iso, DATE_FORMAT, 'en-US') : '—');

/** Backend error text (axum returns plain strings), else a fallback. */
export function errorText(err: unknown, fallback: string): string {
  const body = (err as { error?: unknown })?.error;
  return typeof body === 'string' && body.trim() ? body : fallback;
}
