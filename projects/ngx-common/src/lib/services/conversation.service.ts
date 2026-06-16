import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { Observable, tap } from 'rxjs';
import { API_BASE_URL } from './api-url.token';

export type ConversationStrategy = 'stateful' | 'stateless';
export type HistoryMode = 'full' | 'last_n' | 'none';

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
  strategy: string;
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
  private readonly auth = inject(Auth);
  private readonly base = inject(API_BASE_URL);

  private readonly _conversations = signal<Conversation[]>([]);
  readonly conversations = this._conversations.asReadonly();

  getConversations(): Observable<Conversation[]> {
    return this.http.get<Conversation[]>(`${this.base}/conversations`).pipe(
      tap(data => this._conversations.set(data))
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

  sendMessage(conversationId: string, userPrompt: string): Observable<CompletionChunkResponse> {
    return new Observable(subscriber => {
      const doFetch = async (token: string) => {
        let buffer = '';
        try {
          const response = await fetch(`${this.base}/conversations/${conversationId}/turns/stream`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
              'Accept': 'text/event-stream',
            },
            body: JSON.stringify({ prompt: userPrompt }),
          });

          if (!response.ok || !response.body) {
            subscriber.error(new Error(`HTTP ${response.status}`));
            return;
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith('data:')) continue;
              const json = trimmed.slice(5).trim();
              if (!json || json === '[DONE]') continue;
              try {
                const chunk = JSON.parse(json) as CompletionChunkResponse;
                subscriber.next(chunk);
                if (chunk.is_final) {
                  subscriber.complete();
                  return;
                }
              } catch {
                // partial line — wait for more data
              }
            }
          }

          subscriber.complete();
        } catch (err) {
          subscriber.error(err);
        }
      };

      const user = this.auth.currentUser;
      if (user) {
        user.getIdToken()
          .then(token => doFetch(token))
          .catch(err => subscriber.error(err));
      } else {
        doFetch('').catch(err => subscriber.error(err));
      }
    });
  }
}
