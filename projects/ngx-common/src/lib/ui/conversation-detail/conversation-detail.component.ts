import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, effect, inject, input, OnDestroy, OnInit, signal, type TemplateRef, viewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { LucideAngularModule } from 'lucide-angular';
import { TwangButtonComponent } from 'ngx-twang-ui';
import { PageBreadcrumbs } from '../breadcrumbs/page-breadcrumbs';
import { ChatComponent } from '../chat/chat.component';
import { ChatMessagesComponent } from '../chat/chat-messages.component';
import { ChatPromptComponent } from '../chat/chat-prompt.component';
import { ThreePanelLayoutComponent } from '../three-panel-layout/three-panel-layout.component';
import type { ChatMessage } from '../chat/chat-message';
import { UsageTableComponent } from '../usage-table/usage-table.component';
import { ConversationFormComponent } from '../conversation-form/conversation-form.component';
import { ConversationService, type Conversation, type ConversationStrategy, type HistoryMode, type Turn } from '../../services/conversation.service';
import { extractCompleteSections, extractSuggestedPrompts, looksLikeSectionsJson } from '../message-renderer/section-parsing';

const SPLIT_KEY = 'conversation.splitLayout';

/** The remembered split/unified choice, or null if the user hasn't picked one. */
function readSplitPreference(): boolean | null {
  try {
    const stored = localStorage.getItem(SPLIT_KEY);
    return stored === null ? null : stored === 'true';
  } catch {
    return null;
  }
}

