import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, DestroyRef, effect, inject, linkedSignal, signal, type TemplateRef, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import {
  TwangButtonComponent,
  TwangInputComponent,
  TwangTreeTableComponent,
  type TwangTreeTableColumn,
  type TwangTreeTableNode,
} from 'ngx-twang-ui';
import { finalize } from 'rxjs';
import { AdminConfigService, type ModelConfig, type ProviderConfig } from '../../services/admin-config.service';
import { ADMIN_RIGHT_WIDTH, ADMIN_TABLE_HEIGHT } from '../admin-page/admin-layout';
import { PageBreadcrumbs } from '../breadcrumbs/page-breadcrumbs';
import { ThreePanelLayoutComponent } from '../three-panel-layout/three-panel-layout.component';
import { CONFIG_LAYOUT_KEY } from './config-sections';
import { RefreshCacheButtonComponent } from './refresh-cache-button.component';

type StatusView = 'enabled' | 'disabled';

/** One tree row: a provider (`model` null) or one of its models. */
interface ProviderRow {
  provider: ProviderConfig;
  model: ModelConfig | null;
}

const providerNodeId = (p: ProviderConfig) => `provider:${p.id}`;
const modelNodeId = (p: ProviderConfig, m: ModelConfig) => `model:${p.id}:${m.id}`;

const cost = (v: number) => (v ? `$${v}` : '—');

type CostKey = 'input_cost' | 'cached_read_cost' | 'cached_write_cost' | 'output_cost';
/** `step`: spin-button increment — coarser for input/output prices, finer for the (smaller) cache prices. */
const COST_FIELDS: { key: CostKey; label: string; step: string }[] = [
  { key: 'input_cost', label: 'Input', step: '0.05' },
  { key: 'cached_read_cost', label: 'Cache read', step: '0.01' },
  { key: 'cached_write_cost', label: 'Cache write', step: '0.01' },
  { key: 'output_cost', label: 'Output', step: '0.05' },
];

/** A model while it's edited: costs stay as typed text (so "0." or "1.50" survive), converted on save. */
type ModelDraft = Omit<ModelConfig, CostKey> & Record<CostKey, string>;

const blankModel = (): ModelDraft => ({ id: '', enabled: true, input_cost: '0', cached_read_cost: '0', cached_write_cost: '0', output_cost: '0' });
const toDraft = (m: ModelConfig): ModelDraft => ({
  ...m,
  input_cost: String(m.input_cost),
  cached_read_cost: String(m.cached_read_cost),
  cached_write_cost: String(m.cached_write_cost),
  output_cost: String(m.output_cost),
});

/** Non-negative decimal: "3", "0.5", ".5", "1." — blank counts as 0. */
const DECIMAL = /^(\d+\.?\d*|\.\d+)$/;
const parseCost = (text: string): number | null => {
  const t = text.trim();
  if (!t) return 0;
  return DECIMAL.test(t) ? Number(t) : null;
};

/** The draft as a ModelConfig, or null while any cost isn't a valid decimal. */
function fromDraft(d: ModelDraft): ModelConfig | null {
  const input = parseCost(d.input_cost);
  const cachedRead = parseCost(d.cached_read_cost);
  const cachedWrite = parseCost(d.cached_write_cost);
  const output = parseCost(d.output_cost);
  if (input === null || cachedRead === null || cachedWrite === null || output === null) return null;
  return { id: d.id, enabled: d.enabled, input_cost: input, cached_read_cost: cachedRead, cached_write_cost: cachedWrite, output_cost: output };
}

const sameModel = (a: ModelConfig, b: ModelConfig) =>
  a.id === b.id && a.enabled === b.enabled && COST_FIELDS.every(c => a[c.key] === b[c.key]);

/** Backend error text (axum returns plain strings), else a fallback. */
function errorText(err: unknown, fallback: string): string {
  const body = (err as { error?: unknown })?.error;
  return typeof body === 'string' && body.trim() ? body : fallback;
}

