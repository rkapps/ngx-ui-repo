import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { LucideAngularModule } from 'lucide-angular';
import { TwangButtonComponent } from 'ngx-twang-ui';
import { ChatComponent } from '../chat/chat.component';
import type { ChatMessage } from '../chat/chat-message';
import { UsageTableComponent } from '../usage-table/usage-table.component';
import { ConversationService, type Conversation, type Turn } from '../../services/conversation.service';

@Component({
  selector: 'app-conversation-detail',
  standalone: true,
  imports: [LucideAngularModule, TwangButtonComponent, ChatComponent, UsageTableComponent],
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
            <button
              class="flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-danger-50 hover:text-danger-600"
              title="Delete conversation"
              (click)="showDeleteConfirm.set(true)"
            >
              <lucide-icon name="trash-2" [size]="15" />
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
            [errorMessage]="streamError()"
            [clearTrigger]="clearPromptTrigger()"
            (send)="onSend($event)"
          />
        }
      </div>

      <!-- Delete confirmation modal -->
      @if (showDeleteConfirm()) {
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40" (click)="showDeleteConfirm.set(false)">
          <div class="w-96 rounded-lg bg-white p-6 shadow-xl" (click)="$event.stopPropagation()">
            <h3 class="text-base font-semibold text-gray-900">Delete conversation?</h3>
            <p class="mt-1 text-sm text-gray-500">
              "{{ conv.title }}" will be permanently deleted. This cannot be undone.
            </p>
            <div class="mt-5 flex justify-end gap-3">
              <twang-button variant="outline" [disabled]="deleting()" (click)="showDeleteConfirm.set(false)">
                Cancel
              </twang-button>
              <twang-button variant="destructive" [loading]="deleting()" (click)="confirmDelete(conv.id)">
                Delete
              </twang-button>
            </div>
          </div>
        </div>
      }
    } @else if (loadingConversation()) {
      <div class="flex h-full items-center justify-center">
        <lucide-icon name="loader-circle" [size]="24" class="animate-spin text-text-muted" />
      </div>
    } @else {
      <div class="flex h-full flex-col items-center justify-center gap-3 text-center">
        <lucide-icon name="message-square-x" [size]="36" class="text-text-muted opacity-40" />
        <p class="text-sm text-text-muted">Conversation not found.</p>
      </div>
    }
  `,
})
export class ConversationDetailComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly conversationService = inject(ConversationService);
  private paramSub?: Subscription;

  protected readonly conversation = signal<Conversation | undefined>(undefined);
  protected readonly loadingConversation = signal(true);
  protected readonly showUsage = signal(false);
  protected readonly showDeleteConfirm = signal(false);
  protected readonly deleting = signal(false);
  protected readonly turns = signal<Turn[]>([]);
  protected readonly loadingTurns = signal(true);
  protected readonly streamingStatus = signal('');
  protected readonly streamError = signal<string | null>(null);
  protected readonly clearPromptTrigger = signal(0);
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
      this.showUsage.set(false);
      this.turns.set([]);
      this.streamingTurn.set(null);
      this.loadingTurns.set(true);

      const cached = this.conversationService.getById(id);
      if (cached) {
        this.conversation.set(cached);
        this.loadingConversation.set(false);
        this.fetchTurns(id);
      } else {
        this.loadingConversation.set(true);
        this.conversationService.getConversations().subscribe({
          next: () => {
            this.conversation.set(this.conversationService.getById(id));
            this.loadingConversation.set(false);
            this.fetchTurns(id);
          },
          error: () => {
            this.loadingConversation.set(false);
            this.loadingTurns.set(false);
          },
        });
      }
    });
  }

  private fetchTurns(id: string): void {
    this.conversationService.getTurns(id).subscribe({
      next: (data) => {
        this.turns.set([...data].sort((a, b) => a.sequence - b.sequence));
        this.loadingTurns.set(false);
      },
      error: () => this.loadingTurns.set(false),
    });
  }

  ngOnDestroy(): void {
    this.paramSub?.unsubscribe();
  }

  protected confirmDelete(id: string): void {
    this.deleting.set(true);
    this.conversationService.deleteConversation(id).subscribe({
      next: () => this.router.navigate(['/agents']),
      error: () => this.deleting.set(false),
    });
  }

  protected onSend(text: string): void {
    const conv = this.conversation();
    if (!conv) return;

    const tempId = `stream-${Date.now()}`;
    let accumulated = '';
    let statusAccumulated = '';
    let lastStatus = '';

    this.streamError.set(null);
    this.streamingStatus.set('Assistant is responding');
    this.streamingTurn.set({ id: tempId, userContent: text, assistantContent: '', streaming: true });

    this.conversationService.sendMessage(conv.id, text).subscribe({
      next: (chunk) => {
        if (chunk.status && chunk.status !== lastStatus) {
          lastStatus = chunk.status;
          statusAccumulated += chunk.status;
          this.streamingStatus.set(statusAccumulated);
        }
        accumulated += chunk.content;
        const isJson = accumulated.trimStart().startsWith('{');
        this.streamingTurn.set({ id: tempId, userContent: text, assistantContent: isJson ? '' : accumulated, streaming: true });
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
        this.clearPromptTrigger.update(v => v + 1);
      },
      error: (err) => {
        this.streamingStatus.set('');
        this.streamingTurn.set(null);
        const msg = err?.error?.message ?? err?.message ?? 'Something went wrong. Please try again.';
        this.streamError.set(msg);
      },
    });
  }
}
