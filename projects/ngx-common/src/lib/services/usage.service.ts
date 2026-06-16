import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { API_BASE_URL } from './api-url.token';

export interface ConversationUsage {
  id: string;
  title: string;
  conversation_type: string;
  llm: string;
  model: string;
  strategy: string;
  total_tokens_cost: number;
  created_at: string;
  last_updated_at: string;
}

@Injectable({ providedIn: 'root' })
export class UsageService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  getUsageConversations(filters: {
    conversationType?: string;
    llm?: string;
    startDate?: string;
    endDate?: string;
  } = {}) {
    let params = new HttpParams();
    if (filters.conversationType) params = params.set('conversation_type', filters.conversationType);
    if (filters.llm) params = params.set('llm', filters.llm);
    if (filters.startDate) params = params.set('start_date', filters.startDate);
    if (filters.endDate) params = params.set('end_date', filters.endDate);
    return this.http.get<ConversationUsage[]>(`${this.baseUrl}/conversations`, { params });
  }
}