/**
 * Admin > Config > Providers: read-only view of every LLM provider configuration. The middle
 * tree lists providers with their models (and costs) as children; selecting either shows the
 * provider's settings in the right panel (the first provider is selected on load).
 */
@Component({
  selector: 'app-config-providers',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, NgTemplateOutlet, RefreshCacheButtonComponent, ThreePanelLayoutComponent, TwangButtonComponent, TwangInputComponent, TwangTreeTableComponent],
  template: `
    <app-three-panel-layout
      [showLeft]="false"
      [rightTitle]="selected()?.provider?.llm ?? 'Details'"
      [storageKey]="layoutKey"
      [rightWidth]="rightWidth"
      panelMinHeight="min-h-[70vh]"
    >

      <div middle class="flex flex-1 flex-col overflow-hidden rounded-lg border border-border bg-white">
        <div class="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
          <span class="text-sm font-semibold text-primary-600">Providers</span>
          <span class="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700">{{ visibleProviders().length }}</span>
          <twang-button
            class="ml-auto"
            variant="default"
            size="sm"
            [icon]="statusView() === 'enabled' ? 'toggle-right' : 'toggle-left'"
            [ariaLabel]="statusView() === 'enabled' ? 'Showing enabled — show disabled' : 'Showing disabled — show enabled'"
            [title]="statusView() === 'enabled' ? 'Showing enabled — click to show disabled' : 'Showing disabled — click to show enabled'"
            (buttonClick)="setStatusView(statusView() === 'enabled' ? 'disabled' : 'enabled')"
          />
          <twang-button
            variant="default"
            size="sm"
            icon="refresh-cw"
            ariaLabel="Refresh providers"
            title="Refresh providers"
            [loading]="loading()"
            [disabled]="loading()"
            (buttonClick)="load()"
          />
        </div>
        <div class="flex min-h-0 flex-1 flex-col">
          @if (error()) {
            <div class="flex flex-1 items-center justify-center p-8 text-sm text-red-600">{{ error() }}</div>
          } @else {
            <twang-tree-table
              [nodes]="nodes()"
              [columns]="columns"
              [loading]="loading()"
              [fillContainerWidth]="true"
              [selectedId]="selectedNodeId()"
              [initialExpandedDepth]="0"
              [scrollPanelMaxHeight]="treeHeight"
              [scrollPanelMinHeight]="treeHeight"
              initialSortKey="name"
              initialSortDir="asc"
              tableMinWidthClass="min-w-[940px]"
              emptyMessage="No providers configured."
              (nodeSelected)="onNodeSelected($event)"
            />
          }
        </div>
      </div>

      <!-- Right: acts on the tree selection. Provider → enable/disable, add a model. Model → edit, delete.
           Every change saves the whole provider (PUT /admin/providers/{id}). -->
      <div right class="flex flex-col gap-4 p-4 text-sm">
        @if (saveError()) {
          <div class="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
            <lucide-icon name="circle-alert" [size]="14" class="mt-0.5 shrink-0" />
            <span class="min-w-0 flex-1 break-words">{{ saveError() }}</span>
          </div>
        }

        @if (selected(); as s) {
          @if (modelForm(); as f) {
            <!-- Selected model: edit in place -->
            <section class="flex flex-col gap-3">
              <div class="flex items-center gap-2">
                <span class="min-w-0 flex-1 break-all font-mono text-xs font-medium">{{ f.id }}</span>
                @if (f.id === s.provider.default_model) {
                  <span class="rounded bg-primary-50 px-1.5 py-0.5 text-[10px] uppercase text-primary-700">default</span>
                }
              </div>
              <ng-container *ngTemplateOutlet="modelFields; context: { $implicit: f, patch: patchModel, defaultModel: f.id === s.provider.default_model }" />
              <div class="flex items-center gap-2 border-t border-border pt-3">
                @if (confirmDelete()) {
                  <span class="flex-1 text-xs text-red-700">Delete this model?</span>
                  <twang-button variant="default" size="sm" label="Cancel" [disabled]="saving()" (buttonClick)="confirmDelete.set(false)" />
                  <twang-button variant="destructive" size="sm" icon="trash-2" label="Delete" [loading]="saving()" [disabled]="saving()" (buttonClick)="deleteModel(s.provider, f.id)" />
                } @else {
                  <twang-button
                    variant="default"
                    size="sm"
                    icon="trash-2"
                    ariaLabel="Delete model"
                    [title]="f.id === s.provider.default_model ? 'The default model cannot be deleted' : 'Delete model'"
                    [disabled]="saving() || f.id === s.provider.default_model"
                    (buttonClick)="confirmDelete.set(true)"
                  />
                  <twang-button class="ml-auto" variant="default" size="sm" label="Reset" [disabled]="saving() || !modelDirty()" (buttonClick)="resetModel()" />
                  <twang-button
                    variant="primary"
                    size="sm"
                    label="Save"
                    [loading]="saving()"
                    [disabled]="saving() || !modelDirty() || !draftValid(f)"
                    (buttonClick)="saveModel(s.provider)"
                  />
                }
              </div>
            </section>
          } @else {
            <!-- Selected provider: enable/disable, add a model -->
            <div class="flex items-center gap-2">
              <twang-button
                variant="default"
                size="sm"
                [icon]="s.provider.enabled ? 'toggle-right' : 'toggle-left'"
                [label]="s.provider.enabled ? 'Enabled' : 'Disabled'"
                [title]="s.provider.enabled ? 'Enabled — click to disable this provider' : 'Disabled — click to enable this provider'"
                [loading]="saving()"
                [disabled]="saving()"
                (buttonClick)="toggleProvider(s.provider)"
              />
              @if (addingTo()?.id !== s.provider.id) {
                <twang-button class="ml-auto" variant="primary" size="sm" icon="plus" label="Add model" [disabled]="saving()" (buttonClick)="startAdd(s.provider)" />
              }
            </div>
            <!-- Same label width as the cost fields, so the two line up. -->
            <dl class="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 border-t border-border pt-4">
              <dt class="text-xs text-text-muted">ID</dt>
              <dd class="break-all font-mono text-xs">{{ s.provider.id }}</dd>
              <dt class="text-xs text-text-muted">Status</dt>
              <dd [class.text-red-600]="!s.provider.enabled">{{ s.provider.enabled ? 'Enabled' : 'Disabled' }}</dd>
              <dt class="text-xs text-text-muted">Default model</dt>
              <dd class="break-all">{{ s.provider.default_model || '—' }}</dd>
              <dt class="text-xs text-text-muted">Models</dt>
              <dd>{{ enabledCount(s.provider) }} of {{ s.provider.models.length }} enabled</dd>
              <dt class="text-xs text-text-muted">API key env</dt>
              <dd class="break-all font-mono text-xs">{{ s.provider.api_key_env ?? '—' }}</dd>
              <dt class="text-xs text-text-muted">Base URL env</dt>
              <dd class="break-all font-mono text-xs">{{ s.provider.base_url_env ?? '—' }}</dd>
            </dl>

            <!-- New model: added below the provider's details (Add model opens it). -->
            @if (addingTo()?.id === s.provider.id) {
              <section class="flex flex-col gap-3 border-t border-border pt-4">
                <span class="text-xs font-semibold uppercase tracking-wider text-primary-600">New model</span>
                <div class="flex flex-col gap-1.5">
                  <label class="text-xs font-medium text-text-muted">Model id</label>
                  <twang-input placeholder="Model Id/Name" [mono]="true" [ngModel]="newModel().id" (ngModelChange)="patchNewModel({ id: $event.trim() })" />
                  @if (newModelIdError(); as err) {
                    <span class="text-xs text-red-600">{{ err }}</span>
                  }
                </div>
                <ng-container *ngTemplateOutlet="modelFields; context: { $implicit: newModel(), patch: patchNewModel, defaultModel: false }" />
                <div class="flex items-center justify-end gap-2 border-t border-border pt-3">
                  <twang-button variant="default" size="sm" label="Cancel" [disabled]="saving()" (buttonClick)="cancelAdd()" />
                  <twang-button
                    variant="primary"
                    size="sm"
                    icon="plus"
                    label="Add model"
                    [loading]="saving()"
                    [disabled]="saving() || !newModel().id || !!newModelIdError() || !draftValid(newModel())"
                    (buttonClick)="addModel(s.provider)"
                  />
                </div>
              </section>
            }
          }
        } @else {
          <p class="text-text-muted">Select a provider to see its configuration.</p>
        }
      </div>

      <!-- Enabled + the four costs, shared by the model editor and the new-model form. -->
      <ng-template #modelFields let-m let-patch="patch" let-defaultModel="defaultModel">
        <!-- Same toggle as the provider's; here it only changes the form (Save applies it). -->
        <twang-button
          class="self-start"
          variant="default"
          size="sm"
          [icon]="m.enabled ? 'toggle-right' : 'toggle-left'"
          [label]="m.enabled ? 'Enabled' : 'Disabled'"
          [title]="defaultModel ? 'The default model must stay enabled' : m.enabled ? 'Enabled — click to disable' : 'Disabled — click to enable'"
          [disabled]="defaultModel"
          (buttonClick)="patch({ enabled: !m.enabled })"
        />
        <section class="flex flex-col gap-2 border-t border-border pt-3">
          <span class="text-xs font-semibold uppercase tracking-wider text-primary-600">Cost</span>
          <div class="grid grid-cols-[7rem_1fr] items-center gap-x-3 gap-y-2">
            @for (c of costFields; track c.key) {
              <label class="text-xs text-text-muted">{{ c.label }}</label>
              <!-- Spin buttons step per field (see COST_FIELDS) from 0. The value is kept as typed text ("0." survives) until save. -->
              <twang-input
                type="number"
                [step]="c.step"
                min="0"
                placeholder="0"
                [class]="costInvalid(m, c.key) ? '[&_input]:border-red-500' : ''"
                [ngModel]="m[c.key]"
                (ngModelChange)="patch(costPatch(c.key, $event))"
              />
            }
          </div>
          @if (!draftValid(m)) {
            <span class="text-xs text-red-600">Costs must be non-negative decimal numbers, e.g. 3 or 0.75.</span>
          }
        </section>
      </ng-template>
    </app-three-panel-layout>

    <!-- Rendered in the admin header (right side) via PageBreadcrumbs.actions. -->
    <ng-template #headerActions>
      <app-refresh-cache-button (refreshed)="load()" />
    </ng-template>
  `,
})
export class ConfigProvidersComponent {
  private readonly configService = inject(AdminConfigService);
  private readonly destroyRef = inject(DestroyRef);

