import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from './api-url.token';

export interface Agent {
  id: string;
  name: string;
  description: string;
  preset: string;
  standalone: boolean;
  execution: string;
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

  getAgents(): Observable<Agent[]> {
    return this.http.get<Agent[]>(`${this.base}/agents`);
  }

  getLlmProviders(): Observable<LlmProvider[]> {
    return this.http.get<LlmProvider[]>(`${this.base}/llm-providers`);
  }
}
