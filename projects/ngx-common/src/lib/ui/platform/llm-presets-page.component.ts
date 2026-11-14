import { Component, computed, DestroyRef, effect, inject, signal, type TemplateRef, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LucideAngularModule } from 'lucide-angular';
import { TwangButtonComponent, TwangTableComponent, type TwangTableColumn } from 'ngx-twang-ui';
import { finalize } from 'rxjs';
import { originLabel } from '../../models/origin';
import { AdminConfigService, byPresetOrder, type LlmParameters, type LlmPreset } from '../../services/admin-config.service';
import { ADMIN_RIGHT_WIDTH } from '../admin-page/admin-layout';
import { PageBreadcrumbs } from '../breadcrumbs/page-breadcrumbs';
import { ThreePanelLayoutComponent } from '../three-panel-layout/three-panel-layout.component';

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

type ParamKey = keyof LlmParameters;

/** `LlmParameters`' fields: label, how a set value shows, and what an import accepts (null = unset). */
const PARAMETER_FIELDS: { key: ParamKey; label: string; align: 'left' | 'right'; text: (v: never) => string; valid: (v: unknown) => boolean; expected: string }[] = [
  { key: 'temperature', label: 'Temperature', align: 'right', text: (v: number) => String(v), valid: v => typeof v === 'number' && Number.isFinite(v), expected: 'a number' },
  { key: 'max_tokens', label: 'Max tokens', align: 'right', text: (v: number) => v.toLocaleString(), valid: v => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 4_294_967_295, expected: 'a whole number' },
  { key: 'reasoning_effort', label: 'Reasoning effort', align: 'left', text: (v: string) => v, valid: v => typeof v === 'string' && !!v, expected: 'a reasoning effort name' },
  { key: 'enable_cache', label: 'Cache', align: 'left', text: (v: boolean) => (v ? 'On' : 'Off'), valid: v => typeof v === 'boolean', expected: 'true or false' },
];

/** A parameter as shown; unset ones show a dash (they fall through to the next level). */
function paramText(params: LlmParameters | null | undefined, field: (typeof PARAMETER_FIELDS)[number]): string {
  const v = params?.[field.key];
  return v == null ? '—' : (field.text as (x: unknown) => string)(v);
}

/** A `parameters` object's problem as a message, or null when it's valid. */
function parametersError(params: Record<string, unknown>): string | null {
  for (const key of Object.keys(params)) {
    const field = PARAMETER_FIELDS.find(f => f.key === key);
    if (!field) return `unknown parameter "${key}" (expected ${PARAMETER_FIELDS.map(f => f.key).join(', ')}).`;
    if (params[key] != null && !field.valid(params[key])) return `parameter "${key}" must be ${field.expected} or null.`;
  }
  return null;
}

/**
 * LLM presets from an import file — `{ "llm_presets": [...] }`, a JSON array, or a single preset —
 * or an error message. Checks `LlmPreset`'s fields and each `LlmParameters` value; the backend
 * still decides which `reasoning_effort` names are valid.
 */
function parsePresets(text: string): LlmPreset[] | string {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return 'The file is not valid JSON.';
  }
  const wrapped = isObject(json) && Array.isArray(json['llm_presets']) ? json['llm_presets'] : json;
  const list = Array.isArray(wrapped) ? wrapped : [wrapped];
  if (!list.length) return 'The file has no presets.';
  for (const [i, p] of list.entries()) {
    const where = `Preset ${i + 1}`;
    if (!isObject(p)) return `${where} is not an object.`;
    if (typeof p['id'] !== 'string' || !p['id']) return `${where} needs an "id".`;
    for (const key of ['summary', 'description']) {
      if (p[key] != null && typeof p[key] !== 'string') return `${where} (${p['id']}): "${key}" must be a string.`;
    }
    if (p['origin'] !== 'system' && p['origin'] !== 'client') return `${where} (${p['id']}): "origin" must be "system" or "client".`;
    if (typeof p['enabled'] !== 'boolean') return `${where} (${p['id']}) needs "enabled" (true/false).`;
    const v = p['version'];
    if (v != null && !(typeof v === 'number' && Number.isInteger(v) && v >= 0)) return `${where} (${p['id']}): "version" must be a whole number or null.`;
    const order = p['sort_order'];
    if (order != null && !(typeof order === 'number' && Number.isInteger(order))) return `${where} (${p['id']}): "sort_order" must be a whole number or null.`;
    if (!isObject(p['parameters'])) return `${where} (${p['id']}) needs a "parameters" object.`;
    const paramError = parametersError(p['parameters']);
    if (paramError) return `${where} (${p['id']}): ${paramError}`;
  }
  return list as LlmPreset[];
}

