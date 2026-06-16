import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { LucideAngularModule } from 'lucide-angular';
import { ChatComponent } from '../chat/chat.component';
import type { ChatMessage } from '../chat/chat-message';
import { UsageTableComponent } from '../usage-table/usage-table.component';
import { ConversationService, type Conversation, type Turn } from '../../services/conversation.service';

@Component({
  selector: 'app-conversation-detail',
  standalone: true,
  imports: [LucideAngularModule, ChatComponent, UsageTableComponent],
  host: { class: 'flex flex-1 flex-col min-h-0' },
  template: `
    @if (conversation(); as conv) {
      <div class="flex h-full flex-col">
        <!-- Header -->
        <div class="flex min-h-16 shrink-0 items-center justify-between gap-4 border-b border-border px-5">
          <div class="min-w-0">
            <h2 class="truncate text-base font-semibold text-primary-600">{{ conv.title }}</h2>
            <p class="text-xs text-text-muted">{{ conv.model }}</p>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <button
              class="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-surface-muted"
              [class.text-primary-600]="showUsage()"
              [class.bg-primary-50]="showUsage()"
              [class.text-text-muted]="!showUsage()"
              title="Toggle usage"
              (click)="showUsage.set(!showUsage())"
            >
              <lucide-icon [name]="showUsage() ? 'message-square' : 'chart-bar'" [size]="15" />
            </button>
          </div>
        </div>

        @if (showUsage()) {
          <div class="flex flex-1 min-h-0 p-4">
            <app-usage-table [conversationId]="conv.id" />
          </div>
        } @else {
          <ngx-chat
            class="min-h-0 flex-1"
            [messages]="chatMessages()"
            [loading]="loadingTurns()"
            [status]="streamingStatus()"
            (send)="onSend($event)"
          />
        }
      </div>
    } @else {
      <div class="flex h-full items-center justify-center">
        <lucide-icon name="loader-circle" [size]="24" class="animate-spin text-text-muted" />
      </div>
    }
  `,
})
export class ConversationDetailComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly conversationService = inject(ConversationService);
  private paramSub?: Subscription;

  protected readonly conversation = signal<Conversation | undefined>(undefined);
  protected readonly showUsage = signal(false);
  protected readonly turns = signal<Turn[]>([]);
  protected readonly loadingTurns = signal(true);
  protected readonly streamingStatus = signal('');
  private readonly streamingTurn = signal<ChatMessage | null>(null);

  protected readonly chatMessages = computed<ChatMessage[]>(() => {
    const base = this.turns().map(t => ({
      id: t.id,
      userContent: t.user_prompt,
      assistantContent: t.response_content,
      sequence: t.sequence,
    }));
    const streaming = this.streamingTurn();
    return streaming ? [...base, streaming] : base;
  });

  ngOnInit(): void {
    this.paramSub = this.route.params.subscribe(params => {
      const id = params['id'] as string;
      this.conversation.set(this.conversationService.getById(id));
      this.showUsage.set(false);
      this.turns.set([]);
      this.streamingTurn.set(null);
      this.loadingTurns.set(true);

      this.conversationService.getTurns(id).subscribe({
        next: (data) => {
          this.turns.set([...data].sort((a, b) => a.sequence - b.sequence));
          this.loadingTurns.set(false);
        },
        error: () => this.loadingTurns.set(false),
      });
    });
  }

  ngOnDestroy(): void {
    this.paramSub?.unsubscribe();
  }

  protected onSend(text: string): void {
    const conv = this.conversation();
    if (!conv) return;

    const tempId = `stream-${Date.now()}`;
    let accumulated = '';
    let statusAccumulated = '';
    let lastStatus = '';

    this.streamingStatus.set('Assistant is responding');
    this.streamingTurn.set({ id: tempId, userContent: text, assistantContent: '', streaming: true });

    this.conversationService.sendMessage(conv.id, text).subscribe({
      next: (chunk) => {
        if (chunk.status && chunk.status !== lastStatus) {
          lastStatus = chunk.status;
          statusAccumulated = statusAccumulated
            ? statusAccumulated + '  \n' + chunk.status
            : chunk.status;
          this.streamingStatus.set(statusAccumulated);
        }
        accumulated += chunk.content;
        this.streamingTurn.set({ id: tempId, userContent: text, assistantContent: accumulated, streaming: true });
      },
      complete: () => {
        this.streamingStatus.set('');
        const newTurn: Turn = {
          id: tempId,
          conversation_id: conv.id,
          sequence: this.turns().length + 1,
          user_prompt: text,
          response_content: accumulated,
          created_at: new Date().toISOString(),
          total_tokens_cost: 0,
        };
        this.turns.update(t => [...t, newTurn]);
        this.streamingTurn.set(null);
      },
      error: () => { this.streamingStatus.set(''); this.streamingTurn.set(null); },
    });
  }
}