@Component({
  selector: 'app-conversation-detail',
  standalone: true,
  imports: [LucideAngularModule, NgTemplateOutlet, TwangButtonComponent, ChatComponent, ChatMessagesComponent, ChatPromptComponent, ThreePanelLayoutComponent, UsageTableComponent, ConversationFormComponent],
  host: { class: 'flex flex-1 flex-col min-h-0' },
  template: `
    @if (conversation(); as conv) {
      @if (split()) {
        <!-- Split view (tiled, lg+): the conversation card in the middle, the prompt in the right panel. -->
        <app-three-panel-layout
          [showLeft]="false"
          [rightTitle]="promptPanelTitle()"
          rightWidth="responsive"
          storageKey="conversation.split.layout"
          [fill]="true"
        >
          <div middle class="flex min-h-0 flex-1 flex-col">
            <ng-container *ngTemplateOutlet="card; context: { $implicit: conv }" />
          </div>
          <ngx-chat-prompt
            right
            widthMode="full"
            [clearTrigger]="clearPromptTrigger()"
            [suggestedPrompts]="suggestedPrompts()"
            [hasHistory]="chatMessages().length > 0"
            [restorePrompt]="restorePrompt()"
            [generating]="generating()"
            (send)="onSend($event)"
            (stop)="stopGenerating()"
            (activeTabLabel)="promptPanelTitle.set($event)"
          />
        </app-three-panel-layout>
      } @else {
        <ng-container *ngTemplateOutlet="card; context: { $implicit: conv }" />
      }

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

    <ng-template #card let-conv>
      <!-- tiled: the whole conversation (header strip + chat / edit / usage) as one white card on the page background. -->
      <div class="flex h-full min-h-0 flex-1 flex-col" [class]="tiled() ? 'overflow-hidden rounded-lg border border-border bg-white' : ''">
        <!-- Header -->
        <div
          class="flex min-h-10 md:min-h-16 shrink-0 items-center justify-between gap-4 border-b border-border px-2 md:px-5"
        >
          <div class="min-w-0">
            <h2 class="truncate text-base font-semibold text-primary-600">{{ conv.title }}</h2>
            <p class="text-xs text-text-muted">{{ conv.llm ? conv.llm + ' / ' + conv.model : conv.model }}</p>
          </div>
          <!-- Buttons: here, or (tiled) in the page header next to the breadcrumbs. -->
          @if (!tiled()) {
            <ng-container *ngTemplateOutlet="actionButtons; context: { $implicit: conv }" />
          }
        </div>

        @if (showUsage()) {
          <div class="flex flex-1 min-h-0 p-2 md:p-4">
            <app-usage-table [conversationId]="conv.id" />
          </div>
        } @else if (showEdit()) {
          <!-- Edit panel -->
          <div class="flex flex-1 flex-col overflow-y-auto px-2 py-2 md:px-8 md:py-4 gap-6">
            <div class="border-b border-gray-400 pb-4">
              <div class="flex flex-col gap-4">
                <app-conversation-form
                  [showLlm]="false"
                  [showSystemPrompt]="showSystemPrompt()"
                  [currentModel]="conv.model"
                  [(title)]="editTitle"
                  [(stream)]="editStream"
                  [(strategy)]="editStrategy"
                  [(historyMode)]="editHistoryMode"
                  [(maxTurns)]="editMaxTurns"
                  [(systemPrompt)]="editSystemPrompt"
                >
                  <!-- Model info card (mirrors agent card in create) -->
                  <div form-header class="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-100 px-5 py-4">
                    <lucide-icon name="bot" [size]="20" class="mt-0.5 shrink-0 text-primary-600" />
                    <div class="min-w-0">
                      <p class="text-sm font-semibold text-gray-800">{{ conv.title }}</p>
                      <p class="mt-0.5 text-sm leading-relaxed text-gray-500">{{ conv.llm }} / {{ conv.model }}</p>
                    </div>
                  </div>
                </app-conversation-form>
              </div>
            </div>

            <div class="flex flex-col gap-3">
              @if (saveError()) {
                <p class="text-sm text-danger-600">{{ saveError() }}</p>
              }
              <div class="flex justify-end gap-3">
                <twang-button variant="outline" [disabled]="saving()" (click)="showEdit.set(false)">Cancel</twang-button>
                <twang-button variant="primary" label="Save Changes" [loading]="saving()" (buttonClick)="saveEdit(conv.id)" />
              </div>
            </div>
          </div>
        } @else if (split()) {
          <!-- Split view: messages here, the prompt is in the right panel. -->
          <ngx-chat-messages
            class="min-h-0 flex-1"
            [messages]="chatMessages()"
            [loading]="loadingTurns()"
            [status]="streamingStatus()"
            [errorMessage]="streamError()"
          />
        } @else {
          <ngx-chat
            class="min-h-0 flex-1"
            [messages]="chatMessages()"
            [loading]="loadingTurns()"
            [status]="streamingStatus()"
            [errorMessage]="streamError()"
            [clearTrigger]="clearPromptTrigger()"
            [suggestedPrompts]="suggestedPrompts()"
            [restorePrompt]="restorePrompt()"
            [generating]="generating()"
            (send)="onSend($event)"
            (stop)="stopGenerating()"
          />
        }
      </div>
    </ng-template>

    <!-- Edit / usage / delete (and back, on small screens) for the open conversation. -->
    <ng-template #actionButtons let-conv>
      <div class="flex shrink-0 items-center gap-2">
        @if (showEditButton()) {
          <button
            class="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-surface-muted"
            [class.text-primary-600]="showEdit()"
            [class.bg-primary-50]="showEdit()"
            [class.text-text-muted]="!showEdit()"
            title="Edit conversation"
            (click)="toggleEdit(conv)"
          >
            <lucide-icon name="square-pen" [size]="15" />
          </button>
        }
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
        <button
          class="md:hidden flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
          title="Back to list"
          (click)="goBack()"
        >
          <lucide-icon name="arrow-left" [size]="15" />
        </button>
      </div>
    </ng-template>

    <!-- tiled: rendered in the page header (right of the breadcrumbs) via PageBreadcrumbs.actions, as
         labelled buttons like other pages' header actions. -->
    <ng-template #headerActions>
      @if (conversation(); as conv) {
        <!-- Split/unified only has room from lg up (where the right panel shows). -->
        @if (isLarge()) {
          <twang-button
            variant="default"
            size="sm"
            [icon]="splitPreferred() ? 'panel-bottom' : 'panel-right'"
            [label]="splitPreferred() ? 'Unified view' : 'Split view'"
            [title]="splitPreferred() ? 'Prompt below the messages' : 'Prompt in a panel on the right'"
            (buttonClick)="toggleSplit()"
          />
        }
        @if (showEditButton()) {
          <twang-button
            [variant]="showEdit() ? 'primarySoft' : 'default'"
            size="sm"
            icon="square-pen"
            label="Edit"
            [title]="showEdit() ? 'Close edit' : 'Edit conversation'"
            (buttonClick)="toggleEdit(conv)"
          />
        }
        <twang-button
          [variant]="showUsage() ? 'primarySoft' : 'default'"
          size="sm"
          [icon]="showUsage() ? 'message-square' : 'chart-bar'"
          [label]="showUsage() ? 'Chat' : 'Usage'"
          [title]="showUsage() ? 'Back to the conversation' : 'Show token usage'"
          (buttonClick)="showUsage.set(!showUsage())"
        />
        <twang-button variant="default" size="sm" icon="trash-2" label="Delete" title="Delete conversation" (buttonClick)="showDeleteConfirm.set(true)" />
      }
    </ng-template>
  `,
})
export class ConversationDetailComponent implements OnInit, OnDestroy {
  readonly showEditButton = input(false);
  /** The conversation as one white card (tile) on the page background, with its buttons in the page header; bindable from route data. */
  readonly tiled = input(false);
  readonly alwaysMarkdown = input(false);
  readonly showSystemPrompt = input(true);

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly breadcrumbs = inject(PageBreadcrumbs);
  private readonly headerActions = viewChild<TemplateRef<unknown>>('headerActions');

