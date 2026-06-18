import { Component, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { TwangInputComponent, TwangTreeDropdownComponent } from 'ngx-twang-ui';
import type { TwangTreeDropdownNode } from 'ngx-twang-ui';
import type { ConversationStrategy, HistoryMode } from '../../services/conversation.service';

@Component({
  selector: 'app-conversation-form',
  standalone: true,
  host: { class: 'flex flex-col gap-4 w-full' },
  imports: [FormsModule, LucideAngularModule, TwangInputComponent, TwangTreeDropdownComponent],
  template: `
    <!-- Title -->
    <div class="flex flex-col gap-1.5">
      <label class="text-sm font-medium text-text">Title</label>
      <twang-input
        placeholder="Conversation title…"
        [ngModel]="title()"
        (ngModelChange)="title.set($event)"
      />
    </div>

    @if (showAllFields()) {
      <!-- Two-column: left = LLM/Model + Streaming, right = Strategy + History Mode + Max Turns -->
      <div class="grid grid-cols-2 gap-6">
        <!-- Left column -->
        <div class="flex flex-col gap-4 items-start w-full">
          <div class="flex flex-col gap-1.5 w-full">
            <label class="text-sm font-medium text-text">LLM / Model</label>
            @if (showLlm()) {
              @if (loadingProviders()) {
                <div class="flex items-center gap-2 text-xs text-text-muted">
                  <lucide-icon name="loader-circle" [size]="14" class="animate-spin" />
                  Loading models…
                </div>
              } @else {
                <twang-tree-dropdown
                  [nodes]="llmTree()"
                  [multiselect]="false"
                  [checkbox]="false"
                  placeholder="Select model…"
                  [(selected)]="selectedLlm"
                />
              }
            } @else {
              <p class="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm text-text-muted">{{ currentModel() }}</p>
            }
          </div>
          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium text-text">Streaming</label>
            <div class="inline-flex overflow-hidden rounded-lg border border-border">
              <button type="button"
                class="flex-1 px-5 py-2 text-sm font-medium transition-colors focus-visible:outline-none"
                [class]="stream() ? 'bg-primary-600 text-white' : 'bg-white text-text-muted hover:bg-surface-muted'"
                (click)="stream.set(true)">Yes</button>
              <button type="button"
                class="flex-1 border-l border-border px-5 py-2 text-sm font-medium transition-colors focus-visible:outline-none"
                [class]="!stream() ? 'bg-primary-600 text-white' : 'bg-white text-text-muted hover:bg-surface-muted'"
                (click)="stream.set(false)">No</button>
            </div>
          </div>
        </div>

        <!-- Right column -->
        <div class="flex flex-col gap-4 items-start">
          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium text-text">Strategy</label>
            <div class="inline-flex overflow-hidden rounded-lg border border-border">
              <button type="button"
                class="flex-1 px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none"
                [class]="strategy() === 'stateful' ? 'bg-primary-600 text-white' : 'bg-white text-text-muted hover:bg-surface-muted'"
                (click)="strategy.set('stateful')">Stateful</button>
              <button type="button"
                class="flex-1 border-l border-border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none"
                [class]="strategy() === 'stateless' ? 'bg-primary-600 text-white' : 'bg-white text-text-muted hover:bg-surface-muted'"
                (click)="strategy.set('stateless')">Stateless</button>
            </div>
          </div>
          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium text-text">History Mode</label>
            <div class="inline-flex overflow-hidden rounded-lg border border-border">
              <button type="button"
                class="flex-1 px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none"
                [class]="historyMode() === 'full' ? 'bg-primary-600 text-white' : 'bg-white text-text-muted hover:bg-surface-muted'"
                (click)="historyMode.set('full')">Full</button>
              <button type="button"
                class="flex-1 border-l border-border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none"
                [class]="historyMode() === 'trimmed' ? 'bg-primary-600 text-white' : 'bg-white text-text-muted hover:bg-surface-muted'"
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
              class="rounded-lg border border-border bg-white px-3 py-2 text-sm text-text placeholder:text-text-muted outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-400/20 transition-shadow"
              [value]="maxTurns() ?? ''"
              (input)="maxTurns.set($any($event.target).value ? +$any($event.target).value : null)"
            />
          </div>
        </div>
      </div>

      <!-- System Prompt -->
      <div class="flex flex-col gap-1.5">
        <label class="text-sm font-medium text-text">System Prompt</label>
        <textarea
          class="w-full min-h-64 resize-y rounded-lg border border-border bg-white px-3 py-2 text-sm text-text placeholder:text-text-muted outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-400/20 transition-shadow"
          placeholder="Optional system prompt to guide the assistant's behavior…"
          [value]="systemPrompt()"
          (input)="systemPrompt.set($any($event.target).value)"
        ></textarea>
      </div>
    } @else {
      <!-- LLM / Model only (limited mode) -->
      <div class="flex flex-col gap-1.5">
        <label class="text-sm font-medium text-text">LLM / Model</label>
        @if (loadingProviders()) {
          <div class="flex items-center gap-2 text-xs text-text-muted">
            <lucide-icon name="loader-circle" [size]="14" class="animate-spin" />
            Loading models…
          </div>
        } @else {
          <twang-tree-dropdown
            [nodes]="llmTree()"
            [multiselect]="false"
            [checkbox]="false"
            placeholder="Select model…"
            [(selected)]="selectedLlm"
          />
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
  selectedLlm = model<string[]>([]);

  showAllFields = input(true);
  showLlm = input(true);
  loadingProviders = input(false);
  llmTree = input<TwangTreeDropdownNode[]>([]);
  currentModel = input('');
}
