import { Component, computed, DestroyRef, effect, inject, signal, type TemplateRef, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LucideAngularModule } from 'lucide-angular';
import {
  TwangButtonComponent,
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

/**
 * Admin > Config > Providers: read-only view of every LLM provider configuration. The middle
 * tree lists providers with their models (and costs) as children; selecting either shows the
 * provider's settings in the right panel (the first provider is selected on load).
 */
@Component({
  selector: 'app-config-providers',
  standalone: true,
  imports: [LucideAngularModule, RefreshCacheButtonComponent, ThreePanelLayoutComponent, TwangButtonComponent, TwangTreeTableComponent],
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

      <div right class="flex flex-col gap-4 p-4 text-sm">
        @if (selected(); as s) {
          <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
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

          @if (s.model; as m) {
            <section class="flex flex-col gap-2 border-t border-border pt-4">
              <span class="text-xs font-semibold uppercase tracking-wider text-primary-600">Selected model</span>
              <div class="flex items-center gap-2">
                <span class="min-w-0 flex-1 break-all font-mono text-xs font-medium">{{ m.id }}</span>
                @if (m.id === s.provider.default_model) {
                  <span class="rounded bg-primary-50 px-1.5 py-0.5 text-[10px] uppercase text-primary-700">default</span>
                }
                @if (!m.enabled) {
                  <span class="rounded bg-surface-muted px-1.5 py-0.5 text-[10px] uppercase text-text-muted">disabled</span>
                }
              </div>
              <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
                <dt class="text-xs text-text-muted">Input</dt>
                <dd>{{ cost(m.input_cost) }}</dd>
                <dt class="text-xs text-text-muted">Cache read</dt>
                <dd>{{ cost(m.cached_read_cost) }}</dd>
                <dt class="text-xs text-text-muted">Cache write</dt>
                <dd>{{ cost(m.cached_write_cost) }}</dd>
                <dt class="text-xs text-text-muted">Output</dt>
                <dd>{{ cost(m.output_cost) }}</dd>
              </dl>
            </section>
          }
        } @else {
          <p class="text-text-muted">Select a provider to see its configuration.</p>
        }
      </div>
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
