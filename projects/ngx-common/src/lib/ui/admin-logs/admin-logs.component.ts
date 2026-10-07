import { DatePipe, formatDate } from '@angular/common';
import { Component, computed, inject, LOCALE_ID, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { LucideAngularModule } from 'lucide-angular';
import { TwangButtonComponent, TwangDatepickerComponent, TwangTableComponent, type TwangTableColumn } from 'ngx-twang-ui';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { AdminLogsService, type TurnLog, type TurnLogRequest } from '../../services/admin-logs.service';
import { ADMIN_RIGHT_WIDTH, ADMIN_TABLE_HEIGHT } from '../admin-page/admin-layout';
import { ThreePanelLayoutComponent } from '../three-panel-layout/three-panel-layout.component';

/** Default range: the last 7 days, today included. */
const DEFAULT_RANGE_DAYS = 7;

/** `YYYY-MM-DD` (the date picker's format) for a local date. */
function isoDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Start (or end) of a local `YYYY-MM-DD` day as an RFC 3339 UTC timestamp; null when unset. */
function dayBoundary(day: string, end: boolean): string | null {
  if (!day) return null;
  const [y, m, d] = day.split('-').map(Number);
  const date = end ? new Date(y, m - 1, d, 23, 59, 59, 999) : new Date(y, m - 1, d);
  return date.toISOString();
}

const rowKey = (t: TurnLog) => t.turn_id;

const money = (v: number | null | undefined) => (v ? `$${v.toFixed(4)}` : '—');

/** Milliseconds as seconds (one decimal), for the "Time (s)" labels. */
function seconds(ms: number | null | undefined): string {
  if (ms == null) return '—';
  return (ms / 1000).toFixed(1);
}

interface LoadState {
  loading: boolean;
  logs: TurnLog[];
  error: string | null;
}

/**
 * Admin > Logs: every conversation turn in a date range, with its model and cost. Left panel
 * filters by From/To date (inclusive local days; last 7 days by default), the middle table lists
 * turns newest first (the newest is selected on load), and the right panel shows the selected
 * turn's details and cost breakdown.
 */
@Component({
  selector: 'app-admin-logs',
  standalone: true,
  imports: [DatePipe, LucideAngularModule, ThreePanelLayoutComponent, TwangButtonComponent, TwangDatepickerComponent, TwangTableComponent],
  template: `
    <app-three-panel-layout
      leftTitle="Filters"
      [rightTitle]="selected()?.title || 'Details'"
      storageKey="admin.logs.layout"
      [rightWidth]="rightWidth"
      panelMinHeight="min-h-[70vh]"
    >
      <div left class="flex flex-col gap-4">
        <twang-datepicker label="From" placeholder="Start date" [value]="fromDay() ?? ''" (valueChange)="fromDay.set($event)" />
        <twang-datepicker label="To" placeholder="End date" [value]="toDay() ?? ''" (valueChange)="toDay.set($event)" />
        @if (rangeError()) {
          <p class="text-xs text-red-600">{{ rangeError() }}</p>
        }
        <twang-button variant="default" size="sm" label="Last 7 days" (buttonClick)="resetRange()" />
      </div>

      <div middle class="flex flex-1 flex-col overflow-hidden rounded-lg border border-border bg-white">
        <div class="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
          <span class="text-sm font-semibold text-primary-600">Turn Logs</span>
          <span class="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700">{{ logs().length }}</span>
          @if (logs().length) {
            <span class="text-xs text-text-muted">· {{ money(totalCost()) }} total</span>
          }
          <twang-button
            class="ml-auto"
            variant="default"
            size="sm"
            icon="refresh-cw"
            ariaLabel="Refresh logs"
            title="Refresh logs"
            [loading]="loading()"
            [disabled]="loading() || !!rangeError()"
            (buttonClick)="refresh()"
          />
        </div>
        <div class="flex min-h-0 flex-1 flex-col">
          @if (error()) {
            <div class="flex flex-1 items-center justify-center p-8 text-sm text-red-600">{{ error() }}</div>
          } @else {
            <twang-table
              [rows]="logs()"
              [columns]="columns"
              [loading]="loading()"
              [fillContainerWidth]="true"
              [onRowClick]="onRowClick"
              [rowClass]="rowClass"
              [scrollPanelMaxHeight]="tableHeight"
              [scrollPanelMinHeight]="tableHeight"
              initialSortKey="created_at"
              initialSortDir="desc"
              tableMinWidthClass="min-w-[1280px]"
              emptyMessage="No turns in this range."
            />
          }
        </div>
      </div>

      <div right class="flex flex-col gap-4 p-4 text-sm">
        @if (selected(); as t) {
          <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            <dt class="text-xs text-text-muted">Time</dt>
            <dd>{{ t.created_at | date: 'medium' }}</dd>
            <dt class="text-xs text-text-muted">User</dt>
            <dd class="break-all">{{ t.email || '—' }}</dd>
            <dt class="text-xs text-text-muted">Conversation</dt>
            <dd class="break-all font-mono text-xs">{{ t.conversation_id }}</dd>
            <dt class="text-xs text-text-muted">#Turns</dt>
            <dd>{{ t.sequence }}</dd>
            <dt class="text-xs text-text-muted">Agent</dt>
            <dd class="break-all">{{ t.agent_id || 'Chat' }}</dd>
            <dt class="text-xs text-text-muted">LLM</dt>
            <dd>{{ t.llm || '—' }}</dd>
            <dt class="text-xs text-text-muted">Model</dt>
            <dd class="break-all">{{ t.model || '—' }}</dd>
            <dt class="text-xs text-text-muted">Time (s)</dt>
            <dd>{{ seconds(t.execution_time_ms) }}</dd>
          </dl>

          <twang-button
            variant="primarySoft"
            size="sm"
            icon="git-branch"
            label="View execution"
            [title]="t.has_execution ? 'Agents, iterations and tool calls for this turn' : 'No execution trace recorded for this turn'"
            [disabled]="!t.has_execution"
            (buttonClick)="openExecution(t)"
          />

          <section class="flex flex-col gap-2 border-t border-border pt-4">
            <span class="text-xs font-semibold uppercase tracking-wider text-primary-600">Cost</span>
            <dl class="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2">
              <dt class="text-xs text-text-muted">Input</dt>
              <dd class="text-right tabular-nums">{{ money(t.input_tokens_cost) }}</dd>
              <dt class="text-xs text-text-muted">Cache read</dt>
              <dd class="text-right tabular-nums">{{ money(t.cached_read_tokens_cost) }}</dd>
              <dt class="text-xs text-text-muted">Cache write</dt>
              <dd class="text-right tabular-nums">{{ money(t.cached_write_tokens_cost) }}</dd>
              <dt class="text-xs text-text-muted">Output</dt>
              <dd class="text-right tabular-nums">{{ money(t.output_tokens_cost) }}</dd>
              <dt class="border-t border-border pt-2 text-xs font-semibold">Total</dt>
              <dd class="border-t border-border pt-2 text-right font-semibold tabular-nums">{{ money(t.total_tokens_cost) }}</dd>
            </dl>
          </section>
        } @else {
          <p class="text-text-muted">Select a turn to see its details.</p>
        }
      </div>
    </app-three-panel-layout>
  `,
})
export class AdminLogsComponent {
  private readonly logsService = inject(AdminLogsService);
  private readonly locale = inject(LOCALE_ID);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly rightWidth = ADMIN_RIGHT_WIDTH;
  protected readonly tableHeight = ADMIN_TABLE_HEIGHT;

  // Filters (date picker `YYYY-MM-DD`; empty = unbounded) and selection live in the service so
  // they survive a trip to a turn's execution page and back.
  protected readonly fromDay = this.logsService.fromDay;
  protected readonly toDay = this.logsService.toDay;
  private readonly reloads = signal(0);

  protected readonly rangeError = computed(() =>
    this.fromDay() && this.toDay() && this.fromDay()! > this.toDay()! ? '"From" must be on or before "To".' : null,
  );

  private readonly request = computed<TurnLogRequest | null>(() => {
    this.reloads();
    if (this.rangeError()) return null;
    return { from_date: dayBoundary(this.fromDay() ?? '', false), to_date: dayBoundary(this.toDay() ?? '', true) };
  });

  // Refetch whenever the range changes (or Refresh is pressed); switchMap drops stale responses.
  // Starts from the last loaded rows so returning from an execution page shows them immediately.
  private readonly state = signal<LoadState>({ loading: true, logs: this.logsService.lastLogs(), error: null });
  protected readonly loading = computed(() => this.state().loading);
  protected readonly logs = computed(() => this.state().logs);
  protected readonly error = computed(() => this.state().error);
  protected readonly totalCost = computed(() => this.logs().reduce((sum, t) => sum + (t.total_tokens_cost || 0), 0));

  protected readonly selectedKey = this.logsService.selectedKey;
  protected readonly selected = computed(() => {
    const key = this.selectedKey();
    return key ? (this.logs().find(t => rowKey(t) === key) ?? null) : null;
  });

  protected readonly money = money;
  protected readonly seconds = seconds;

  protected readonly onRowClick = (row: TurnLog) => this.selectedKey.set(rowKey(row));
  // Guard on a real key: rows without a `turn_id` would otherwise all match an unset selection.
  protected readonly rowClass = (row: TurnLog) => (!!rowKey(row) && rowKey(row) === this.selectedKey() ? 'bg-primary-50' : '');

  protected readonly columns: TwangTableColumn<TurnLog>[] = [
    {
      id: 'created_at',
      header: 'Time',
      align: 'left',
      sortable: true,
      width: '170px',
      value: t => t.created_at,
      format: v => (v ? formatDate(v, 'MMM d, HH:mm:ss', this.locale) : ''),
    },
    { id: 'email', header: 'User', align: 'left', sortable: true, width: '220px', cellTruncate: true, value: t => t.email },
    { id: 'title', header: 'Conversation', align: 'left', sortable: true, fillRemaining: true, minWidth: '200px', cellTruncate: true, value: t => t.title },
    { id: 'sequence', header: '#Turns', align: 'right', sortable: true, width: '110px', value: t => t.sequence },
    { id: 'agent', header: 'Agent', align: 'left', sortable: true, width: '160px', cellTruncate: true, value: t => t.agent_id || 'Chat' },
    { id: 'model', header: 'Model', align: 'left', sortable: true, width: '180px', cellTruncate: true, value: t => t.model },
    { id: 'total', header: 'Total cost', align: 'right', sortable: true, width: '140px', value: t => t.total_tokens_cost, format: v => money(Number(v)) },
    {
      id: 'execution_time',
      header: 'Time (s)',
      align: 'right',
      sortable: true,
      width: '100px',
      value: t => t.execution_time_ms,
      format: v => seconds(v == null ? null : Number(v)),
    },
  ];

  constructor() {
    if (this.fromDay() === null && this.toDay() === null) this.resetRange();

    toObservable(this.request)
      .pipe(
        switchMap(request => {
          if (!request) return of<Partial<LoadState>>({ loading: false, logs: [], error: null });
          return this.logsService.getTurnLogs(request).pipe(
            map((logs): Partial<LoadState> => ({ loading: false, logs, error: null })),
            catchError(err => {
              console.error('Failed to load turn logs', err);
              return of<Partial<LoadState>>({ loading: false, logs: [], error: 'Failed to load turn logs.' });
            }),
            // Only flips `loading` — the previous rows stay visible under the table's spinner.
            startWith<Partial<LoadState>>({ loading: true }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe(patch => {
        this.state.update(prev => ({ ...prev, ...patch }));
        if (this.loading() || this.selected()) return;
        // Select the newest turn — the top row in the table's default order.
        const newest = [...this.logs()].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
        this.selectedKey.set(newest ? rowKey(newest) : null);
      });
  }

  protected resetRange(): void {
    const today = new Date();
    const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (DEFAULT_RANGE_DAYS - 1));
    this.fromDay.set(isoDay(from));
    this.toDay.set(isoDay(today));
  }

  protected openExecution(t: TurnLog): void {
    this.router.navigate(['execution', t.turn_id], { relativeTo: this.route });
  }

  protected refresh(): void {
    this.reloads.update(n => n + 1);
  }
}
