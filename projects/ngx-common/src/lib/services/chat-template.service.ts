import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, shareReplay } from 'rxjs';
import { SKIP_AUTH } from '../auth/auth.interceptor';
import { API_BASE_URL } from './api-url.token';

export interface ChatTemplate {
  id: string;
  category: string;
  title: string;
  description: string;
  system_prompt: string | null;
  suggested_prompts: string[];
  recommended_llm: string;
  icon: string;
}

@Injectable({ providedIn: 'root' })
export class ChatTemplateService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  private readonly templates$ = this.http
    .get<ChatTemplate[]>(`${this.base}/chat-templates`, {
      context: new HttpContext().set(SKIP_AUTH, true),
    })
    .pipe(shareReplay(1));

  getChatTemplates(): Observable<ChatTemplate[]> {
    return this.templates$;
  }
}
