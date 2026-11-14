import { Component, computed, DestroyRef, effect, inject, signal, type TemplateRef, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { TwangButtonComponent, TwangDropdownComponent, type TwangDropdownOption, TwangTableComponent, type TwangTableColumn } from 'ngx-twang-ui';
import { finalize } from 'rxjs';
import { ORIGIN_LABELS, type Origin, originLabel } from '../../models/origin';
import {
  type AgentConfig,
  type AgentConfigResponse,
  AdminConfigService,
  type ConfigScope,
  EXECUTION_TYPE_LABELS,
  type ExecutionType,
  type LlmConfig,
} from '../../services/admin-config.service';
import { ADMIN_RIGHT_WIDTH } from '../admin-page/admin-layout';
import { PageBreadcrumbs } from '../breadcrumbs/page-breadcrumbs';
import { ThreePanelLayoutComponent } from '../three-panel-layout/three-panel-layout.component';
import { agentsFilesIn, resolveAgentsFolder } from './agent-import';
import { CONFIG_LAYOUT_KEY, currentAgent, rememberCurrentAgent } from './config-sections';
import { RefreshCacheButtonComponent } from './refresh-cache-button.component';


/** Backend error text (axum returns plain strings), else a fallback. */
function errorText(err: unknown, fallback: string): string {
  const body = (err as { error?: unknown })?.error;
  return typeof body === 'string' && body.trim() ? body : fallback;
}

/** `provider / model`, skipping whichever part is unset. The preset is shown separately. */
function llmLabel(c: LlmConfig | null | undefined): string {
  if (!c) return '';
  return [c.llm, c.model].filter(Boolean).join(' / ');
}

/** The table's filters; '' = all. */
interface AgentFilters {
  origin: Origin | '';
  execution: ExecutionType | '';
}

const NO_FILTERS: AgentFilters = { origin: '', execution: '' };

/** Saved filters for a scope's Agents table (admin and platform keep their own). */
const filtersKey = (scope: ConfigScope) => `${scope}.config.agents.filters`;

function loadFilters(scope: ConfigScope): AgentFilters {
  try {
    const saved = JSON.parse(localStorage.getItem(filtersKey(scope)) ?? 'null') as Partial<AgentFilters> | null;
    return {
      origin: saved?.origin && saved.origin in ORIGIN_LABELS ? saved.origin : '',
      execution: saved?.execution && saved.execution in EXECUTION_TYPE_LABELS ? saved.execution : '',
    };
  } catch {
    return { ...NO_FILTERS }; // storage unavailable or bad JSON — start unfiltered
  }
}

function saveFilters(scope: ConfigScope, filters: AgentFilters): void {
  try {
    localStorage.setItem(filtersKey(scope), JSON.stringify(filters));
  } catch {
    // storage unavailable — just not remembered
  }
}

/** Version column sort: live first, then live with a draft open, then draft-only. */
const STATUS_ORDER: Record<AgentConfigResponse['status'], number> = { live: 0, live_with_draft: 1, draft: 2 };

/**
 * Admin > Config > Agents: every agent — live and draft-only — with its version status. The middle
 * table lists agents (the first is selected on load); the right panel shows the selected agent's
 * config (the draft's, for agents not yet promoted).
 */
@Component({
  selector: 'app-config-agents',
  standalone: true,
  imports: [LucideAngularModule, RouterLink, ThreePanelLayoutComponent, TwangButtonComponent, TwangDropdownComponent, TwangTableComponent, RefreshCacheButtonComponent],
  template: `
    <app-three-panel-layout
      [showLeft]="false"
      [rightTitle]="selected()?.name ?? 'Details'"
      [storageKey]="layoutKey"
      [rightWidth]="rightWidth"
      panelMinHeight="min-h-[70vh]"
    >

      <!-- Middle: filters card above the agents card (same layout as Logs) -->
      <div middle class="flex flex-1 flex-col gap-3">
        <!-- Filters -->
        <div class="flex shrink-0 flex-wrap items-end gap-3 rounded-lg border border-border bg-white px-4 py-3">
          <div class="w-44">
            <twang-dropdown label="Origin" [options]="originOptions" [value]="filters().origin" (valueChange)="setFilter({ origin: $any($event) })" />
          </div>
          <div class="w-48">
            <twang-dropdown label="Execution" [options]="executionOptions" [value]="filters().execution" (valueChange)="setFilter({ execution: $any($event) })" />
          </div>
        </div>
      <div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-white">
        <div class="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
          <span class="text-sm font-semibold text-primary-600">Agents</span>
          <span class="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700"
                [title]="filtered() ? visibleAgents().length + ' of ' + agents().length + ' agents shown' : ''"
          >{{ filtered() ? visibleAgents().length + ' / ' + agents().length : agents().length }}</span>
          <twang-button
            class="ml-auto"
            variant="default"
            size="sm"
            icon="refresh-cw"
            ariaLabel="Refresh agents"
            title="Refresh agents"
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
        <!-- A folder with several agents.json files: choose which to import -->
        @if (pendingImport(); as p) {
          <div class="flex shrink-0 flex-col gap-2 border-b border-border px-4 py-3 text-sm">
            <span class="font-medium">Import from {{ p.folder }}: choose the agents.json files</span>
            <div class="flex flex-col gap-1">
              @for (path of p.paths; track path) {
                <label class="flex cursor-pointer items-center gap-2">
                  <input type="checkbox" class="accent-primary-600" [checked]="p.chosen.has(path)" (change)="toggleImportPath(path)" />
                  <span class="font-mono text-xs">{{ path }}</span>
                </label>
              }
            </div>
            <div class="flex items-center gap-2">
              <twang-button variant="primary" size="sm" label="Import" [disabled]="!p.chosen.size" (buttonClick)="importChosen()" />
              <twang-button variant="default" size="sm" label="Cancel" (buttonClick)="pendingImport.set(null)" />
              <span class="text-xs text-text-muted">Files outside these packages (e.g. common) can still be referenced with ..</span>
            </div>
          </div>
        }
        <div class="flex min-h-0 flex-1 flex-col">
          @if (error()) {
            <div class="flex flex-1 items-center justify-center p-8 text-sm text-red-600">{{ error() }}</div>
          } @else {
            <twang-table
              [rows]="visibleAgents()"
              [columns]="columns"
              [loading]="loading()"
              [fillContainerWidth]="true"
              [onRowClick]="onRowClick"
              [onRowDoubleClick]="onRowDoubleClick"
              [rowClass]="rowClass"
              initialSortKey="id"
              initialSortDir="asc"
              tableMinWidthClass="min-w-[1360px]"
              [emptyMessage]="filtered() && agents().length ? 'No agents match these filters.' : 'No agents configured.'"
            />
          }
        </div>
      </div>
      </div>

      <!-- Fills the panel (min 70vh, same as the middle): the system prompt takes what's left and scrolls
           inside. Its text is absolutely positioned so a long prompt can't grow the panel. -->
      <div right class="flex min-h-0 flex-1 flex-col gap-4 p-4 text-sm">
        @if (selected(); as a) {
          <section class="flex shrink-0 flex-col gap-2 border-b border-border pb-4">
            <span class="text-xs font-semibold uppercase tracking-wider text-primary-600">Description</span>
            @if (a.description) {
              <p>{{ a.description }}</p>
            } @else {
              <p class="text-text-muted">None.</p>
            }
          </section>

          <dl class="grid shrink-0 grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            <dt class="text-xs text-text-muted">ID</dt>
            <dd class="break-all font-mono text-xs">{{ a.id }}</dd>
            <dt class="text-xs text-text-muted">Status</dt>
            <dd [class.text-red-600]="!a.enabled">{{ a.enabled ? 'Enabled' : 'Disabled' }}</dd>
            <dt class="text-xs text-text-muted">Version</dt>
            <dd><span class="rounded px-1.5 py-0.5 text-xs" [class]="versionClass(a)">{{ versionLabel(a) }}</span></dd>
            <dt class="text-xs text-text-muted">Origin</dt>
            <dd>
              <span
                class="rounded px-1.5 py-0.5 text-xs"
                [class]="a.origin === 'client' ? 'bg-primary-50 text-primary-700' : 'bg-surface-muted text-text-muted'"
              >{{ originLabel(a.origin) }}</span>
            </dd>
            <dt class="text-xs text-text-muted">Execution</dt>
            <dd>{{ executionLabel(a.execution) }}</dd>
            @if (a.pipeline) {
              <dt class="text-xs text-text-muted">Pipeline type</dt>
              <dd>{{ a.pipeline.type }}</dd>
            }
            <dt class="text-xs text-text-muted">Standalone (public)</dt>
            <dd>{{ a.standalone ? 'Yes' : 'No' }}</dd>
            <dt class="text-xs text-text-muted">LLM</dt>
            <dd>{{ llmLabel(a.llm_config) || 'Server default' }}</dd>
            <dt class="text-xs text-text-muted">LLM Preset</dt>
            <dd>{{ a.llm_config?.preset ?? '—' }}</dd>
          </dl>

          <section class="flex shrink-0 flex-col gap-2 border-t border-border pt-4">
            <span class="text-xs font-semibold uppercase tracking-wider text-primary-600">Tools</span>
            @if (a.tools.length || a.mcp_tools.length) {
              <div class="flex flex-wrap gap-1">
                @for (tool of a.tools; track tool) {
                  <span class="rounded bg-surface-muted px-2 py-0.5 font-mono text-xs">{{ tool }}</span>
                }
                @for (tool of a.mcp_tools; track tool) {
                  <span class="rounded bg-primary-50 px-2 py-0.5 font-mono text-xs text-primary-700" title="MCP tool">{{ tool }}</span>
                }
              </div>
            } @else {
              <p class="text-text-muted">No tools.</p>
            }
          </section>

          <section class="flex min-h-48 flex-1 flex-col gap-2 border-t border-border pt-4">
            <span class="text-xs font-semibold uppercase tracking-wider text-primary-600">System prompt</span>
            @if (a.system_prompt) {
              <div class="relative min-h-0 flex-1">
                <pre class="absolute inset-0 overflow-auto whitespace-pre-wrap rounded-md bg-surface-muted p-3 text-xs">{{ a.system_prompt }}</pre>
              </div>
            } @else {
              <p class="text-text-muted">None.</p>
            }
          </section>
        } @else {
          <p class="text-text-muted">Select an agent to see its configuration.</p>
        }
      </div>
    </app-three-panel-layout>

    <!-- Rendered in the admin header (right side) via PageBreadcrumbs.actions. Absolute links: the
         template is stamped out in the shell, not under this page. -->
    <ng-template #headerActions>
      @if (adminScope) {
        <app-refresh-cache-button (refreshed)="load()" />
        @if (selected(); as a) {
          <twang-button variant="default" size="sm" icon="flask-conical" label="Test agent" [routerLink]="['/admin', 'config', 'agents', a.id, 'test']" />
          <twang-button variant="default" size="sm" icon="square-pen" label="Edit agent" [routerLink]="['/admin', 'config', 'agents', a.id, 'edit']" />
        }
        <twang-button variant="primary" size="sm" icon="plus" label="New agent" [routerLink]="['/admin', 'config', 'agents', 'new']" />
      } @else {
        <!-- Platform: list + import only. Import takes the config folder: agents.json plus the
             prompt/description/schema files it references, resolved like the backend's startup loader. -->
        <input #importFolder type="file" webkitdirectory class="hidden" (change)="importFolderFrom(importFolder)" />
        <twang-button
          variant="primary"
          size="sm"
          icon="folder-open"
          label="Import folder"
          title="Import the agents config folder: agents.json plus the files it references"
          [loading]="importing()"
          [disabled]="importing()"
          (buttonClick)="importFolder.click()"
        />
      }
    </ng-template>
  `,
})
export class ConfigAgentsComponent {
  private readonly configService = inject(AdminConfigService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  /** Route `data.scope`: `admin` (default) — full editing; `platform` — list and import only. */
  private readonly scope: ConfigScope = inject(ActivatedRoute).snapshot.data['scope'] ?? 'admin';
  protected readonly adminScope = this.scope === 'admin';
  protected readonly importing = signal(false);
  protected readonly importError = signal<string | null>(null);

  /** New agent / Edit (admin) or Import (platform), shown on the right of the page header while this page is open. */
  private readonly headerActions = viewChild<TemplateRef<unknown>>('headerActions');

  protected readonly layoutKey = CONFIG_LAYOUT_KEY;
  protected readonly rightWidth = ADMIN_RIGHT_WIDTH;

  /** Rows from `/admin/agents`; the table and panel work on the configs, version state is looked up by id. */
  private readonly responses = signal<AgentConfigResponse[]>([]);
  protected readonly agents = computed<AgentConfig[]>(() => this.responses().map(r => r.config));
  private readonly versionInfo = computed(() => new Map(this.responses().map(r => [r.config.id, r])));
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  /** Origin / Execution filters, saved per scope in localStorage. */
  protected readonly filters = signal<AgentFilters>(loadFilters(this.scope));
  protected readonly filtered = computed(() => !!(this.filters().origin || this.filters().execution));
  protected readonly visibleAgents = computed(() => {
    const { origin, execution } = this.filters();
    return this.agents().filter(a => (!origin || a.origin === origin) && (!execution || a.execution === execution));
  });
  protected readonly originOptions: TwangDropdownOption[] = [
    { value: '', label: 'All origins' },
    ...(Object.keys(ORIGIN_LABELS) as Origin[]).map(o => ({ value: o, label: ORIGIN_LABELS[o] })),
  ];
  protected readonly executionOptions: TwangDropdownOption[] = [
    { value: '', label: 'All execution types' },
    ...(Object.keys(EXECUTION_TYPE_LABELS) as ExecutionType[]).map(e => ({ value: e, label: EXECUTION_TYPE_LABELS[e] })),
  ];

  protected setFilter(change: Partial<AgentFilters>): void {
    const next = { ...this.filters(), ...change };
    this.filters.set(next);
    saveFilters(this.scope, next);
  }

  protected readonly selectedId = signal<string | null>(null);
  /** The selected agent, while it passes the filters — a filtered-out one isn't shown in the panel. */
  protected readonly selected = computed(() => this.visibleAgents().find(a => a.id === this.selectedId()) ?? null);

  protected readonly llmLabel = llmLabel;
  protected readonly originLabel = originLabel;
  protected readonly executionLabel = (e: ExecutionType) => EXECUTION_TYPE_LABELS[e] ?? e;

  /** "Live v3", "Draft v1", "Live v3 · draft v4"; "Live" for agents never versioned. */
  protected readonly versionLabel = (a: AgentConfig): string => {
    const info = this.versionInfo().get(a.id);
    if (!info) return '';
    const live = info.live_version != null ? `Live v${info.live_version}` : 'Live';
    if (info.status === 'draft') return info.draft_version != null ? `Draft v${info.draft_version}` : 'Draft';
    if (info.status === 'live_with_draft') return `${live} · draft v${info.draft_version}`;
    return live;
  };
  protected readonly versionClass = (a: AgentConfig): string =>
    ({ live: 'bg-green-50 text-green-700', draft: 'bg-amber-50 text-amber-700', live_with_draft: 'bg-primary-50 text-primary-700' })[
      this.versionInfo().get(a.id)?.status ?? 'live'
    ];
  private readonly versionTextClass = (a: AgentConfig): string =>
    ({ live: 'text-green-700', draft: 'text-amber-700', live_with_draft: 'text-primary-700' })[this.versionInfo().get(a.id)?.status ?? 'live'];

  protected readonly onRowClick = (row: AgentConfig) => this.selectedId.set(row.id);
  /** Double-click = Edit agent (admin only). */
  protected readonly onRowDoubleClick = this.adminScope
    ? (row: AgentConfig) => this.router.navigate(['/admin', 'config', 'agents', row.id, 'edit'])
    : undefined;
  protected readonly rowClass = (row: AgentConfig) =>
    [row.id === this.selectedId() ? 'bg-primary-50' : '', row.enabled ? '' : 'opacity-60'].join(' ');

  protected readonly columns: TwangTableColumn<AgentConfig>[] = [
    { id: 'id', header: 'ID', align: 'left', sortable: true, width: '280px', cellTruncate: true, value: a => a.id },
    { id: 'name', header: 'Name', align: 'left', sortable: true, fillRemaining: true, minWidth: '200px', cellTruncate: true, value: a => a.name },
    {
      id: 'version',
      header: 'Version',
      align: 'left',
      sortable: true,
      width: '170px',
      value: a => this.versionLabel(a),
      sortValue: a => STATUS_ORDER[this.versionInfo().get(a.id)?.status ?? 'live'],
      cellClass: a => this.versionTextClass(a),
    },
    { id: 'enabled', header: 'Status', align: 'left', sortable: true, width: '100px', value: a => (a.enabled ? 'Enabled' : 'Disabled') },
    { id: 'origin', header: 'Origin', align: 'left', sortable: true, width: '110px', value: a => originLabel(a.origin) },
    { id: 'execution', header: 'Execution', align: 'left', sortable: true, width: '130px', value: a => this.executionLabel(a.execution) },
    { id: 'pipeline', header: 'Pipeline', align: 'left', sortable: true, width: '140px', cellTruncate: true, value: a => a.pipeline?.type ?? '' },
    // "Public": standalone agents appear in the public catalog; the full word wastes width over Yes/No.
    { id: 'standalone', header: 'Public', align: 'left', sortable: true, width: '110px', value: a => (a.standalone ? 'Yes' : 'No') },
    { id: 'tools', header: 'Tools', align: 'right', sortable: true, width: '110px', value: a => a.tools.length + a.mcp_tools.length },
  ];

  constructor() {
    effect(() => rememberCurrentAgent(this.selectedId()));
    const breadcrumbs = inject(PageBreadcrumbs);
    effect(() => breadcrumbs.actions.set(this.headerActions() ?? null));
    // Only drop our actions (not the crumbs): the next page may already have set its own.
    this.destroyRef.onDestroy(() => {
      if (breadcrumbs.actions() === this.headerActions()) breadcrumbs.actions.set(null);
    });

    this.load();

    // A filter change that hides the selected agent selects the first one still shown.
    effect(() => {
      const visible = this.visibleAgents();
      if (this.loading() || this.selected() || !visible.length) return;
      this.selectedId.set(this.firstInDefaultOrder(visible)?.id ?? null);
    });
  }

  /** The top row in the table's default order (ID A–Z). */
  private firstInDefaultOrder(agents: AgentConfig[]): AgentConfig | undefined {
    return [...agents].sort((a, b) => a.id.localeCompare(b.id))[0];
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.configService
      .getAgents(this.scope)
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: responses => {
          this.responses.set(responses);
          const agents = this.visibleAgents();
          // Keep the current selection if it's still there; else reopen the remembered agent; else
          // select the top row in the table's default order (ID A–Z).
          if (this.selected()) return;
          const remembered = currentAgent();
          if (remembered && agents.some(a => a.id === remembered)) {
            this.selectedId.set(remembered);
            return;
          }
          this.selectedId.set(this.firstInDefaultOrder(agents)?.id ?? null);
        },
        error: err => {
          console.error('Failed to load agents', err);
          this.error.set(errorText(err, 'Failed to load agents.'));
        },
      });
  }

  /** Platform: import a config folder (`POST /platform/agents/import`) — agents.json with its referenced files resolved — then reload. */
  protected importFolderFrom(input: HTMLInputElement): void {
    const files = [...(input.files ?? [])];
    input.value = ''; // so choosing the same folder again still fires (change)
    if (!files.length) return;
    const folder = (files[0] as File & { webkitRelativePath?: string }).webkitRelativePath?.split('/')[0] || 'the folder';
    this.importError.set(null);
    this.pendingImport.set(null);
    const paths = agentsFilesIn(files);
    // Several packages: let the user choose which agents.json files to import.
    if (paths.length > 1) {
      this.pendingImport.set({ files, folder, paths, chosen: new Set() });
      return;
    }
    this.resolveAndImport(files, folder);
  }

  /** A picked folder with several agents.json files, waiting for the user to choose which to import. */
  protected readonly pendingImport = signal<{ files: File[]; folder: string; paths: string[]; chosen: ReadonlySet<string> } | null>(null);

  protected toggleImportPath(path: string): void {
    this.pendingImport.update(p => {
      if (!p) return p;
      const chosen = new Set(p.chosen);
      if (!chosen.delete(path)) chosen.add(path);
      return { ...p, chosen };
    });
  }

  protected importChosen(): void {
    const p = this.pendingImport();
    if (!p?.chosen.size) return;
    this.pendingImport.set(null);
    this.resolveAndImport(p.files, p.folder, [...p.chosen]);
  }

  private resolveAndImport(files: File[], folder: string, only?: string[]): void {
    this.importing.set(true);
    resolveAgentsFolder(files, only).then(
      result => {
        this.importing.set(false);
        this.sendImport(result, folder);
      },
      err => {
        this.importing.set(false);
        this.importError.set(`Couldn't read ${folder}: ${(err as Error)?.message ?? err}`);
      },
    );
  }

  /** Post parsed agents (or show the parse error), then reload. `source` names the file/folder in messages. */
  private sendImport(parsed: AgentConfig[] | string, source: string): void {
    if (typeof parsed === 'string') {
      this.importError.set(`Couldn't import ${source}: ${parsed}`);
      return;
    }
    this.importing.set(true);
    this.configService
      .importAgents(parsed)
      .pipe(
        finalize(() => this.importing.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => this.load(),
        error: err => {
          console.error('Failed to import agents', err);
          this.importError.set(errorText(err, 'Failed to import agents.'));
        },
      });
  }
}
