import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, shareReplay } from 'rxjs';
import { SKIP_AUTH } from '../auth/auth.interceptor';
import { API_BASE_URL } from './api-url.token';

export interface Agent {
  id: string;
  name: string;
  description: string;
  preset: string;
  standalone: boolean;
  execution: string;
  system_prompt?: string;
}

export interface LlmProvider {
  id: string;
  llm: string;
  models: string[];
  default_model: string;
}

@Injectable({ providedIn: 'root' })
export class AgentService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  private readonly skipAuth = { context: new HttpContext().set(SKIP_AUTH, true) };

  private readonly providers$ = this.http
    .get<LlmProvider[]>(`${this.base}/llm-providers`, this.skipAuth)
    .pipe(shareReplay(1));

  getAgents(): Observable<Agent[]> {
    return this.http.get<Agent[]>(`${this.base}/agents`, this.skipAuth);
  }

  getLlmProviders(): Observable<LlmProvider[]> {
    return this.providers$;
  }
}