  // ── Split view (tiled only): prompt in a right panel, from lg (1024px) up ──
  private readonly largeQuery = typeof matchMedia === 'function' ? matchMedia('(min-width: 1024px)') : null;
  protected readonly isLarge = signal(this.largeQuery?.matches ?? false);
  private readonly onLargeChange = (e: MediaQueryListEvent) => this.isLarge.set(e.matches);
  private readonly xxlQuery = typeof matchMedia === 'function' ? matchMedia('(min-width: 1536px)') : null;
  private readonly isXxl = signal(this.xxlQuery?.matches ?? false);
  private readonly onXxlChange = (e: MediaQueryListEvent) => this.isXxl.set(e.matches);
  /** The user's choice, remembered per browser; null until they pick one. */
  private readonly storedSplit = signal(readSplitPreference());
  /** Split unless the user chose otherwise — by default on 2xl (1536px) and up. Only applies where split can show (lg+). */
  protected readonly splitPreferred = computed(() => this.storedSplit() ?? this.isXxl());
  protected readonly split = computed(() => this.tiled() && this.isLarge() && this.splitPreferred());
  /** Right panel title: the prompt's active tab (Default / Last / Suggested). */
  protected readonly promptPanelTitle = signal('Prompt');

  protected toggleSplit(): void {
    const next = !this.splitPreferred();
    this.storedSplit.set(next);
    try {
      localStorage.setItem(SPLIT_KEY, String(next));
    } catch {
      // storage unavailable — just not remembered
    }
  }
  private readonly conversationService = inject(ConversationService);
  private paramSub?: Subscription;

  protected readonly conversation = signal<Conversation | undefined>(undefined);
  protected readonly loadingConversation = signal(true);
  protected readonly showUsage = signal(false);
  protected readonly showEdit = signal(false);
  protected readonly showDeleteConfirm = signal(false);
  protected readonly deleting = signal(false);
  protected readonly saving = signal(false);
  protected readonly saveError = signal('');
  protected readonly editTitle = signal('');
  protected readonly editSystemPrompt = signal('');
  protected readonly editStream = signal(false);
  protected readonly editStrategy = signal<ConversationStrategy>('stateful');
  protected readonly editHistoryMode = signal<HistoryMode>('full');
  protected readonly editMaxTurns = signal<number | null>(null);
  protected readonly turns = signal<Turn[]>([]);
  protected readonly loadingTurns = signal(true);
  protected readonly streamingStatus = signal('');
  protected readonly streamError = signal<string | null>(null);
  protected readonly clearPromptTrigger = signal(0);
  protected readonly suggestedPrompts = signal<string[]>([]);
  protected readonly restorePrompt = signal('');
  private lastSentText = '';
  private readonly streamingTurn = signal<ChatMessage | null>(null);
  private streamSub?: Subscription;

  protected readonly generating = computed(() => this.streamingTurn() !== null);

  private statusClearTimer: ReturnType<typeof setTimeout> | null = null;

