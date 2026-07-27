import { Component, effect, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { TwangButtonComponent, TwangDatepickerComponent } from 'ngx-twang-ui';
import { UsageTableComponent } from '../usage-table/usage-table.component';
import { PageLayoutComponent } from '../page-layout/page-layout.component';

type ConvType = 'all' | 'chat' | 'agent';

const LLM_OPTIONS = ['all', 'openai', 'gemini', 'anthropic', 'together', 'fireworks', 'mistral', 'local'] as const;
type LlmType = typeof LLM_OPTIONS[number];
const LLM_LABELS: Record<LlmType, string> = {
  all: 'All',
  openai: 'OpenAI',
  gemini: 'Gemini',
  anthropic: 'Anthropic',
  together: 'Together',
  fireworks: 'Fireworks',
  mistral: 'Mistral',
  local: 'Local',
};

const CONV_TYPE_KEY = 'usage.filterType';
const LLM_KEY = 'usage.filterLlm';
const TITLE_KEY = 'usage.filterTitle';

function readStored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  const stored = localStorage.getItem(key);
  return (allowed as readonly string[]).includes(stored ?? '') ? (stored as T) : fallback;
}

@Component({
  selector: 'app-usage',
  standalone: true,
  imports: [LucideAngularModule, TwangButtonComponent, TwangDatepickerComponent, UsageTableComponent, PageLayoutComponent],
  host: { class: 'flex flex-1 flex-col min-h-0 overflow-hidden' },
  template: `
    <app-page-layout class="flex flex-1 min-h-0" expandedWidth="w-72" storageKey="layout.usage" panelTitle="Filters"
      [mobileShowContent]="mobilePanel()"
      (mobileBack)="mobilePanel.set(false)">

      <div sidebar class="flex flex-col p-4">

        <div class="pb-4 border-b border-border">
          <label class="block text-xs font-medium text-text-muted mb-2">Title</label>
          <input type="text" placeholder="Filter by title…"
            [value]="title()"
            (input)="title.set($any($event.target).value)"
            class="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text placeholder:text-text-muted outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-400/20 transition-shadow" />
        </div>

        <div class="pb-4 border-b border-border">
          <label class="block text-xs font-medium text-text-muted mb-2">Type</label>
          <div class="flex flex-col gap-1.5">
            @for (opt of ['all', 'chat', 'agent']; track opt) {
              <label class="flex items-center gap-2 text-sm text-text cursor-pointer">
                <input type="radio" name="convType" [value]="opt"
                  [checked]="convType() === opt"
                  (change)="convType.set($any(opt))"
                  class="accent-primary-600" />
                {{ opt === 'all' ? 'All' : opt === 'chat' ? 'Chat' : 'Agent' }}
              </label>
            }
          </div>
        </div>

        <div class="py-4 border-b border-border">
          <label class="block text-xs font-medium text-text-muted mb-2">LLM</label>
          <div class="flex flex-col gap-1.5">
            @for (opt of llmOptions; track opt) {
              <label class="flex items-center gap-2 text-sm text-text cursor-pointer">
                <input type="radio" name="llm" [value]="opt"
                  [checked]="llm() === opt"
                  (change)="llm.set($any(opt))"
                  class="accent-primary-600" />
                {{ llmLabels[opt] }}
              </label>
            }
          </div>
        </div>

        <div class="py-4 border-b border-border flex flex-col gap-4">
          <twang-datepicker label="From" placeholder="Start date" 
[value]="startDate()"
            (valueChange)="startDate.set($event)" />

          <twang-datepicker label="To" placeholder="End date" 
[value]="endDate()"
            (valueChange)="endDate.set($event)" />
        </div>

        <div class="pt-4 md:hidden flex justify-center">
          <twang-button variant="primary" label="Apply" (buttonClick)="mobilePanel.set(null)" />
        </div>

      </div>

      <!-- Right: usage table -->
      <div content class="flex flex-1 flex-col min-h-0 overflow-hidden">
        <div class="flex-none px-2 md:px-6 py-2 md:py-3 border-b border-border flex items-center gap-2 min-h-10 md:min-h-16">
          <span class="flex-1 text-sm font-semibold text-primary-600">Usage and Cost</span>
          <twang-button [icon]="usageTable.allExpanded() ? 'minimize' : 'maximize'" variant="default" size="sm"
            [title]="usageTable.allExpanded() ? 'Collapse all' : 'Expand all'"
            [ariaLabel]="usageTable.allExpanded() ? 'Collapse all' : 'Expand all'"
            (buttonClick)="usageTable.toggleExpandAll()" />
          <twang-button icon="refresh-cw" variant="default" size="sm" ariaLabel="Refresh"
            [loading]="usageTable.loading()"
            (buttonClick)="usageTable.load()" />
          <button
            class="md:hidden flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
            title="Filters"
            (click)="mobilePanel.set(false)"
          >
            <lucide-icon name="arrow-left" [size]="15" />
          </button>
        </div>
        <div class="flex flex-1 min-h-0 p-2 md:p-4">
          <app-usage-table #usageTable
            [filterType]="convType()"
            [filterLlm]="llm()"
            [filterStartDate]="startDate()"
            [filterEndDate]="endDate()"
            [filterTitle]="title()" />
        </div>
      </div>

    </app-page-layout>
  `,
})
export class UsageComponent {
  protected readonly llmOptions = LLM_OPTIONS;
  protected readonly llmLabels = LLM_LABELS;

  protected readonly mobilePanel = signal<boolean | null>(null);
  protected readonly title = signal(localStorage.getItem(TITLE_KEY) ?? '');
  protected readonly convType = signal<ConvType>(readStored(CONV_TYPE_KEY, ['all', 'chat', 'agent'], 'all'));
  protected readonly llm = signal<LlmType>(readStored(LLM_KEY, LLM_OPTIONS, 'all'));
  protected readonly startDate = signal('');
  protected readonly endDate = signal('');

  constructor() {
    effect(() => localStorage.setItem(CONV_TYPE_KEY, this.convType()));
    effect(() => localStorage.setItem(LLM_KEY, this.llm()));
    effect(() => localStorage.setItem(TITLE_KEY, this.title()));
  }
}
