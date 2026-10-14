import { Component, computed, DestroyRef, effect, inject, signal, type TemplateRef, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LucideAngularModule } from 'lucide-angular';
import { TwangButtonComponent, TwangTableComponent, type TwangTableColumn } from 'ngx-twang-ui';
import { finalize } from 'rxjs';
import { ActivatedRoute } from '@angular/router';
import { AdminConfigService, type ConfigScope, type McpServerConfig } from '../../services/admin-config.service';
import { ADMIN_RIGHT_WIDTH } from '../admin-page/admin-layout';
import { PageBreadcrumbs } from '../breadcrumbs/page-breadcrumbs';
import { ThreePanelLayoutComponent } from '../three-panel-layout/three-panel-layout.component';

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * MCP server configs from an import file — `mcp_servers_config.json`'s `{ "mcp_servers": [...] }`,
 * a JSON array, or a single server — or an error message.
 */
function parseMcpServers(text: string): McpServerConfig[] | string {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return 'The file is not valid JSON.';
  }
  const wrapped = isObject(json) && Array.isArray(json['mcp_servers']) ? json['mcp_servers'] : json;
  const list = Array.isArray(wrapped) ? wrapped : [wrapped];
  if (!list.length) return 'The file has no MCP servers.';
  for (const [i, s] of list.entries()) {
    const where = `Server ${i + 1}`;
    if (!isObject(s)) return `${where} is not an object.`;
    if (typeof s['id'] !== 'string' || !s['id']) return `${where} needs an "id".`;
    for (const key of ['name', 'url', 'api_key_env']) {
      if (typeof s[key] !== 'string') return `${where} (${s['id']}) needs "${key}".`;
    }
    if (s['auth_header_name'] != null && typeof s['auth_header_name'] !== 'string') return `${where} (${s['id']}): "auth_header_name" must be a string or null.`;
    if (!Array.isArray(s['enabled_tools']) || !s['enabled_tools'].every(t => typeof t === 'string')) {
      return `${where} (${s['id']}) needs "enabled_tools": a list of tool names.`;
    }
  }
  return list as McpServerConfig[];
}

/** Backend error text (axum returns plain strings), else a fallback. */
function errorText(err: unknown, fallback: string): string {
  const body = (err as { error?: unknown })?.error;
  return typeof body === 'string' && body.trim() ? body : fallback;
}

/**
 * MCP Servers: every MCP server config (`GET /{scope}/mcp_server_configs`) in the middle, the
 * selected one in the right panel. Route `data.scope`: `platform` (default) adds Import (page
 * header), which loads `mcp_servers_config.json` and posts the list to
 * `/platform/mcp_server_configs/import`; `admin` is read-only.
 */
