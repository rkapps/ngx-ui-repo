import { Component, computed, effect, input, model, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { TwangDropdownComponent, TwangInputComponent } from 'ngx-twang-ui';
import type { TwangDropdownOption } from 'ngx-twang-ui';
import type { LlmProvider } from '../../models/llm-provider';
import type { ConversationStrategy, HistoryMode } from '../../services/conversation.service';

@Component({
  selector: 'app-conversation-form',
  standalone: true,
  host: { class: 'flex flex-col gap-4 w-full' },
  imports: [FormsModule, LucideAngularModule, TwangInputComponent, TwangDropdownComponent],
  template: `
    @if (showAllFields()) {
      <div class="grid gap-12" style="grid-template-columns: 3fr 1fr">
        <!-- Left: Title + header content + System Prompt -->
        <div class="flex flex-col gap-4">
          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium text-text">Title</label>
            <twang-input
              placeholder="Conversation title…"
              [ngModel]="title()"
              (ngModelChange)="title.set($event)"
            />
          </div>

          <!-- Optional header content (e.g. agent details) -->
          <ng-content select="[form-header]" />

          @if (showSystemPrompt()) {
            <div class="flex flex-col gap-1.5 flex-1">
              <label class="text-sm font-medium text-text">System Prompt</label>
              <textarea
                class="w-full flex-1 min-h-48 resize-y rounded-lg border border-border bg-white px-3 py-2 text-sm text-text placeholder:text-text-muted outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-400/20 transition-shadow"
                placeholder="Optional system prompt to guide the assistant's behavior…"
                [value]="systemPrompt()"
                (input)="systemPrompt.set($any($event.target).value)"
              ></textarea>
            </div>
          }
        </div>

        <!-- Right: Settings -->
        <div class="flex flex-col gap-4 min-w-0">
            <h3 class="border-b border-gray-400 pb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">Settings</h3>

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
              <div class="inline-flex w-fit items-center gap-0.5 rounded-full bg-gray-100 p-0.5">
                <button type="button" class="rounded-full px-3 py-1 text-xs font-medium transition-colors duration-150 focus-visible:outline-none"
                  [class]="stream() ? 'bg-primary-100 text-primary-700 shadow-sm' : 'text-gray-400'"
                  (click)="stream.set(true)">Yes</button>
                <button type="button" class="rounded-full px-3 py-1 text-xs font-medium transition-colors duration-150 focus-visible:outline-none"
                  [class]="!stream() ? 'bg-primary-100 text-primary-700 shadow-sm' : 'text-gray-400'"
                  (click)="stream.set(false)">No</button>
              </div>
            </div>

            <div class="flex flex-col gap-1.5">
              <label class="text-sm font-medium text-text">Strategy</label>
              <div class="inline-flex w-fit items-center gap-0.5 rounded-full bg-gray-100 p-0.5">
                <button type="button" class="rounded-full px-3 py-1 text-xs font-medium transition-colors duration-150 focus-visible:outline-none"
                  [class]="strategy() === 'stateful' ? 'bg-primary-100 text-primary-700 shadow-sm' : 'text-gray-400'"
                  (click)="selectStateful()">Stateful</button>
                <button type="button" class="rounded-full px-3 py-1 text-xs font-medium transition-colors duration-150 focus-visible:outline-none"
                  [class]="strategy() === 'stateless' ? 'bg-primary-100 text-primary-700 shadow-sm' : 'text-gray-400'"
                  (click)="strategy.set('stateless')">Stateless</button>
              </div>
            </div>

            <div class="flex flex-col gap-1.5">
              <label class="text-sm font-medium text-text">History Mode</label>
              <div class="inline-flex w-fit items-center gap-0.5 rounded-full bg-gray-100 p-0.5">
                <button type="button" class="rounded-full px-3 py-1 text-xs font-medium transition-colors duration-150 focus-visible:outline-none"
                  [class]="historyMode() === 'full' ? 'bg-primary-100 text-primary-700 shadow-sm' : 'text-gray-400'"
                  (click)="historyMode.set('full')">Full</button>
                <button type="button" class="rounded-full px-3 py-1 text-xs font-medium transition-colors duration-150 focus-visible:outline-none"
                  [class]="historyMode() === 'trimmed' ? 'bg-primary-100 text-primary-700 shadow-sm' : 'text-gray-400'"
                  (click)="selectTrimmed()">Trimmed</button>
              </div>
            </div>

            <div class="flex flex-col gap-1.5">
              <label class="text-sm font-medium text-text">Max Turns</label>
              <input
                type="number"
                min="5"
                step="5"
                placeholder="Unlimited"
                class="w-20 rounded-lg border border-border bg-white px-3 py-2 text-sm text-text placeholder:text-text-muted outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-400/20 transition-shadow"
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
  showSystemPrompt = input(true);
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

    // MiniMax models don't support stateful conversations — default to stateless when selected.
    effect(() => {
      const model = this.selectedModel();
      untracked(() => {
        if (model.toLowerCase().includes('minimax')) {
          this.strategy.set('stateless');
        }
      });
    });
  }

  // Stateful conversations default to trimmed history capped at 5 turns.
  protected selectStateful(): void {
    this.strategy.set('stateful');
    this.historyMode.set('trimmed');
    this.maxTurns.set(5);
  }

  protected selectTrimmed(): void {
    this.historyMode.set('trimmed');
    if (this.maxTurns() == null) {
      this.maxTurns.set(5);
    }
  }
}
