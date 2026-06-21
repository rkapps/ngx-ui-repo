import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { catchError, of, startWith } from 'rxjs';
import { LucideAngularModule } from 'lucide-angular';
import { TwangButtonComponent } from 'ngx-twang-ui';
import type { TwangTreeDropdownNode } from 'ngx-twang-ui';
import { AgentService, type LlmProvider } from '../../services/agent.service';
import { ChatTemplateService, type ChatTemplate } from '../../services/chat-template.service';
import { ConversationService, type ConversationStrategy, type HistoryMode } from '../../services/conversation.service';
import { ConversationFormComponent } from '../conversation-form/conversation-form.component';

@Component({
  selector: 'app-new-chat',
  standalone: true,
  imports: [LucideAngularModule, TwangButtonComponent, ConversationFormComponent],
  host: { class: 'flex h-full min-h-0' },
  template: `
    <!-- Left panel: template list -->
    <div [class]="templateListClass()">
      <div class="flex min-h-10 md:min-h-16 shrink-0 items-center justify-between gap-2 border-b border-border px-2">
        <p class="text-xs font-semibold uppercase tracking-wider text-text-muted">Templates</p>
        <button
          class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
          title="Back to chats"
          (click)="cancel()"
        >
          <lucide-icon name="arrow-left" [size]="16" />
        </button>
      </div>
      <div class="flex flex-1 flex-col overflow-y-auto p-3">
        @if (loadingTemplates()) {
          <div class="flex items-center justify-center py-8">
            <lucide-icon name="loader-circle" [size]="20" class="animate-spin text-text-muted" />
          </div>
        } @else {
          @for (group of groupedTemplates(); track group.category) {
            <p class="px-2 pt-3 pb-1 text-xs font-semibold uppercase tracking-wider text-text-muted">{{ group.category }}</p>
            @for (tmpl of group.templates; track tmpl.id) {
              <button
                class="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
                [class]="selectedTemplate()?.id === tmpl.id
                  ? 'bg-primary-50 ring-1 ring-primary-200'
                  : 'hover:bg-surface-muted'"
                (click)="selectTemplate(tmpl); mobileShowForm.set(true)"
              >
                <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600 ring-1 ring-primary-100">
                  <lucide-icon [name]="resolveIcon(tmpl.icon)" [size]="16" />
                </div>
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm font-medium text-text">{{ tmpl.title }}</p>
                  <p class="mt-0.5 line-clamp-2 text-xs leading-relaxed text-text-muted">{{ tmpl.description }}</p>
                </div>
              </button>
            }
          }
        }
      </div>
    </div>

    <!-- Right panel: form -->
    <div [class]="formPanelClass()">
      <!-- Header -->
      <div class="flex min-h-10 md:min-h-16 shrink-0 items-center gap-2 border-b border-border px-2 md:px-6">
        <h2 class="flex-1 text-base font-semibold text-gray-700">New Chat</h2>
        <button
          class="md:hidden flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
          title="Back to templates"
          (click)="mobileShowForm.set(false)"
        >
          <lucide-icon name="arrow-left" [size]="15" />
        </button>
      </div>

      <div class="flex-1 min-h-0 overflow-y-auto">
        <div class="flex flex-col gap-6 px-2 py-2 md:px-16 md:py-8">
          <!-- Selected template details card -->
          @if (selectedTemplate(); as tmpl) {
            <div class="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-100 px-5 py-4">
              <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white ring-1 ring-gray-200">
                <lucide-icon [name]="resolveIcon(tmpl.icon)" [size]="18" class="text-primary-600" />
              </div>
              <div class="min-w-0">
                <p class="text-sm font-semibold text-gray-800">{{ tmpl.title }}</p>
                <p class="mt-0.5 text-sm leading-relaxed text-gray-500">{{ tmpl.description }}</p>
              </div>
            </div>
          }

          <!-- Conversation card -->
          <div class="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div class="px-5 py-3 border-b border-gray-100 bg-gray-50">
              <h3 class="text-xs font-semibold uppercase tracking-wider text-gray-500">Chat</h3>
            </div>
            <div class="px-5 py-4 flex flex-col gap-4">
              <app-conversation-form
                [llmTree]="llmTree()"
                [loadingProviders]="loadingProviders()"
                [(title)]="title"
                [(stream)]="stream"
                [(strategy)]="strategy"
                [(historyMode)]="historyMode"
                [(maxTurns)]="maxTurns"
                [(systemPrompt)]="systemPrompt"
                [(selectedLlm)]="selectedLlmArr"
              />
            </div>
          </div>

          <div class="flex flex-col gap-3">
            @if (createError()) {
              <p class="text-sm text-danger-600">{{ createError() }}</p>
            }
            <div class="flex justify-end">
              <twang-button
                variant="primary"
                label="Start Chat"
                icon="message-square-plus"
                [disabled]="!canCreate()"
                [loading]="creating()"
                (buttonClick)="create()"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class NewChatComponent {
  private readonly agentService = inject(AgentService);
  private readonly chatTemplateService = inject(ChatTemplateService);
  private readonly conversationService = inject(ConversationService);
  private readonly router = inject(Router);

  private readonly _providers = toSignal(
    this.agentService.getLlmProviders().pipe(
      startWith(null as LlmProvider[] | null),
      catchError(() => of([] as LlmProvider[])),
    ),
    { requireSync: true },
  );
  private readonly _templates = toSignal(
    this.chatTemplateService.getChatTemplates().pipe(
      startWith(null as ChatTemplate[] | null),
      catchError(() => of([] as ChatTemplate[])),
    ),
    { requireSync: true },
  );

  protected readonly providers = computed(() => this._providers() ?? []);
  protected readonly templates = computed(() => this._templates() ?? []);
  protected readonly loadingProviders = computed(() => this._providers() === null);
  protected readonly loadingTemplates = computed(() => this._templates() === null);

  protected readonly selectedTemplate = signal<ChatTemplate | null>(null);
  protected readonly selectedLlmArr = signal<string[]>([]);
  protected readonly title = signal('');
  protected readonly stream = signal(true);
  protected readonly strategy = signal<ConversationStrategy>('stateful');
  protected readonly historyMode = signal<HistoryMode>('full');
  protected readonly maxTurns = signal<number | null>(null);
  protected readonly systemPrompt = signal('');
  protected readonly creating = signal(false);
  protected readonly createError = signal('');

  constructor() {
    effect(() => {
      const providers = this._providers();
      if (providers?.length) {
        untracked(() => {
          if (!this.selectedLlmArr().length) {
            const p = providers[0];
            this.selectedLlmArr.set([`${p.id}::${p.default_model}`]);
          }
        });
      }
    });

    effect(() => {
      const templates = this._templates();
      if (templates?.length) {
        untracked(() => {
          if (!this.selectedTemplate()) {
            this.selectTemplate(templates[0]);
          }
        });
      }
    });
  }

  protected readonly mobileShowForm = signal(false);

  protected readonly templateListClass = computed(() =>
    this.mobileShowForm()
      ? 'hidden md:flex md:w-72 xl:w-96 shrink-0 flex-col border-r border-border bg-white'
      : 'flex w-full md:w-72 xl:w-96 shrink-0 flex-col border-r border-border bg-white'
  );

  protected readonly formPanelClass = computed(() =>
    this.mobileShowForm() ? 'flex flex-1 flex-col' : 'hidden md:flex flex-1 flex-col'
  );

  protected readonly llmTree = computed<TwangTreeDropdownNode[]>(() =>
    this.providers().map(p => ({
      id: p.id,
      label: p.llm,
      children: p.models.map(m => ({ id: `${p.id}::${m}`, label: m })),
    }))
  );

  protected readonly groupedTemplates = computed(() => {
    const map = new Map<string, ChatTemplate[]>();
    for (const t of this.templates()) {
      const list = map.get(t.category) ?? [];
      list.push(t);
      map.set(t.category, list);
    }
    return Array.from(map.entries()).map(([category, templates]) => ({ category, templates }));
  });

  protected readonly canCreate = computed(() =>
    !!this.title().trim() && this.selectedLlmArr().length > 0
  );

  protected selectTemplate(tmpl: ChatTemplate): void {
    this.selectedTemplate.set(tmpl);
    this.title.set(tmpl.title);
    this.systemPrompt.set(tmpl.system_prompt ?? '');

    const match = this.findLlmMatch(tmpl.recommended_llm);
    if (match) this.selectedLlmArr.set([match]);
  }

  private findLlmMatch(recommended: string): string | null {
    if (!recommended) return null;
    const lower = recommended.toLowerCase();
    for (const p of this.providers()) {
      for (const m of p.models) {
        if (m.toLowerCase() === lower || `${p.llm}/${m}`.toLowerCase() === lower) {
          return `${p.id}::${m}`;
        }
      }
    }
    for (const p of this.providers()) {
      for (const m of p.models) {
        if (m.toLowerCase().includes(lower) || lower.includes(m.toLowerCase())) {
          return `${p.id}::${m}`;
        }
      }
    }
    return null;
  }

  private static readonly ICON_ALIASES: Record<string, string> = {
    'robot': 'bot',
    'balance-scale': 'scale',
  };

  protected resolveIcon(icon: string): string {
    return NewChatComponent.ICON_ALIASES[icon] ?? icon;
  }

  protected cancel(): void {
    this.router.navigate(['/chats'], { state: { skipRestore: true } });
  }

  protected create(): void {
    const llmValue = this.selectedLlmArr()[0];
    if (!llmValue) return;

    const [llm, model] = llmValue.split('::');
    this.creating.set(true);
    this.createError.set('');

    this.conversationService.createConversation({
      conversation_type: 'chat',
      agent_id: 'chat',
      title: this.title().trim(),
      llm,
      model,
      stream: this.stream(),
      strategy: this.strategy(),
      history_mode: this.historyMode(),
      ...(this.maxTurns() != null ? { max_turns: this.maxTurns()! } : {}),
      ...(this.systemPrompt().trim() ? { system_prompt: this.systemPrompt().trim() } : {}),
      ...(this.selectedTemplate() ? { template_id: this.selectedTemplate()!.id } : {}),
    }).subscribe({
      next: conv => {
        this.creating.set(false);
        this.router.navigate(['/chats', conv.id]);
      },
      error: () => {
        this.creating.set(false);
        this.createError.set('Failed to create chat. Please try again.');
      },
    });
  }
}
