import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { map, Observable, Subject, tap } from 'rxjs';
import { postEventStream, type StreamAttachment, type StreamEvent } from '../http/event-stream';
import { API_BASE_URL } from './api-url.token';
import { AuthService } from '../auth/auth.service';
import type { TokenUsage } from '../models/turn-execution';

export type ConversationStrategy = 'stateful' | 'stateless';
export type HistoryMode = 'full' | 'trimmed' | 'last_n' | 'none';

export interface ConversationRequest {
  conversation_type: 'chat' | 'agent';
  title?: string;
  template_id?: string;
  system_prompt?: string;
  agent_id?: string;
  llm: string;
  model: string;
  stream: boolean;
  strategy?: ConversationStrategy;
  history_mode?: HistoryMode;
  max_turns?: number;
}

export interface ConversationUpdateRequest {
  title?: string;
  system_prompt?: string;
  stream?: boolean;
  strategy?: ConversationStrategy;
  history_mode?: HistoryMode;
  max_turns?: number;
}

export interface Conversation {
  id: string;
  title: string;
  agent_id: string;
  conversation_type: string;
  created_at: string;
  last_updated_at: string;
  llm: string;
  model: string;
  total_tokens_cost: number;
  /** Token counts accumulated over the conversation; null/absent until the first turn. */
  usage?: TokenUsage | null;
  strategy: string;
  stream?: boolean;
  system_prompt?: string;
  history_mode?: HistoryMode;
  max_turns?: number;
  uid: string;
}

export interface Turn {
  id: string;
  conversation_id: string;
  sequence: number;
  user_prompt: string;
  response_content: string;
  created_at: string;
  total_tokens_cost: number;
  /** Files made for the turn (e.g. its report PDF); absent when there are none. */
  exports?: TurnExport[];
}

/** A file stored for a turn (backend `TurnExport`). */
export interface TurnExport {
  format: string;
  file_id: string;
  file_name: string;
  mime: string;
  size: number;
  created_at: string;
}

export interface CompletionChunkResponse {
  id: string;
  model: string;
  response_id: string;
  content: string;
  thought: string;
  thinking: string;
  status: string;
  is_final: boolean;
  usage: unknown | null;
  tool_call: unknown | null;
}

@Injectable({ providedIn: 'root' })
export class ConversationService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly base = inject(API_BASE_URL);

  private readonly _conversations = signal<Conversation[]>([]);
  readonly conversations = this._conversations.asReadonly();

  private readonly _deleted$ = new Subject<void>();
  readonly deleted$ = this._deleted$.asObservable();

  getConversations(): Observable<Conversation[]> {
    return this.http.get<Conversation[]>(`${this.base}/conversations`).pipe(
      tap(data => {
        const existingMap = new Map(this._conversations().map(c => [c.id, c]));
        this._conversations.set(data.map(c => ({ ...(existingMap.get(c.id) ?? {}), ...c })));
      })
    );
  }

  getById(id: string): Conversation | undefined {
    return this._conversations().find(c => c.id === id);
  }

  getTurns(conversationId: string): Observable<Turn[]> {
    return this.http.get<Turn[]>(`${this.base}/conversations/${conversationId}/turns`);
  }

  createConversation(payload: ConversationRequest): Observable<Conversation> {
    return this.http.post<Conversation>(`${this.base}/conversations`, payload).pipe(
      tap(conv => this._conversations.update(list => [conv, ...list]))
    );
  }

  updateConversation(id: string, payload: ConversationUpdateRequest): Observable<Conversation> {
    return this.http.patch<Conversation>(`${this.base}/conversations/${id}`, payload).pipe(
      tap(updated => this._conversations.update(list => list.map(c => c.id === id ? { ...c, ...updated } : c)))
    );
  }

  deleteConversation(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/conversations/${id}`).pipe(
      tap(() => {
        this._conversations.update(list => list.filter(c => c.id !== id));
        this._deleted$.next();
      })
    );
  }

  /** A turn's report PDF as a download (the same URL the turn stream's `attachment` event gives). */
  turnAttachment(turn: Turn): StreamAttachment | undefined {
    const pdf = turn.exports?.find(e => e.format === 'pdf');
    if (!pdf) return undefined;
    const url = `${this.base}/conversations/${turn.conversation_id}/turns/${turn.id}/report.pdf`;
    return { file_name: pdf.file_name, mime: pdf.mime, size: pdf.size, url };
  }

  /**
   * Sends a turn. Streaming: the turn's events as they arrive (see `postEventStream`); otherwise
   * the one response as a single `message` event.
   */
  sendMessage(conversationId: string, userPrompt: string, stream = true): Observable<StreamEvent<CompletionChunkResponse>> {
    if (!stream) {
      return this.http
        .post<CompletionChunkResponse>(`${this.base}/conversations/${conversationId}/turns`, { prompt: userPrompt })
        .pipe(map(data => ({ type: 'message' as const, data })));
    }
    // AuthService.getIdToken() falls back to the last known-good token when a live refresh fails
    // (e.g. no network reaching Google after the tab sat idle), so this stays authenticated
    // through a transient blip instead of failing outright.
    return postEventStream<CompletionChunkResponse>(
      `${this.base}/conversations/${conversationId}/turns/stream`,
      { prompt: userPrompt },
      () => this.auth.getIdToken(),
      this.base,
    );
  }
}
