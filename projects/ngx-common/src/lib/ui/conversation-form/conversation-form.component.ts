import { Component, computed, effect, input, model, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { TwangDropdownComponent, TwangInputComponent } from 'ngx-twang-ui';
import type { TwangDropdownOption } from 'ngx-twang-ui';
import type { LlmProvider } from '../../services/agent.service';
import type { ConversationStrategy, HistoryMode } from '../../services/conversation.service';

@Component({
  selector: 'app-conversation-form',
  standalone: true,
  host: { class: 'flex flex-col gap-4 w-full' },
  imports: [FormsModule, LucideAngularModule, TwangInputComponent, TwangDropdownComponent],
  template: `
    @if (showAllFields()) {
      <div class="grid gap-12" style="grid-template-columns: 3fr 1fr">
        <!-- Left: Title + System Prompt -->
        <div class="flex flex-col gap-4">
          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium text-text">Title</label>
            <twang-input
              placeholder="Conversation title…"
              [ngModel]="title()"
              (ngModelChange)="title.set($event)"
            />
          </div>
          <div class="flex flex-col gap-1.5 flex-1">
            <label class="text-sm font-medium text-text">System Prompt</label>
            <textarea
              class="w-full flex-1 min-h-48 resize-y rounded-lg border border-border bg-white px-3 py-2 text-sm text-text placeholder:text-text-muted outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-400/20 transition-shadow"
              placeholder="Optional system prompt to guide the assistant's behavior…"
              [value]="systemPrompt()"
              (input)="systemPrompt.set($any($event.target).value)"
            ></textarea>
          </div>
        </div>

        <!-- Right: Settings -->
        <div class="flex flex-col gap-4 min-w-0">
          @if (showLlm()) {
            <div class="flex flex-col gap-1.5">
              <label class="text-sm font-medium text-text">LLM</label>
              @if (loadingProviders()) {
                <div class="flex items-center gap-2 text-xs text-text-muted">
                  <lucide-icon name="loader-circle" [size]="14" class="animate-spin" />
                  Loading…
                </div>
              } @else {
                <twang-dropdown
                  [options]="llmOptions()"
                  [value]="selectedLlmId()"
                  placeholder="Select LLM…"
                  (valueChange)="selectedLlmId.set($event)"
                />
              }
            </div>
            <div class="flex flex-col gap-1.5">
              <label class="text-sm font-medium text-text">Model</label>
              @if (loadingProviders()) {
                <div class="flex items-center gap-2 text-xs text-text-muted">
                  <lucide-icon name="loader-circle" [size]="14" class="animate-spin" />
                  Loading…
                </div>
              } @else {
                <twang-dropdown
                  [options]="modelOptions()"
                  [value]="selectedModel()"
                  placeholder="Select model…"
                  [disabled]="!selectedLlmId()"
                  (valueChange)="selectedModel.set($event)"
                />
              }
            </div>
          } @else {
            <div class="flex flex-col gap-1.5">
              <label class="text-sm font-medium text-text">Model</label>
              <p class="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm text-text-muted">{{ currentModel() }}</p>
            </div>
          }

          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium text-text">Streaming</label>
            <div class="relative flex h-8 w-full items-center rounded-full bg-gray-100 p-0.5">
              <span class="absolute h-7 w-1/2 rounded-full bg-primary-100 shadow-sm transition-transform duration-150"
                [class]="stream() ? 'translate-x-0' : 'translate-x-full'"></span>
              <button type="button" class="relative z-10 flex-1 text-xs font-medium transition-colors duration-150 focus-visible:outline-none"
                [class]="stream() ? 'text-primary-700' : 'text-gray-400'"
                (click)="stream.set(true)">Yes</button>
              <button type="button" class="relative z-10 flex-1 text-xs font-medium transition-colors duration-150 focus-visible:outline-none"
                [class]="!stream() ? 'text-primary-700' : 'text-gray-400'"
                (click)="stream.set(false)">No</button>
            </div>
          </div>

          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium text-text">Strategy</label>
            <div class="relative flex h-8 w-full items-center rounded-full bg-gray-100 p-0.5">
              <span class="absolute h-7 w-1/2 rounded-full bg-primary-100 shadow-sm transition-transform duration-150"
                [class]="strategy() === 'stateful' ? 'translate-x-0' : 'translate-x-full'"></span>
              <button type="button" class="relative z-10 flex-1 text-xs font-medium transition-colors duration-150 focus-visible:outline-none"
                [class]="strategy() === 'stateful' ? 'text-primary-700' : 'text-gray-400'"
                (click)="strategy.set('stateful')">Stateful</button>
              <button type="button" class="relative z-10 flex-1 text-xs font-medium transition-colors duration-150 focus-visible:outline-none"
                [class]="strategy() === 'stateless' ? 'text-primary-700' : 'text-gray-400'"
                (click)="strategy.set('stateless')">Stateless</button>
            </div>
          </div>

          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium text-text">History Mode</label>
            <div class="relative flex h-8 w-full items-center rounded-full bg-gray-100 p-0.5">
              <span class="absolute h-7 w-1/2 rounded-full bg-primary-100 shadow-sm transition-transform duration-150"
                [class]="historyMode() === 'full' ? 'translate-x-0' : 'translate-x-full'"></span>
              <button type="button" class="relative z-10 flex-1 text-xs font-medium transition-colors duration-150 focus-visible:outline-none"
                [class]="historyMode() === 'full' ? 'text-primary-700' : 'text-gray-400'"
                (click)="historyMode.set('full')">Full</button>
              <button type="button" class="relative z-10 flex-1 text-xs font-medium transition-colors duration-150 focus-visible:outline-none"
                [class]="historyMode() === 'trimmed' ? 'text-primary-700' : 'text-gray-400'"
                (click)="historyMode.set('trimmed')">Trimmed</button>
            </div>
          </div>

          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium text-text">Max Turns</label>
            <input
              type="number"
              min="10"
              step="10"
              placeholder="Unlimited"
              class="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text placeholder:text-text-muted outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-400/20 transition-shadow"
              [value]="maxTurns() ?? ''"
              (input)="maxTurns.set($any($event.target).value ? +$any($event.target).value : null)"
            />
          </div>
        </div>
      </div>
    } @else {
      <!-- Compact: title + LLM/Model pickers only -->
      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-text">Title</label>
          <twang-input
            placeholder="Conversation title…"
            [ngModel]="title()"
            (ngModelChange)="title.set($event)"
          />
        </div>
        @if (showLlm()) {
          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium text-text">LLM</label>
            @if (loadingProviders()) {
              <div class="flex items-center gap-2 text-xs text-text-muted">
                <lucide-icon name="loader-circle" [size]="14" class="animate-spin" />
                Loading…
              </div>
            } @else {
              <twang-dropdown
                [options]="llmOptions()"
                [value]="selectedLlmId()"
                placeholder="Select LLM…"
                (valueChange)="selectedLlmId.set($event)"
              />
            }
          </div>
          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium text-text">Model</label>
            @if (loadingProviders()) {
              <div class="flex items-center gap-2 text-xs text-text-muted">
                <lucide-icon name="loader-circle" [size]="14" class="animate-spin" />
                Loading…
              </div>
            } @else {
              <twang-dropdown
                [options]="modelOptions()"
                [value]="selectedModel()"
                placeholder="Select model…"
                [disabled]="!selectedLlmId()"
                (valueChange)="selectedModel.set($event)"
              />
            }
          </div>
        }
      </div>
    }
  `,
})
export class ConversationFormComponent {
  title = model('');
  stream = model(false);
  strategy = model<ConversationStrategy>('stateful');
  historyMode = model<HistoryMode>('full');
  maxTurns = model<number | null>(null);
  systemPrompt = model('');
  selectedLlmId = model('');
  selectedModel = model('');

  showAllFields = input(true);
  showLlm = input(true);
  loadingProviders = input(false);
  providers = input<LlmProvider[]>([]);
  currentModel = input('');

  protected readonly llmOptions = computed<TwangDropdownOption[]>(() =>
    this.providers().map(p => ({ value: p.id, label: p.llm }))
  );

  protected readonly modelOptions = computed<TwangDropdownOption[]>(() => {
    const provider = this.providers().find(p => p.id === this.selectedLlmId());
    return (provider?.models ?? []).map(m => ({ value: m, label: m }));
  });

  constructor() {
    effect(() => {
      const llmId = this.selectedLlmId();
      const models = this.modelOptions();
      untracked(() => {
        if (llmId && !models.find(m => m.value === this.selectedModel())) {
          this.selectedModel.set(models[0]?.value ?? '');
        }
      });
    });
  }
}