/** Backend error text (axum returns plain strings), else a fallback. */
function errorText(err: unknown, fallback: string): string {
  const body = (err as { error?: unknown })?.error;
  return typeof body === 'string' && body.trim() ? body : fallback;
}

/**
 * Platform › LLM Presets: every LLM preset (`GET /platform/llm_presets`) in the middle, the
 * selected one with its parameters in the right panel. Import (page header) loads a presets file
 * and posts the list to `/platform/llm_presets/import`.
 */
@Component({
  selector: 'app-llm-presets-page',
  standalone: true,
  imports: [LucideAngularModule, ThreePanelLayoutComponent, TwangButtonComponent, TwangTableComponent],
  template: `
    <app-three-panel-layout
      [showLeft]="false"
      [rightTitle]="selected()?.id || 'Details'"
      storageKey="platform.llm-presets.layout"
      [rightWidth]="rightWidth"
      panelMinHeight="min-h-[70vh]"
    >
      <div middle class="flex flex-1 flex-col overflow-hidden rounded-lg border border-border bg-white">
        <div class="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
          <span class="text-sm font-semibold text-primary-600">LLM Presets</span>
          <span class="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700">{{ presets().length }}</span>
          <twang-button
            class="ml-auto"
            variant="default"
            size="sm"
            icon="refresh-cw"
            ariaLabel="Refresh LLM presets"
            title="Refresh LLM presets"
            [loading]="loading()"
            [disabled]="loading()"
            (buttonClick)="load()"
          />
        </div>
        @if (importError()) {
          <div class="flex shrink-0 items-start gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
            <lucide-icon name="circle-alert" [size]="14" class="mt-0.5 shrink-0" />
            <span class="min-w-0 flex-1 break-words">{{ importError() }}</span>
            <button type="button" class="shrink-0 opacity-70 hover:opacity-100" aria-label="Dismiss" (click)="importError.set(null)">
              <lucide-icon name="x" [size]="14" />
            </button>
          </div>
        }
        <div class="flex min-h-0 flex-1 flex-col">
          @if (error()) {
            <div class="flex flex-1 items-center justify-center p-8 text-sm text-red-600">{{ error() }}</div>
          } @else {
            <twang-table
              [rows]="presets()"
              [columns]="columns"
              [loading]="loading()"
              [fillContainerWidth]="true"
              [onRowClick]="onRowClick"
              [rowClass]="rowClass"
              initialSortKey="sort_order"
              initialSortDir="asc"
              tableMinWidthClass="min-w-[1190px]"
              emptyMessage="No LLM presets yet — use Import to load a presets file."
            />
          }
        </div>
      </div>

      <div right class="flex flex-col gap-4 p-4 text-sm">
        @if (selected(); as p) {
          <dl class="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2">
            <dt class="text-xs text-text-muted">ID</dt>
            <dd class="break-all font-mono text-xs">{{ p.id }}</dd>
            <dt class="text-xs text-text-muted">Status</dt>
            <dd [class.text-red-600]="!p.enabled">{{ p.enabled ? 'Enabled' : 'Disabled' }}</dd>
            <dt class="text-xs text-text-muted">Origin</dt>
            <dd>{{ originLabel(p.origin) }}</dd>
            <dt class="text-xs text-text-muted">Version</dt>
            <dd>{{ p.version ?? '—' }}</dd>
            <dt class="text-xs text-text-muted">Sort order</dt>
            <dd>{{ p.sort_order ?? '—' }}</dd>
          </dl>
          <section class="flex flex-col gap-2 border-t border-border pt-4">
            <span class="text-xs font-semibold uppercase tracking-wider text-primary-600">Summary</span>
            <p class="whitespace-pre-wrap">{{ p.summary || 'None.' }}</p>
          </section>
          <section class="flex flex-col gap-2 border-t border-border pt-4">
            <span class="text-xs font-semibold uppercase tracking-wider text-primary-600">Description</span>
            <p class="whitespace-pre-wrap">{{ p.description || 'None.' }}</p>
          </section>
          <section class="flex flex-col gap-2 border-t border-border pt-4">
            <span class="text-xs font-semibold uppercase tracking-wider text-primary-600">Parameters</span>
            <dl class="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1.5">
              @for (entry of parameterEntries(); track entry.key) {
                <dt class="text-xs text-text-muted">{{ entry.label }}</dt>
                <dd class="font-mono text-xs" [class.text-text-muted]="entry.unset">{{ entry.unset ? 'not set' : entry.value }}</dd>
              }
            </dl>
          </section>
        } @else {
          <p class="text-text-muted">Select a preset to see its details.</p>
        }
      </div>
    </app-three-panel-layout>

    <!-- Rendered in the page header (right side) via PageBreadcrumbs.actions. -->
    <ng-template #headerActions>
      <input #importFile type="file" accept=".json,application/json" class="hidden" (change)="importFrom(importFile)" />
      <twang-button
        variant="primary"
        size="sm"
        icon="upload"
        label="Import"
        title="Import LLM presets ({ &quot;llm_presets&quot;: [...] }, an array, or one preset)"
        [loading]="importing()"
        [disabled]="importing()"
        (buttonClick)="importFile.click()"
      />
    </ng-template>
  `,
})
export class LlmPresetsPageComponent {
  private readonly configService = inject(AdminConfigService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly headerActions = viewChild<TemplateRef<unknown>>('headerActions');

  protected readonly rightWidth = ADMIN_RIGHT_WIDTH;
  protected readonly originLabel = originLabel;

  protected readonly presets = signal<LlmPreset[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly importing = signal(false);
  protected readonly importError = signal<string | null>(null);

  protected readonly selectedId = signal<string | null>(null);
  protected readonly selected = computed(() => this.presets().find(p => p.id === this.selectedId()) ?? null);
  /** Every `LlmParameters` field of the selected preset, set or not. */
  protected readonly parameterEntries = computed(() => {
    const params = this.selected()?.parameters;
    return PARAMETER_FIELDS.map(f => ({ key: f.key, label: f.label, unset: params?.[f.key] == null, value: paramText(params, f) }));
  });

  protected readonly onRowClick = (row: LlmPreset) => this.selectedId.set(row.id);
  protected readonly rowClass = (row: LlmPreset) =>
    [row.id === this.selectedId() ? 'bg-primary-50' : '', row.enabled ? '' : 'opacity-60'].join(' ');

  /** Order, ID, Summary, Status, then one column per `LlmParameters` field (numbers sort as numbers). */
  protected readonly columns: TwangTableColumn<LlmPreset>[] = [
    {
      id: 'sort_order',
      header: 'Order',
      align: 'right',
      sortable: true,
      width: '80px',
      value: p => p.sort_order ?? '—',
      // Unset sorts after every set order.
      sortValue: p => p.sort_order ?? Number.MAX_SAFE_INTEGER,
    },
    { id: 'id', header: 'ID', align: 'left', sortable: true, width: '160px', cellTruncate: true, value: p => p.id },
    { id: 'summary', header: 'Summary', align: 'left', sortable: true, fillRemaining: true, minWidth: '220px', cellTruncate: true, value: p => p.summary ?? '' },
    { id: 'enabled', header: 'Status', align: 'left', sortable: true, width: '100px', value: p => (p.enabled ? 'Enabled' : 'Disabled') },
    ...PARAMETER_FIELDS.map((f): TwangTableColumn<LlmPreset> => ({
      id: f.key,
      header: f.label,
      align: f.align,
      sortable: true,
      width: f.key === 'reasoning_effort' ? '150px' : '120px',
      value: p => paramText(p.parameters, f),
      sortValue: p => {
        const v = p.parameters?.[f.key];
        return v == null ? null : typeof v === 'boolean' ? Number(v) : v;
      },
    })),
  ];

  constructor() {
    const breadcrumbs = inject(PageBreadcrumbs);
    effect(() => breadcrumbs.actions.set(this.headerActions() ?? null));
    // Only drop our actions (not the crumbs): the next page may already have set its own.
    this.destroyRef.onDestroy(() => {
      if (breadcrumbs.actions() === this.headerActions()) breadcrumbs.actions.set(null);
    });

    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.configService
      .getLlmPresets()
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: presets => {
          this.presets.set(presets);
          // Keep the selection if it's still there; otherwise select the first in sort order.
          if (this.selected()) return;
          const first = [...presets].sort(byPresetOrder)[0];
          this.selectedId.set(first?.id ?? null);
        },
        error: err => {
          console.error('Failed to load LLM presets', err);
          this.error.set(errorText(err, 'Failed to load LLM presets.'));
        },
      });
  }

  /** Import the chosen JSON file (`POST /platform/llm_presets/import`), then reload. */
  protected importFrom(input: HTMLInputElement): void {
    const file = input.files?.[0];
    input.value = ''; // so choosing the same file again still fires (change)
    if (!file) return;
    this.importError.set(null);
    file.text().then(text => {
      const parsed = parsePresets(text);
      if (typeof parsed === 'string') {
        this.importError.set(`Couldn't import ${file.name}: ${parsed}`);
        return;
      }
      this.importing.set(true);
      this.configService
        .importLlmPresets(parsed)
        .pipe(
          finalize(() => this.importing.set(false)),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe({
          next: () => this.load(),
          error: err => {
            console.error('Failed to import LLM presets', err);
            this.importError.set(errorText(err, 'Failed to import LLM presets.'));
          },
        });
    });
  }
}