  private clearStatusAfterDelay(): void {
    if (this.statusClearTimer) clearTimeout(this.statusClearTimer);
    this.statusClearTimer = setTimeout(() => {
      this.streamingStatus.set('');
      this.statusClearTimer = null;
    }, 5000);
  }

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
      this.streamError.set(null);
      this.loadingTurns.set(true);
      this.suggestedPrompts.set([]);

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
        const sorted = [...data].sort((a, b) => a.sequence - b.sequence);
        this.turns.set(sorted);
        this.loadingTurns.set(false);
        // Scan from last turn backwards — use the most recent turn that has suggested prompts
        for (let i = sorted.length - 1; i >= Math.max(0, sorted.length - 3); i--) {
          const prompts = extractSuggestedPrompts(sorted[i]?.response_content ?? '');
          if (prompts.length) { this.suggestedPrompts.set(prompts); break; }
        }
      },
      error: () => this.loadingTurns.set(false),
    });
  }

  constructor() {
    this.largeQuery?.addEventListener('change', this.onLargeChange);
    this.xxlQuery?.addEventListener('change', this.onXxlChange);
    // tiled: the buttons go in the page header, right of the breadcrumbs.
    effect(() => {
      if (this.tiled()) this.breadcrumbs.actions.set(this.headerActions() ?? null);
    });
  }

  ngOnDestroy(): void {
    this.largeQuery?.removeEventListener('change', this.onLargeChange);
    this.xxlQuery?.removeEventListener('change', this.onXxlChange);
    // Only drop our actions: the next page may already have set its own.
    if (this.breadcrumbs.actions() === this.headerActions()) this.breadcrumbs.actions.set(null);
    this.paramSub?.unsubscribe();
    this.streamSub?.unsubscribe();
    if (this.statusClearTimer) clearTimeout(this.statusClearTimer);
  }

  protected goBack(): void {
    this.router.navigate(['../'], { relativeTo: this.route });
  }

  protected toggleEdit(conv: Conversation): void {
    if (this.showEdit()) {
      this.showEdit.set(false);
      return;
    }
    this.editTitle.set(conv.title);
    this.editSystemPrompt.set(conv.system_prompt ?? '');
    this.editStream.set(conv.stream ?? false);
    this.editStrategy.set((conv.strategy as ConversationStrategy) ?? 'stateful');
    this.editHistoryMode.set(conv.history_mode ?? 'full');
    this.editMaxTurns.set(conv.max_turns ?? null);
    this.saveError.set('');
    this.showEdit.set(true);
  }

  protected saveEdit(id: string): void {
    this.saving.set(true);
    this.saveError.set('');
    this.conversationService.updateConversation(id, {
      title: this.editTitle().trim() || undefined,
      system_prompt: this.editSystemPrompt().trim() || undefined,
      stream: this.editStream(),
      strategy: this.editStrategy(),
      history_mode: this.editHistoryMode(),
      ...(this.editMaxTurns() != null ? { max_turns: this.editMaxTurns()! } : {}),
    }).subscribe({
      next: () => {
        this.conversation.set(this.conversationService.getById(id));
        this.saving.set(false);
        this.showEdit.set(false);
      },
      error: () => { this.saving.set(false); this.saveError.set('Failed to save changes. Please try again.'); },
    });
  }

  protected confirmDelete(id: string): void {
    this.deleting.set(true);
    this.conversationService.deleteConversation(id).subscribe({
      next: () => this.router.navigate(['../'], { relativeTo: this.route }),
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

    if (this.statusClearTimer) { clearTimeout(this.statusClearTimer); this.statusClearTimer = null; }
    this.lastSentText = text;
    this.restorePrompt.set('');
    this.streamError.set(null);
    this.suggestedPrompts.set([]);
    this.streamingStatus.set('Assistant is responding');
    this.streamingTurn.set({ id: tempId, userContent: text, assistantContent: '', streaming: true });

    this.streamSub = this.conversationService.sendMessage(conv.id, text, conv.stream ?? true).subscribe({
      next: (chunk) => {
        if (chunk.status && chunk.status !== lastStatus) {
          lastStatus = chunk.status;
          const sep = statusAccumulated && !statusAccumulated.endsWith('\n') ? ' ' : '';
          statusAccumulated += sep + chunk.status;
          this.streamingStatus.set(statusAccumulated);
        }
        accumulated += chunk.content;
        const isJson = !this.alwaysMarkdown() && looksLikeSectionsJson(accumulated);
        const displayContent = isJson ? (extractCompleteSections(accumulated) ?? '') : accumulated;
        this.streamingTurn.set({ id: tempId, userContent: text, assistantContent: displayContent, streaming: true });
      },
      complete: () => {
        this.streamSub = undefined;
        this.clearStatusAfterDelay();
        this.suggestedPrompts.set(extractSuggestedPrompts(accumulated));
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
        this.streamSub = undefined;
        this.streamingStatus.set('');
        this.streamingTurn.set(null);
        this.restorePrompt.set(this.lastSentText);
        const body = err?.error;
        const msg = body?.message ?? (typeof body === 'string' && body ? body : null) ?? err?.message ?? 'Something went wrong. Please try again.';
        this.streamError.set(msg);
      },
    });
  }

  protected stopGenerating(): void {
    this.streamSub?.unsubscribe();
    this.streamSub = undefined;

    const streaming = this.streamingTurn();
    this.streamingStatus.set('');
    this.streamingTurn.set(null);
    if (!streaming) return;

    const conv = this.conversation();
    if (conv && streaming.assistantContent) {
      const newTurn: Turn = {
        id: streaming.id,
        conversation_id: conv.id,
        sequence: this.turns().length + 1,
        user_prompt: streaming.userContent,
        response_content: streaming.assistantContent,
        created_at: new Date().toISOString(),
        total_tokens_cost: 0,
      };
      this.turns.update(t => [...t, newTurn]);
      this.clearPromptTrigger.update(v => v + 1);
    } else {
      this.restorePrompt.set(this.lastSentText);
    }
  }
}
