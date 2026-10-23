import { HttpClient } from '@angular/common/http';
import { inject, Injectable, InjectionToken, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import type { TurnResponse } from '../models/turn-execution';
import { API_BASE_URL } from './api-url.token';

/** One conversation turn with its model and cost, as listed by `POST /admin/turns/logs`. */
export interface TurnLog {
  /** Unique turn id; keys the detail endpoint. */
  turn_id: string;
  /** Email of the user who owns the conversation. */
  email: string;
  conversation_id: string;
  sequence: number;
  title: string;
  /** Empty for chat turns (no agent). */
  agent_id: string;
  llm: string;
  model: string;
  created_at: string;
  input_tokens_cost: number;
  cached_read_tokens_cost: number;
  cached_write_tokens_cost: number;
  output_tokens_cost: number;
  total_tokens_cost: number;
  execution_time_ms: number | null;
  /** Whether an execution trace was recorded (fetch it with `getTurnDetail`). */
  has_execution: boolean;
}

/** `POST /admin/turns/execution/{turn_id}`: the log row plus its full execution trace. */
export interface TurnLogDetail extends TurnLog {
  /** Null when no trace was recorded, or it couldn't be parsed on the server. */
  execution: TurnResponse | null;
}

export interface TurnLogRequest {
  /** RFC 3339 timestamp, inclusive; `null` for no lower bound. */
  from_date: string | null;
  /** RFC 3339 timestamp, inclusive; `null` for no upper bound. */
  to_date: string | null;
}

export type TurnLogsScope = 'admin' | 'user';

/**
 * Turn logs (cost/usage per turn) and per-turn execution traces, for one scope: `admin` sees
 * every user's turns (`/admin/turns/...`), `user` only the caller's own (`/turns/...`). Both
 * endpoints share request/response shapes. Also holds the Logs page's view state — filters,
 * selection, last loaded rows — so it survives navigating to a turn's execution page and back
 * (where the cached row paints the breadcrumbs while the full detail loads).
 *
 * Pages get the scoped instance through `TURN_LOGS`, provided on the route.
 */
export abstract class TurnLogsService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  /** Logs filters as date-picker days (`YYYY-MM-DD`); empty = unbounded. Null until first set. */
  readonly fromDay = signal<string | null>(null);
  readonly toDay = signal<string | null>(null);
  /** LLM / user (email) filters on the loaded rows; '' = all. */
  readonly llmFilter = signal('');
  readonly userFilter = signal('');
  /** `turn_id` of the selected row. */
  readonly selectedKey = signal<string | null>(null);
  /** Rows from the most recent successful load. */
  readonly lastLogs = signal<TurnLog[]>([]);

  constructor(readonly scope: TurnLogsScope) {}

  private get prefix(): string {
    return this.scope === 'admin' ? `${this.base}/admin/turns` : `${this.base}/turns`;
  }

  /** Where the logs list is POSTed; a subclass can point it elsewhere (e.g. `/analytics/logs`). */
  protected logsUrl(): string {
    return `${this.prefix}/logs`;
  }

  getTurnLogs(request: TurnLogRequest): Observable<TurnLog[]> {
    return this.http.post<TurnLog[]>(this.logsUrl(), request).pipe(tap(logs => this.lastLogs.set(logs)));
  }

  getTurnDetail(turnId: string): Observable<TurnLogDetail> {
    return this.http.get<TurnLogDetail>(`${this.prefix}/execution/${encodeURIComponent(turnId)}`);
  }

  /** A turn from the last loaded logs, or null if it isn't there (e.g. after a page reload). */
  findTurn(turnId: string): TurnLog | null {
    return this.lastLogs().find(t => t.turn_id === turnId) ?? null;
  }
}

/**
 * Every user's turns for Admin › Analytics › Logs (admin-only on the backend): the list from
 * `/admin/analytics/logs`, executions from `/admin/turns/execution/{id}`.
 */
@Injectable({ providedIn: 'root' })
export class AdminLogsService extends TurnLogsService {
  private readonly apiBase = inject(API_BASE_URL);

  constructor() {
    super('admin');
  }

  protected override logsUrl(): string {
    return `${this.apiBase}/admin/analytics/logs`;
  }
}

/** The signed-in user's own turns — `/turns/...`. */
@Injectable({ providedIn: 'root' })
export class UserLogsService extends TurnLogsService {
  constructor() {
    super('user');
  }
}

/**
 * The signed-in user's own turns for Analytics › Logs: the list from `/analytics/logs`, executions
 * from `/turns/execution/{id}`. Otherwise the user scope (no User column).
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsLogsService extends TurnLogsService {
  private readonly apiBase = inject(API_BASE_URL);

  constructor() {
    super('user');
  }

  protected override logsUrl(): string {
    return `${this.apiBase}/analytics/logs`;
  }
}

/** The `TurnLogsService` a Logs route works with; provide it on the route (`useExisting`). */
export const TURN_LOGS = new InjectionToken<TurnLogsService>('TURN_LOGS');
