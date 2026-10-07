/**
 * Who owns a config record: `system` ones ship with the server (e.g. from `agents.json`),
 * `client` ones were created by a tenant/admin at runtime.
 */
export type Origin = 'system' | 'client';

export const ORIGIN_LABELS: Record<Origin, string> = {
  system: 'System',
  client: 'Client',
};

/** Display label; falls back to the raw value so an unexpected origin still shows. */
export function originLabel(origin: Origin | string | null | undefined): string {
  if (!origin) return '';
  return ORIGIN_LABELS[origin as Origin] ?? origin;
}