@Component({
  selector: 'app-mcp-servers-page',
  standalone: true,
  imports: [LucideAngularModule, ThreePanelLayoutComponent, TwangButtonComponent, TwangTableComponent],
  template: `
    <app-three-panel-layout
      [showLeft]="false"
      [rightTitle]="selected()?.name ?? 'Details'"
      [storageKey]="scope + '.mcp-servers.layout'"
      [rightWidth]="rightWidth"
      panelMinHeight="min-h-[70vh]"
    >
      <div middle class="flex flex-1 flex-col overflow-hidden rounded-lg border border-border bg-white">
        <div class="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
          <span class="text-sm font-semibold text-primary-600">MCP Servers</span>
          <span class="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700">{{ servers().length }}</span>
          <twang-button
            class="ml-auto"
            variant="default"
            size="sm"
            icon="refresh-cw"
            ariaLabel="Refresh MCP servers"
            title="Refresh MCP servers"
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
              [emptyMessage]="platformScope ? 'No MCP servers yet — use Import to load mcp_servers_config.json.' : 'No MCP servers configured.'"
              [rows]="servers()"
              [columns]="columns"
              [loading]="loading()"
              [fillContainerWidth]="true"
              [onRowClick]="onRowClick"
              [rowClass]="rowClass"
              initialSortKey="name"
              initialSortDir="asc"
              tableMinWidthClass="min-w-[880px]"
            />
          }
        </div>
      </div>

      <div right class="flex flex-col gap-4 p-4 text-sm">
        @if (selected(); as s) {
          <dl class="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2">
            <dt class="text-xs text-text-muted">ID</dt>
            <dd class="break-all font-mono text-xs">{{ s.id }}</dd>
            <dt class="text-xs text-text-muted">Name</dt>
            <dd class="break-all">{{ s.name }}</dd>
            <dt class="text-xs text-text-muted">URL</dt>
            <dd class="break-all font-mono text-xs">{{ s.url }}</dd>
            <dt class="text-xs text-text-muted">API key env</dt>
            <dd class="break-all font-mono text-xs">{{ s.api_key_env || '—' }}</dd>
            <dt class="text-xs text-text-muted">Auth header</dt>
            <dd class="break-all font-mono text-xs">{{ s.auth_header_name || 'Default' }}</dd>
          </dl>
          <section class="flex flex-col gap-2 border-t border-border pt-4">
            <span class="text-xs font-semibold uppercase tracking-wider text-primary-600">Enabled tools · {{ s.enabled_tools.length }}</span>
            @if (s.enabled_tools.length) {
              <div class="flex flex-wrap gap-1">
                @for (tool of s.enabled_tools; track tool) {
                  <span class="rounded bg-primary-50 px-2 py-0.5 font-mono text-xs text-primary-700">{{ tool }}</span>
                }
              </div>
            } @else {
              <p class="text-text-muted">No tools enabled.</p>
            }
          </section>
        } @else {
          <p class="text-text-muted">Select an MCP server to see its configuration.</p>
        }
      </div>
    </app-three-panel-layout>

    <!-- Rendered in the page header (right side) via PageBreadcrumbs.actions. -->
    <ng-template #headerActions>
      @if (platformScope) {
      <input #importFile type="file" accept=".json,application/json" class="hidden" (change)="importFrom(importFile)" />
      <twang-button
        variant="primary"
        size="sm"
        icon="upload"
        label="Import"
        title="Import MCP servers from mcp_servers_config.json ({ &quot;mcp_servers&quot;: [...] }, an array, or one server)"
        [loading]="importing()"
        [disabled]="importing()"
        (buttonClick)="importFile.click()"
      />
      }
    </ng-template>
  `,
})
export class McpServersPageComponent {
  private readonly configService = inject(AdminConfigService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly headerActions = viewChild<TemplateRef<unknown>>('headerActions');
  protected readonly scope: ConfigScope = inject(ActivatedRoute).snapshot.data['scope'] ?? 'platform';
  /** Platform can import; admin only views. */
  protected readonly platformScope = this.scope === 'platform';

  protected readonly rightWidth = ADMIN_RIGHT_WIDTH;

  protected readonly servers = signal<McpServerConfig[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly importing = signal(false);
  protected readonly importError = signal<string | null>(null);

  protected readonly selectedId = signal<string | null>(null);
  protected readonly selected = computed(() => this.servers().find(s => s.id === this.selectedId()) ?? null);

  protected readonly onRowClick = (row: McpServerConfig) => this.selectedId.set(row.id);
  protected readonly rowClass = (row: McpServerConfig) => (row.id === this.selectedId() ? 'bg-primary-50' : '');

  protected readonly columns: TwangTableColumn<McpServerConfig>[] = [
    { id: 'name', header: 'Name', align: 'left', sortable: true, width: '180px', cellTruncate: true, value: s => s.name },
    { id: 'url', header: 'URL', align: 'left', sortable: true, fillRemaining: true, minWidth: '240px', cellTruncate: true, value: s => s.url },
    { id: 'tools', header: 'Tools', align: 'right', sortable: true, width: '90px', value: s => s.enabled_tools.length },
    { id: 'api_key_env', header: 'API key env', align: 'left', sortable: true, width: '200px', cellTruncate: true, value: s => s.api_key_env },
    { id: 'id', header: 'ID', align: 'left', sortable: true, width: '160px', cellTruncate: true, value: s => s.id },
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
      .getMcpServerConfigs(this.scope)
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: servers => {
          this.servers.set(servers);
          // Keep the selection if it's still there; otherwise select the first by name.
          if (this.selected()) return;
          const first = [...servers].sort((a, b) => a.name.localeCompare(b.name))[0];
          this.selectedId.set(first?.id ?? null);
        },
        error: err => {
          console.error('Failed to load MCP servers', err);
          this.error.set(errorText(err, 'Failed to load MCP servers.'));
        },
      });
  }

  /** Import the chosen JSON file (`POST /platform/mcp_server_configs/import`), then reload. */
  protected importFrom(input: HTMLInputElement): void {
    const file = input.files?.[0];
    input.value = ''; // so choosing the same file again still fires (change)
    if (!file) return;
    this.importError.set(null);
    file.text().then(text => {
      const parsed = parseMcpServers(text);
      if (typeof parsed === 'string') {
        this.importError.set(`Couldn't import ${file.name}: ${parsed}`);
        return;
      }
      this.importing.set(true);
      this.configService
        .importMcpServerConfigs(parsed)
        .pipe(
          finalize(() => this.importing.set(false)),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe({
          next: () => this.load(),
          error: err => {
            console.error('Failed to import MCP servers', err);
            this.importError.set(errorText(err, 'Failed to import MCP servers.'));
          },
        });
    });
  }
}
