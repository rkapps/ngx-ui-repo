import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { TwangButtonComponent } from 'ngx-twang-ui';
import type { TwangTreeDropdownNode } from 'ngx-twang-ui';
import { AgentService, type Agent, type LlmProvider } from '../../services/agent.service';
import { ConversationService, type ConversationStrategy, type HistoryMode } from '../../services/conversation.service';
import { ConversationFormComponent } from '../conversation-form/conversation-form.component';

@Component({
  selector: 'app-new-conversation',
  standalone: true,
  imports: [LucideAngularModule, TwangButtonComponent, ConversationFormComponent],
  host: { class: 'flex h-full min-h-0' },
  template: `
    <!-- Left panel: agent list -->
    <div class="flex w-96 shrink-0 flex-col border-r border-border bg-white">
      <div class="flex min-h-16 shrink-0 items-center border-b border-border px-4">
        <p class="text-xs font-semibold uppercase tracking-wider text-text-muted">Select Agent</p>
      </div>
      <div class="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
        @if (loadingAgents()) {
          <div class="flex items-center justify-center py-8">
            <lucide-icon name="loader-circle" [size]="20" class="animate-spin text-text-muted" />
          </div>
        } @else {
          @for (agent of agents(); track agent.id) {
            <button
              class="flex w-full flex-col gap-1 rounded-lg px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
              [class]="selectedAgent()?.id === agent.id
                ? 'bg-primary-50 ring-1 ring-primary-200'
                : 'hover:bg-surface-muted'"
              (click)="selectAgent(agent)"
            >
              <div class="flex items-center gap-2">
                <lucide-icon name="bot" [size]="14" class="shrink-0 text-primary-600" />
                <p class="text-sm font-medium text-text">{{ agent.name }}</p>
              </div>
              <p class="line-clamp-2 text-xs leading-relaxed text-text-muted">{{ agent.description }}</p>
            </button>
          }
        }
      </div>
    </div>

    <!-- Right panel -->
    <div class="flex flex-1 flex-col">
      <!-- Header -->
      <div class="flex min-h-16 shrink-0 items-center justify-between border-b border-border px-6">
        <h2 class="text-base font-semibold text-gray-700">New Conversation</h2>
        <button
          class="flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
          title="Cancel"
          (click)="cancel()"
        >
          <lucide-icon name="x" [size]="16" />
        </button>
      </div>

      @if (selectedAgent(); as agent) {
        <div class="flex flex-1 flex-col overflow-y-auto px-16 py-8 gap-6">

          <!-- Agent details -->
          <div class="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-100 px-5 py-4">
            <lucide-icon name="bot" [size]="20" class="mt-0.5 shrink-0 text-primary-600" />
            <div class="min-w-0">
              <p class="text-sm font-semibold text-gray-800">{{ agent.name }}</p>
              <p class="mt-0.5 text-sm leading-relaxed text-gray-500">{{ agent.description }}</p>
            </div>
          </div>

          <!-- Conversation section -->
          <div class="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div class="px-5 py-3 border-b border-gray-100 bg-gray-50">
              <h3 class="text-xs font-semibold uppercase tracking-wider text-gray-500">Conversation</h3>
            </div>
            <div class="px-5 py-4 flex flex-col gap-4">
              <app-conversation-form
                [showAllFields]="showAllFields()"
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

          <!-- Error + button -->
          <div class="flex flex-col gap-3">
            @if (createError()) {
              <p class="text-sm text-danger-600">{{ createError() }}</p>
            }
            <div class="flex justify-end">
              <twang-button
                variant="primary"
                label="Start Conversation"
                icon="message-square-plus"
                [disabled]="!canCreate()"
                [loading]="creating()"
                (buttonClick)="create()"
              />
            </div>
          </div>

        </div>
      } @else {
        <div class="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <lucide-icon name="bot" [size]="36" class="text-text-muted opacity-40" />
          <p class="text-sm text-text-muted">Select an agent from the list to get started.</p>
        </div>
      }
    </div>
  `,
})
export class NewConversationComponent implements OnInit {
  readonly showAllFields = input(true);

  private readonly agentService = inject(AgentService);
  private readonly conversationService = inject(ConversationService);
  private readonly router = inject(Router);

  protected readonly agents = signal<Agent[]>([]);
  protected readonly providers = signal<LlmProvider[]>([]);
  protected readonly loadingAgents = signal(true);
  protected readonly loadingProviders = signal(true);
  protected readonly selectedAgent = signal<Agent | null>(null);
  protected readonly selectedLlmArr = signal<string[]>([]);
  protected readonly title = signal('');
  protected readonly stream = signal(false);
  protected readonly strategy = signal<ConversationStrategy>('stateful');
  protected readonly historyMode = signal<HistoryMode>('full');
  protected readonly maxTurns = signal<number | null>(null);
  protected readonly systemPrompt = signal('');
  protected readonly creating = signal(false);
  protected readonly createError = signal('');

  protected readonly llmTree = computed<TwangTreeDropdownNode[]>(() =>
    this.providers().map(p => ({
      id: p.id,
      label: p.llm,
      children: p.models.map(m => ({ id: `${p.id}::${m}`, label: m })),
    }))
  );

  protected readonly canCreate = computed(() =>
    !!this.selectedAgent() && !!this.title().trim() && this.selectedLlmArr().length > 0
  );

  ngOnInit(): void {
    this.agentService.getAgents().subscribe({
      next: data => { this.agents.set(data); this.loadingAgents.set(false); },
      error: () => this.loadingAgents.set(false),
    });
    this.agentService.getLlmProviders().subscribe({
      next: data => {
        this.providers.set(data);
        this.loadingProviders.set(false);
        if (data.length) {
          const p = data[0];
          this.selectedLlmArr.set([`${p.id}::${p.default_model}`]);
        }
      },
      error: () => this.loadingProviders.set(false),
    });
  }

  protected selectAgent(agent: Agent): void {
    this.selectedAgent.set(agent);
    this.title.set(agent.name);
  }

  protected cancel(): void {
    this.router.navigate(['/agents']);
  }

  protected create(): void {
    const agent = this.selectedAgent();
    const llmValue = this.selectedLlmArr()[0];
    if (!agent || !llmValue) return;

    const [llm, model] = llmValue.split('::');
    this.creating.set(true);
    this.createError.set('');

    this.conversationService.createConversation({
      conversation_type: 'agent',
      title: this.title().trim(),
      agent_id: agent.id,
      llm,
      model,
      stream: this.stream(),
      ...(this.showAllFields() ? {
        strategy: this.strategy(),
        history_mode: this.historyMode(),
        ...(this.maxTurns() != null ? { max_turns: this.maxTurns()! } : {}),
        ...(this.systemPrompt().trim() ? { system_prompt: this.systemPrompt().trim() } : {}),
      } : {}),
    }).subscribe({
      next: conv => {
        this.creating.set(false);
        this.router.navigate(['/agents', conv.id]);
      },
      error: () => {
        this.creating.set(false);
        this.createError.set('Failed to create conversation. Please try again.');
      },
    });
  }
}
