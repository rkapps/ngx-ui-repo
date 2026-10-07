import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LucideAngularModule } from 'lucide-angular';
import { TwangButtonComponent, TwangTableComponent, type TwangTableColumn } from 'ngx-twang-ui';
import { finalize } from 'rxjs';
import { originLabel } from '../../models/origin';
import { type AgentConfig, AdminConfigService, type ExecutionType, type LlmConfig } from '../../services/admin-config.service';
import { ADMIN_RIGHT_WIDTH } from '../admin-page/admin-layout';
import { ThreePanelLayoutComponent } from '../three-panel-layout/three-panel-layout.component';
import { ConfigNavComponent } from './config-nav.component';
import { CONFIG_LAYOUT_KEY } from './config-sections';

const EXECUTION_LABELS: Record<ExecutionType, string> = {
  single_agent: 'Single agent',
  pipeline: 'Pipeline',
  pipeline_agent: 'Pipeline agent',
};

/** `provider / model`, skipping whichever part is unset. The preset is shown separately. */
function llmLabel(c: LlmConfig | null | undefined): string {
  if (!c) return '';
  return [c.llm, c.model].filter(Boolean).join(' / ');
}

/**
 * Admin > Config > Agents: read-only view of every agent configuration. The middle table lists
 * agents (the first is selected on load); the right panel shows the selected agent's full config.
 */
@Component({
  selector: 'app-config-agents',
  standalone: true,
  imports: [ConfigNavComponent, LucideAngularModule, ThreePanelLayoutComponent, TwangButtonComponent, TwangTableComponent],
  template: `
    <app-three-panel-layout
      leftTitle="Config"
      [rightTitle]="selected()?.name ?? 'Details'"
      [storageKey]="layoutKey"
      [rightWidth]="rightWidth"
      panelMinHeight="min-h-[70vh]"
    >
      <app-config-nav left />

      <div middle class="flex flex-1 flex-col overflow-hidden rounded-lg border border-border bg-white">
        <div class="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
          <span class="text-sm font-semibold text-primary-600">Agents</span>
          <span class="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700">{{ agents().length }}</span>
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
        <div class="flex min-h-0 flex-1 flex-col">
          @if (error()) {
            <div class="flex flex-1 items-center justify-center p-8 text-sm text-red-600">{{ error() }}</div>
          } @else {
            <twang-table
              [rows]="agents()"
              [columns]="columns"
              [loading]="loading()"
              [fillContainerWidth]="true"
              [onRowClick]="onRowClick"
              [rowClass]="rowClass"
              initialSortKey="execution"
              initialSortDir="asc"
              tableMinWidthClass="min-w-[1190px]"
              emptyMessage="No agents configured."
            />
          }
        </div>
      </div>

      <div right class="flex flex-col gap-4 p-4 text-sm">
        @if (selected(); as a) {
          <section class="flex flex-col gap-2 border-b border-border pb-4">
            <span class="text-xs font-semibold uppercase tracking-wider text-primary-600">Description</span>
            @if (a.description) {
              <p>{{ a.description }}</p>
            } @else {
              <p class="text-text-muted">None.</p>
            }
          </section>

          <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            <dt class="text-xs text-text-muted">ID</dt>
            <dd class="break-all font-mono text-xs">{{ a.id }}</dd>
            <dt class="text-xs text-text-muted">Status</dt>
            <dd [class.text-red-600]="!a.enabled">{{ a.enabled ? 'Enabled' : 'Disabled' }}</dd>
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

          <section class="flex flex-col gap-2 border-t border-border pt-4">
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

          <section class="flex flex-col gap-2 border-t border-border pt-4">
            <span class="text-xs font-semibold uppercase tracking-wider text-primary-600">System prompt</span>
            @if (a.system_prompt) {
              <pre class="max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-surface-muted p-3 text-xs">{{ a.system_prompt }}</pre>
            } @else {
              <p class="text-text-muted">None.</p>
            }
          </section>
        } @else {
          <p class="text-text-muted">Select an agent to see its configuration.</p>
        }
      </div>
    </app-three-panel-layout>
  `,
})
export class ConfigAgentsComponent {
  private readonly configService = inject(AdminConfigService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly layoutKey = CONFIG_LAYOUT_KEY;
  protected readonly rightWidth = ADMIN_RIGHT_WIDTH;

  protected readonly agents = signal<AgentConfig[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly selectedId = signal<string | null>(null);
  protected readonly selected = computed(() => this.agents().find(a => a.id === this.selectedId()) ?? null);

  protected readonly llmLabel = llmLabel;
  protected readonly originLabel = originLabel;
  protected readonly executionLabel = (e: ExecutionType) => EXECUTION_LABELS[e] ?? e;

  protected readonly onRowClick = (row: AgentConfig) => this.selectedId.set(row.id);
  protected readonly rowClass = (row: AgentConfig) =>
    [row.id === this.selectedId() ? 'bg-primary-50' : '', row.enabled ? '' : 'opacity-60'].join(' ');

  protected readonly columns: TwangTableColumn<AgentConfig>[] = [
    { id: 'id', header: 'ID', align: 'left', sortable: true, width: '280px', cellTruncate: true, value: a => a.id },
    { id: 'name', header: 'Name', align: 'left', sortable: true, fillRemaining: true, minWidth: '200px', cellTruncate: true, value: a => a.name },
    { id: 'enabled', header: 'Status', align: 'left', sortable: true, width: '100px', value: a => (a.enabled ? 'Enabled' : 'Disabled') },
    { id: 'origin', header: 'Origin', align: 'left', sortable: true, width: '110px', value: a => originLabel(a.origin) },
    { id: 'execution', header: 'Execution', align: 'left', sortable: true, width: '130px', value: a => this.executionLabel(a.execution) },
    { id: 'pipeline', header: 'Pipeline', align: 'left', sortable: true, width: '140px', cellTruncate: true, value: a => a.pipeline?.type ?? '' },
    // "Public": standalone agents appear in the public catalog; the full word wastes width over Yes/No.
    { id: 'standalone', header: 'Public', align: 'left', sortable: true, width: '110px', value: a => (a.standalone ? 'Yes' : 'No') },
    { id: 'tools', header: 'Tools', align: 'right', sortable: true, width: '110px', value: a => a.tools.length + a.mcp_tools.length },
  ];

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.configService
      .getAgents()
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: agents => {
          this.agents.set(agents);
          // Keep the current selection if it's still there; otherwise select the top row in the
          // table's default order (execution A–Z; the sort is stable, so ties keep server order).
          if (this.selected()) return;
          const first = [...agents].sort((a, b) =>
            this.executionLabel(a.execution).localeCompare(this.executionLabel(b.execution)),
          )[0];
          this.selectedId.set(first?.id ?? null);
        },
        error: err => {
          console.error('Failed to load agents', err);
          this.error.set('Failed to load agents.');
        },
      });
  }
}
