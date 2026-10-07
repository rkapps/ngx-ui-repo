import { DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { Component, computed, DestroyRef, effect, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { TwangTreeTableComponent, type TwangTreeTableColumn } from 'ngx-twang-ui';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { buildTurnTree, type ExecNode, execNodePath, type ExecRow, findExecNode, rowOf, type TokenUsage } from '../../models/turn-execution';
import { AdminLogsService, type TurnLogDetail } from '../../services/admin-logs.service';
import { type AdminCrumb, AdminBreadcrumbs } from '../admin-page/admin-breadcrumbs';
import { ADMIN_RIGHT_WIDTH, ADMIN_TABLE_HEIGHT } from '../admin-page/admin-layout';
import { ThreePanelLayoutComponent } from '../three-panel-layout/three-panel-layout.component';
import { JsonViewComponent } from './json-view.component';

const KIND_LABELS: Record<ExecRow['kind'], string> = {
  turn: 'Turn',
  agent: 'Agent',
  synthesizer: 'Synthesizer',
  pipeline: 'Pipeline',
  stage: 'Stage',
  decision: 'Decision',
  iteration: 'Iteration',
  tool: 'Tool call',
};

const KIND_ICONS: Record<ExecRow['kind'], string> = {
  turn: 'message-square',
  agent: 'bot',
  synthesizer: 'sparkles',
  pipeline: 'workflow',
  stage: 'layers',
  decision: 'git-branch',
  iteration: 'refresh-cw',
  tool: 'wrench',
};

/** Text color per step type — only agents and synthesizers are tinted, to keep the tree calm. */
const KIND_TEXT: Partial<Record<ExecRow['kind'], string>> = {
  turn: 'text-primary-600',
  agent: 'text-primary-600',
  synthesizer: 'text-green-600',
};
const kindText = (r: ExecRow) => KIND_TEXT[r.kind] ?? '';

const USAGE_FIELDS: { key: keyof TokenUsage; label: string }[] = [
  { key: 'input_tokens', label: 'Input' },
  { key: 'cached_read_tokens', label: 'Cache read' },
  { key: 'cached_write_tokens', label: 'Cache write' },
  { key: 'output_tokens', label: 'Output' },
  { key: 'reasoning_tokens', label: 'Reasoning' },
  { key: 'tool_use_tokens', label: 'Tool use' },
  { key: 'total_tokens', label: 'Total' },
];

const seconds = (ms: number | null | undefined) => (ms == null ? '—' : (ms / 1000).toFixed(2));

/**
 * Admin > Logs > Execution: one turn's full execution trace across three panels — the left is the
 * tree (agents, pipeline stages / orchestrator decisions, iterations, tool calls) in a scrolling
 * `twang-tree-table`; the middle shows the selected step's payloads (prompt/content, tool
 * input/output JSON, reasoning, child steps); the right shows its properties and token usage.
 * The selection lives in `?node=`, and the admin sub header shows the path to it as breadcrumbs.
 *
 * The turn is fetched by `:turnId` (so reloads and shared links work); when arriving from Logs,
 * the already-loaded row fills the breadcrumbs while the trace loads.
 */
@Component({
  selector: 'app-turn-execution',
  standalone: true,
  imports: [DecimalPipe, JsonViewComponent, LucideAngularModule, NgTemplateOutlet, ThreePanelLayoutComponent, TwangTreeTableComponent],
  template: `
    @if (load().loading) {
      <div class="flex min-h-[50vh] items-center justify-center gap-2 rounded-lg border border-border bg-white p-8 text-sm text-text-muted">
        <lucide-icon name="loader-circle" [size]="16" class="animate-spin" /> Loading execution…
      </div>
    } @else if (load().error) {
      <div class="flex min-h-[50vh] flex-col items-center justify-center gap-3 rounded-lg border border-border bg-white p-8 text-center text-sm">
        <lucide-icon name="git-branch" [size]="28" class="text-text-muted" />
        <p class="text-red-600">{{ load().error }}</p>
      </div>
    } @else if (!tree()) {
      <div class="flex min-h-[50vh] items-center justify-center rounded-lg border border-border bg-white p-8 text-sm text-text-muted">
        No execution trace was recorded for this turn.
      </div>
    } @else {
      <app-three-panel-layout
        leftTitle="Execution"
        leftWidth="w-[32rem]"
        [rightTitle]="selected() ? kindLabel(selected()!) : 'Details'"
        [rightWidth]="rightWidth"
        storageKey="admin.logs.execution.layout"
        panelMinHeight="min-h-[70vh]"
      >
        <!-- Left: the tree; fixed height so it scrolls under its sticky header. -->
        <div left class="-m-3">
          <twang-tree-table
            [nodes]="nodes()"
            [columns]="columns"
            [selectedId]="selectedId()"
            [initialExpandedDepth]="99"
            [fillContainerWidth]="true"
            [scrollPanelMaxHeight]="treeHeight"
            [scrollPanelMinHeight]="treeHeight"
            tableMinWidthClass="min-w-0"
            (nodeSelected)="select($event.id)"
          />
        </div>

        <!-- Middle: payloads. Fixed to the tree's height; the main payload fills what's left. -->
        <!-- flex-none, not flex-1: in the auto-height middle column flex-1 sizes to content and overrides h-[70vh]. -->
        <div middle class="flex h-[70vh] flex-none flex-col overflow-hidden rounded-lg border border-border bg-white">
          @if (selected(); as row) {
            <div class="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
              <lucide-icon [name]="icon(row)" [size]="16" [class]="kindText(row) || 'text-text-muted'" />
              <span class="min-w-0 truncate text-sm font-semibold" [class]="kindText(row) || 'text-text'">{{ row.label }}</span>
              @if (row.error) {
                <span class="rounded bg-red-50 px-1.5 py-0.5 text-[10px] uppercase text-red-700">error</span>
              }
            </div>

            <div class="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4 text-sm">
              @switch (row.kind) {
                @case ('tool') {
                  @if (asTool(row); as t) {
                    @if (t.error) {
                      <div class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{{ t.error }}</div>
                    }
                    <!-- Kept short so the Output below gets most of the card. -->
                    <app-json-view title="Input" [value]="t.input" emptyText="No input." maxHeightClass="max-h-48" />
                    <app-json-view title="Output" [value]="t.output" emptyText="No output." [fill]="true" />
                  }
                }
                @case ('decision') {
                  @if (asDecision(row); as d) {
                    <app-json-view title="Reasoning" [text]="d.decision.reasoning" />
                    <section class="flex flex-col gap-2">
                      <span class="text-xs font-semibold uppercase tracking-wider text-primary-600">Nominated agents</span>
                      @for (a of d.decision.agents; track $index) {
                        <div class="rounded-md border border-border px-3 py-2">
                          <div class="font-mono text-xs font-medium">{{ a.id }}</div>
                          @if (a.goal) {
                            <div class="mt-1 text-xs text-text-muted">{{ a.goal }}</div>
                          }
                        </div>
                      }
                    </section>
                    <ng-container *ngTemplateOutlet="stepsTpl" />
                  }
                }
                @case ('stage') {
                  <ng-container *ngTemplateOutlet="stepsTpl" />
                }
                @case ('pipeline') {
                  <ng-container *ngTemplateOutlet="stepsTpl" />
                }
                @case ('iteration') {
                  @if (selectedChildren().length) {
                    <ng-container *ngTemplateOutlet="stepsTpl" />
                  } @else {
                    <p class="text-text-muted">No tool calls — this iteration produced the agent's final response.</p>
                  }
                }
                @default {
                  @if (asAgent(row); as a) {
                    <!-- Kept short (synthesizer prompts carry the previous stage's output) so Content gets most of the card. -->
                    <app-json-view title="Prompt" [text]="a.turn.prompt" maxHeightClass="max-h-48" />
                    <app-json-view title="Content" [text]="a.turn.content || a.agent?.content" [fill]="true" />
                  }
                }
              }
            </div>
          } @else {
            <div class="flex flex-1 items-center justify-center p-8 text-sm text-text-muted">Select a step in the tree.</div>
          }
        </div>

        <!-- Right: properties -->
        <div right class="flex flex-col gap-4 p-4 text-sm">
          @if (selected(); as row) {
            <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
              <dt class="text-xs text-text-muted">Type</dt>
              <dd>{{ kindLabel(row) }}</dd>
              <dt class="text-xs text-text-muted">Time (s)</dt>
              <dd class="tabular-nums" [class.text-red-600]="row.error">{{ seconds(row.duration_ms) }}</dd>
              @switch (row.kind) {
                @case ('tool') {
                  @if (asTool(row); as t) {
                    <dt class="text-xs text-text-muted">Tool</dt>
                    <dd class="break-all font-mono text-xs">{{ t.name }}</dd>
                    <dt class="text-xs text-text-muted">Call id</dt>
                    <dd class="break-all font-mono text-xs">{{ t.id }}</dd>
                    <dt class="text-xs text-text-muted">Status</dt>
                    <dd [class.text-red-600]="!!t.error">{{ t.error ? 'Error' : 'OK' }}</dd>
                  }
                }
                @case ('iteration') {
                  @if (asIteration(row); as it) {
                    <dt class="text-xs text-text-muted">Iteration</dt>
                    <dd>{{ it.iteration }}</dd>
                    <dt class="text-xs text-text-muted">Tool calls</dt>
                    <dd>{{ it.tool_calls.length }}</dd>
                    <dt class="text-xs text-text-muted">Finish reason</dt>
                    <dd>{{ it.finish_reason || '—' }}</dd>
                    <dt class="text-xs text-text-muted">Response id</dt>
                    <dd class="break-all font-mono text-xs">{{ it.response_id || '—' }}</dd>
                  }
                }
                @case ('pipeline') {
                  @if (asPipeline(row); as p) {
                    <dt class="text-xs text-text-muted">Mode</dt>
                    <dd>{{ p.mode }}</dd>
                    <dt class="text-xs text-text-muted">{{ p.mode === 'Deterministic' ? 'Stages' : 'Decisions' }}</dt>
                    <dd>{{ p.steps }}</dd>
                    <dt class="text-xs text-text-muted">Synthesizer</dt>
                    <dd class="break-all font-mono text-xs">{{ p.synthesizer?.agent_id ?? '—' }}</dd>
                  }
                }
                @case ('stage') {
                  @if (asStage(row); as s) {
                    <dt class="text-xs text-text-muted">Stage</dt>
                    <dd class="break-all">{{ s.name }}</dd>
                    <dt class="text-xs text-text-muted">Agents</dt>
                    <dd>{{ s.responses.length }}</dd>
                  }
                }
                @case ('decision') {
                  @if (asDecision(row); as d) {
                    <dt class="text-xs text-text-muted">Iteration</dt>
                    <dd>{{ d.iteration }}</dd>
                    <dt class="text-xs text-text-muted">Execution</dt>
                    <dd>{{ d.decision.execution }}</dd>
                    <dt class="text-xs text-text-muted">Stop</dt>
                    <dd>{{ d.decision.stop ? 'Yes (synthesis)' : 'No' }}</dd>
                  }
                }
                @default {
                  @if (asAgent(row); as a) {
                    <dt class="text-xs text-text-muted">Agent</dt>
                    <dd class="break-all font-mono text-xs">{{ a.turn.agent_id }}</dd>
                    @if (a.agent?.model) {
                      <dt class="text-xs text-text-muted">Model</dt>
                      <dd class="break-all">{{ a.agent!.model }}</dd>
                    }
                    <dt class="text-xs text-text-muted">Steps</dt>
                    <dd>{{ row.meta || '—' }}</dd>
                    <dt class="text-xs text-text-muted">Response id</dt>
                    <dd class="break-all font-mono text-xs">{{ a.turn.response_id || a.agent?.response_id || '—' }}</dd>
                  }
                }
              }
            </dl>

            @if (usage(); as u) {
              <section class="flex flex-col gap-2 border-t border-border pt-4">
                <span class="text-xs font-semibold uppercase tracking-wider text-primary-600">Token usage</span>
                <dl class="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5">
                  @for (f of usageFields; track f.key) {
                    <dt class="text-xs text-text-muted" [class.font-semibold]="f.key === 'total_tokens'">{{ f.label }}</dt>
                    <dd class="text-right tabular-nums" [class.font-semibold]="f.key === 'total_tokens'">{{ u[f.key] | number }}</dd>
                  }
                </dl>
              </section>
            }
          } @else {
            <p class="text-text-muted">Select a step in the tree.</p>
          }
        </div>
      </app-three-panel-layout>
    }

    <!-- Child steps of the selected node, as a clickable list (stages, decisions, iterations). -->
    <ng-template #stepsTpl>
      <section class="flex flex-col gap-2">
        <span class="text-xs font-semibold uppercase tracking-wider text-primary-600">Steps</span>
        @for (child of selectedChildren(); track child.id) {
          <button
            type="button"
            class="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-left hover:border-primary-300 hover:bg-primary-50"
            (click)="select(child.id)"
          >
            <lucide-icon [name]="icon(child.row)" [size]="14" class="shrink-0" [class]="kindText(child.row) || 'text-text-muted'" />
            <span class="min-w-0 flex-1 truncate font-medium" [class]="child.row.error ? 'text-red-600' : kindText(child.row)">{{ child.row.label }}</span>
            @if (child.row.meta) {
              <span class="shrink-0 text-xs text-text-muted">{{ child.row.meta }}</span>
            }
            <span class="shrink-0 text-xs tabular-nums text-text-muted">{{ seconds(child.row.duration_ms) }} s</span>
          </button>
        }
      </section>
    </ng-template>
  `,
})
export class TurnExecutionComponent {
  private readonly logsService = inject(AdminLogsService);
  private readonly breadcrumbs = inject(AdminBreadcrumbs);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly treeHeight = ADMIN_TABLE_HEIGHT;
  protected readonly rightWidth = ADMIN_RIGHT_WIDTH;
  protected readonly usageFields = USAGE_FIELDS;
  protected readonly seconds = seconds;

  private readonly turnId = toSignal(this.route.paramMap.pipe(map(p => p.get('turnId') ?? '')), { requireSync: true });
  private readonly nodeParam = toSignal(this.route.queryParamMap.pipe(map(q => q.get('node'))), { initialValue: null });

  /** The turn's detail (log row + execution), fetched whenever `:turnId` changes. */
  protected readonly load = toSignal(
    toObservable(this.turnId).pipe(
      switchMap(id =>
        this.logsService.getTurnDetail(id).pipe(
          map(detail => ({ loading: false, detail, error: null as string | null })),
          catchError(err => {
            console.error('Failed to load turn execution', err);
            const error = err?.status === 404 ? "This turn doesn't exist." : "Couldn't load this turn's execution.";
            return of({ loading: false, detail: null as TurnLogDetail | null, error });
          }),
          startWith({ loading: true, detail: null as TurnLogDetail | null, error: null as string | null }),
        ),
      ),
    ),
    { initialValue: { loading: true, detail: null as TurnLogDetail | null, error: null as string | null } },
  );

  /** Summary for the breadcrumbs: the loaded detail, else the row cached by the Logs page. */
  protected readonly turn = computed(() => this.load().detail ?? this.logsService.findTurn(this.turnId()));

  protected readonly tree = computed<ExecNode | null>(() => {
    const execution = this.load().detail?.execution;
    return execution ? buildTurnTree(execution) : null;
  });

  protected readonly nodes = computed(() => {
    const tree = this.tree();
    return tree ? [tree] : [];
  });

  /** Selected node id from `?node=`, defaulting to the root (the whole turn). */
  protected readonly selectedId = computed(() => {
    const tree = this.tree();
    if (!tree) return null;
    const id = this.nodeParam();
    return id && findExecNode(tree, id) ? id : tree.id;
  });

  /** Root → selected node. */
  private readonly path = computed(() => {
    const tree = this.tree();
    const id = this.selectedId();
    return tree && id ? execNodePath(tree, id) : [];
  });

  protected readonly selected = computed(() => {
    const node = this.path().at(-1);
    return node ? rowOf(node) : null;
  });

  protected readonly selectedChildren = computed(() =>
    (this.path().at(-1)?.children ?? []).map(child => ({ id: child.id, row: rowOf(child) })),
  );

  protected readonly usage = computed<TokenUsage | null>(() => {
    const row = this.selected();
    if (!row) return null;
    if (row.kind === 'iteration') return row.data.usage;
    if (row.kind === 'turn' || row.kind === 'agent' || row.kind === 'synthesizer') return row.data.agent?.usage ?? row.data.turn.usage;
    return null;
  });

  protected readonly columns: TwangTreeTableColumn<ExecRow>[] = [
    {
      id: 'label',
      header: 'Step',
      align: 'left',
      isLabelColumn: true,
      fillRemaining: true,
      value: r => (r.error ? `${r.label} (error)` : r.label),
      cellClass: kindText,
    },
    {
      id: 'time',
      header: 'Time (s)',
      align: 'right',
      width: '80px',
      value: r => r.duration_ms,
      format: v => (v == null ? '' : seconds(Number(v))),
      cellClass: r => (r.error ? 'text-red-600' : ''),
    },
  ];

  constructor() {
    // Breadcrumbs after "Logs": the turn, then the path down to the selected step. Each crumb
    // selects that step (the turn crumb selects the root).
    effect(() => {
      const turn = this.turn();
      if (!turn) {
        this.breadcrumbs.set([{ label: 'Execution' }]);
        return;
      }
      const base = [this.router.url.split(/[?#]/)[0]];
      const crumbs: AdminCrumb[] = [{ label: `${turn.title || 'Untitled conversation'} · #${turn.sequence}`, path: base }];
      for (const node of this.path().slice(1)) {
        crumbs.push({ label: node.label, path: base, queryParams: { node: node.id } });
      }
      this.breadcrumbs.set(crumbs);
    });
    inject(DestroyRef).onDestroy(() => this.breadcrumbs.clear());
  }

  protected select(id: string): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: { node: id }, replaceUrl: true });
  }

  // Template helpers — narrow the row union for each @case.
  protected readonly kindText = kindText;
  protected readonly kindLabel = (r: ExecRow) => KIND_LABELS[r.kind];
  protected readonly icon = (r: ExecRow) => KIND_ICONS[r.kind];
  protected readonly asTool = (r: ExecRow) => (r.kind === 'tool' ? r.data : null);
  protected readonly asIteration = (r: ExecRow) => (r.kind === 'iteration' ? r.data : null);
  protected readonly asPipeline = (r: ExecRow) => (r.kind === 'pipeline' ? r.data : null);
  protected readonly asStage = (r: ExecRow) => (r.kind === 'stage' ? r.data : null);
  protected readonly asDecision = (r: ExecRow) => (r.kind === 'decision' ? r.data : null);
  protected readonly asAgent = (r: ExecRow) => (r.kind === 'turn' || r.kind === 'agent' || r.kind === 'synthesizer' ? r.data : null);
}
