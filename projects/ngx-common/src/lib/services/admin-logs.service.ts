import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
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

/**
 * Admin turn logs (cost/usage per turn across every user) and per-turn execution traces. Also
 * holds the Logs page's view state — filters, selection, last loaded rows — so it survives
 * navigating to a turn's execution page and back (where the cached row paints the header while
 * the full detail loads).
 */
@Injectable({ providedIn: 'root' })
export class AdminLogsService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  /** Logs filters as date-picker days (`YYYY-MM-DD`); empty = unbounded. Null until first set. */
  readonly fromDay = signal<string | null>(null);
  readonly toDay = signal<string | null>(null);
  /** `turn_id` of the selected row. */
  readonly selectedKey = signal<string | null>(null);
  /** Rows from the most recent successful load. */
  readonly lastLogs = signal<TurnLog[]>([]);

  getTurnLogs(request: TurnLogRequest): Observable<TurnLog[]> {
    return this.http.post<TurnLog[]>(`${this.base}/admin/turns/logs`, request).pipe(tap(logs => this.lastLogs.set(logs)));
  }

  getTurnDetail(turnId: string): Observable<TurnLogDetail> {
    return this.http.post<TurnLogDetail>(`${this.base}/admin/turns/execution/${encodeURIComponent(turnId)}`, null);
  }

  /** A turn from the last loaded logs, or null if it isn't there (e.g. after a page reload). */
  findTurn(turnId: string): TurnLog | null {
    return this.lastLogs().find(t => t.turn_id === turnId) ?? null;
  }
}