  /** Refresh cache, shown on the right of the admin header while this page is open. */
  private readonly headerActions = viewChild<TemplateRef<unknown>>('headerActions');

  protected readonly layoutKey = CONFIG_LAYOUT_KEY;
  protected readonly rightWidth = ADMIN_RIGHT_WIDTH;

  protected readonly providers = signal<ProviderConfig[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  /** Enabled view (default) or Disabled view. */
  protected readonly statusView = signal<StatusView>('enabled');

  /**
   * Providers (and models) for the current view. Enabled: enabled providers with their enabled
   * models. Disabled: disabled providers (all their models) plus enabled providers that have
   * disabled models (just those).
   */
  protected readonly visibleProviders = computed(() => {
    const enabledView = this.statusView() === 'enabled';
    return this.providers()
      .map(p => ({
        ...p,
        models: enabledView ? (p.enabled ? p.models.filter(m => m.enabled) : []) : p.enabled ? p.models.filter(m => !m.enabled) : p.models,
      }))
      .filter(p => (enabledView ? p.enabled : !p.enabled || p.models.length > 0));
  });

  protected readonly nodes = computed<TwangTreeTableNode<ProviderRow>[]>(() =>
    this.visibleProviders().map(provider => {
      const children = provider.models.map(model => ({
        id: modelNodeId(provider, model),
        label: model.id,
        depth: 1,
        data: { provider, model },
      }));
      const row = { provider, model: null };
      // A provider with nothing to show under it is a leaf, not an (empty) group.
      return children.length
        ? { id: providerNodeId(provider), label: provider.llm, depth: 0, summary: row, children }
        : { id: providerNodeId(provider), label: provider.llm, depth: 0, data: row, children: [] };
    }),
  );

  /** Tree row highlighted in the table — a provider or a model. */
  protected readonly selectedNodeId = signal<string | null>(null);

  /** The selected row, re-resolved against fresh data so a refresh shows current values. */
  protected readonly selected = computed<ProviderRow | null>(() => {
    const id = this.selectedNodeId();
    for (const provider of this.providers()) {
      if (providerNodeId(provider) === id) return { provider, model: null };
      const model = provider.models.find(m => modelNodeId(provider, m) === id);
      if (model) return { provider, model };
    }
    return null;
  });

  protected readonly treeHeight = ADMIN_TABLE_HEIGHT;

  // ── Editing ──
  protected readonly costFields = COST_FIELDS;
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  protected readonly confirmDelete = signal(false);

  /** Edit copy of the selected model; resets whenever the selection (or its saved value) changes. */
  protected readonly modelForm = linkedSignal<ModelDraft | null>(() => {
    const model = this.selected()?.model;
    return model ? toDraft(model) : null;
  });
  /** Changed from the saved model (an invalid cost counts as changed, so Reset is offered). */
  protected readonly modelDirty = computed(() => {
    const form = this.modelForm();
    const saved = this.selected()?.model;
    if (!form || !saved) return false;
    const parsed = fromDraft(form);
    return !parsed || !sameModel(parsed, saved);
  });

  /** Provider a model is being added to (its details show the new-model form below them). */
  protected readonly addingTo = signal<ProviderConfig | null>(null);
  protected readonly newModel = signal<ModelDraft>(blankModel());
  protected readonly newModelIdError = computed(() => {
    const id = this.newModel().id;
    return id && this.addingTo()?.models.some(m => m.id === id) ? 'This provider already has a model with this id.' : null;
  });

  protected readonly costPatch = (key: CostKey, v: unknown): Partial<ModelDraft> => ({ [key]: String(v ?? '') });
  protected readonly patchModel = (changes: Partial<ModelDraft>) => this.modelForm.update(f => (f ? { ...f, ...changes } : f));
  protected readonly patchNewModel = (changes: Partial<ModelDraft>) => this.newModel.update(m => ({ ...m, ...changes }));
  protected readonly costInvalid = (m: ModelDraft, key: CostKey) => parseCost(m[key]) === null;
  protected readonly draftValid = (m: ModelDraft) => fromDraft(m) !== null;
  protected readonly cost = cost;
  protected readonly enabledCount = (p: ProviderConfig) => p.models.filter(m => m.enabled).length;

  private readonly costColumn = (id: string, header: string, pick: (m: ModelConfig) => number): TwangTreeTableColumn<ProviderRow> => ({
    id,
    header,
    align: 'right',
    sortable: true,
    width: '140px',
    value: r => (r.model ? pick(r.model) : null),
    format: v => (v == null ? '' : cost(Number(v))),
  });

  protected readonly columns: TwangTreeTableColumn<ProviderRow>[] = [
    {
      id: 'name',
      header: 'Provider / Model',
      align: 'left',
      sortable: true,
      isLabelColumn: true,
      fillRemaining: true,
      minWidth: '240px',
      value: r => r.model?.id ?? r.provider.llm,
      splitCell: r => ({
        primary: r.model?.id ?? r.provider.llm, // provider rows can be leaves when no models are shown
        secondary: [r.model?.id === r.provider.default_model ? 'default' : '', r.model?.enabled === false ? 'disabled' : '']
          .filter(Boolean)
          .join(' · '),
        primaryClass: 'font-mono text-xs',
        secondaryClass: 'text-[10px] uppercase text-text-muted',
      }),
    },
    {
      id: 'status',
      header: 'Status',
      align: 'left',
      sortable: true,
      width: '100px',
      value: r => ((r.model ?? r.provider).enabled ? 'Enabled' : 'Disabled'),
    },
    this.costColumn('input', 'Input', m => m.input_cost),
    this.costColumn('cache_read', 'Cache read', m => m.cached_read_cost),
    this.costColumn('cache_write', 'Cache write', m => m.cached_write_cost),
    this.costColumn('output', 'Output', m => m.output_cost),
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

  /** Switch view; keep the selection if it's still shown, otherwise select the first provider shown. */
  protected setStatusView(view: StatusView): void {
    this.statusView.set(view);
    const ids = new Set(this.nodes().flatMap(n => [n.id, ...(n.children ?? []).map(c => c.id)]));
    if (this.selectedNodeId() && ids.has(this.selectedNodeId()!)) return;
    const first = [...this.visibleProviders()].sort((a, b) => a.llm.localeCompare(b.llm))[0];
    this.selectedNodeId.set(first ? providerNodeId(first) : null);
  }

  protected onNodeSelected(node: TwangTreeTableNode<ProviderRow>): void {
    this.selectedNodeId.set(node.id);
    this.addingTo.set(null);
    this.confirmDelete.set(false);
    this.saveError.set(null);
  }

  protected toggleProvider(provider: ProviderConfig): void {
    this.save({ ...provider, enabled: !provider.enabled }, providerNodeId(provider));
  }

  protected startAdd(provider: ProviderConfig): void {
    this.newModel.set(blankModel());
    this.saveError.set(null);
    this.addingTo.set(provider);
  }

  protected cancelAdd(): void {
    this.addingTo.set(null);
    this.saveError.set(null);
  }

  protected addModel(provider: ProviderConfig): void {
    const model = fromDraft(this.newModel());
    if (!model) return;
    this.save({ ...provider, models: [...provider.models, model] }, modelNodeId(provider, model));
  }

  protected resetModel(): void {
    const model = this.selected()?.model;
    this.modelForm.set(model ? toDraft(model) : null);
  }

  protected saveModel(provider: ProviderConfig): void {
    const draft = this.modelForm();
    const form = draft && fromDraft(draft);
    if (!form) return;
    this.save({ ...provider, models: provider.models.map(m => (m.id === form.id ? form : m)) }, modelNodeId(provider, form));
  }

  protected deleteModel(provider: ProviderConfig, modelId: string): void {
    this.save({ ...provider, models: provider.models.filter(m => m.id !== modelId) }, providerNodeId(provider));
  }

  /** PUT the whole provider; on success swap it into the list and select `selectId`. */
  private save(next: ProviderConfig, selectId: string): void {
    this.saving.set(true);
    this.saveError.set(null);
    this.configService
      .updateProvider(next)
      .pipe(
        finalize(() => this.saving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: saved => {
          const updated = saved ?? next; // tolerate an empty (204) response
          this.providers.update(list => list.map(p => (p.id === updated.id ? updated : p)));
          this.addingTo.set(null);
          this.confirmDelete.set(false);
          this.reveal(selectId);
        },
        error: err => {
          console.error('Failed to save provider', err);
          this.saveError.set(errorText(err, 'Failed to save provider.'));
        },
      });
  }

  /**
   * Select a node. The Enabled/Disabled view is left alone: if the change moved the node out of it
   * (e.g. just disabled), it drops out of the tree but stays in the right panel — `selected()`
   * resolves against all providers — so it can be re-enabled straight away.
   */
  private reveal(nodeId: string): void {
    this.selectedNodeId.set(nodeId);
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.configService
      .getProviders()
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: providers => {
          this.providers.set(providers);
          // Keep the current selection if it's still there; otherwise select the first provider
          // in the tree's default order (name A–Z).
          if (this.selected()) return;
          const first = [...this.visibleProviders()].sort((a, b) => a.llm.localeCompare(b.llm))[0];
          this.selectedNodeId.set(first ? providerNodeId(first) : null);
        },
        error: err => {
          console.error('Failed to load providers', err);
          this.error.set('Failed to load providers.');
        },
      });
  }
}
