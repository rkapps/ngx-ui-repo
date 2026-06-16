import { Component, signal } from '@angular/core';
import { TwangButtonComponent, TwangDatepickerComponent } from 'ngx-twang-ui';
import { UsageTableComponent } from '../usage-table/usage-table.component';
import { PageLayoutComponent } from '../page-layout/page-layout.component';

type ConvType = 'all' | 'chat' | 'agent';
type LlmType = 'all' | 'openai' | 'gemini' | 'anthropic' | 'local';

@Component({
  selector: 'app-usage',
  standalone: true,
  imports: [TwangButtonComponent, TwangDatepickerComponent, UsageTableComponent, PageLayoutComponent],
  host: { class: 'flex flex-1 flex-col min-h-0 overflow-hidden' },
  template: `
    <app-page-layout class="flex flex-1 min-h-0" expandedWidth="w-72" storageKey="layout.usage" panelTitle="Filters">

      <!-- Sidebar: filters -->
      <div sidebar class="flex flex-col p-4">

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
            @for (opt of ['all', 'openai', 'gemini', 'anthropic', 'local']; track opt) {
              <label class="flex items-center gap-2 text-sm text-text cursor-pointer">
                <input type="radio" name="llm" [value]="opt"
                  [checked]="llm() === opt"
                  (change)="llm.set($any(opt))"
                  class="accent-primary-600" />
                {{ opt === 'all' ? 'All' : opt === 'openai' ? 'OpenAI' : opt === 'gemini' ? 'Gemini' : opt === 'anthropic' ? 'Anthropic' : 'Local' }}
              </label>
            }
          </div>
        </div>

        <div class="py-4 border-b border-border flex flex-col gap-4">
          <twang-datepicker label="From" placeholder="Start date" [fullWidth]="true"
            [value]="startDate()"
            (valueChange)="startDate.set($event)" />

          <twang-datepicker label="To" placeholder="End date" [fullWidth]="true"
            [value]="endDate()"
            (valueChange)="endDate.set($event)" />
        </div>

      </div>

      <!-- Right: usage table -->
      <div content class="flex flex-1 flex-col min-h-0 overflow-hidden">
        <div class="flex-none px-4 md:px-6 py-3 border-b border-border flex items-center gap-2 min-h-16">
          <span class="flex-1 text-sm font-semibold text-primary-600">Token Usage</span>
          <twang-button icon="refresh-cw" variant="default" size="sm" ariaLabel="Refresh"
            [loading]="usageTable.loading()"
            (buttonClick)="usageTable.load()" />
        </div>
        <div class="flex flex-1 min-h-0 p-4">
          <app-usage-table #usageTable
            [filterType]="convType()"
            [filterLlm]="llm()"
            [filterStartDate]="startDate()"
            [filterEndDate]="endDate()" />
        </div>
      </div>

    </app-page-layout>
  `,
})
export class UsageComponent {
  protected readonly convType = signal<ConvType>('all');
  protected readonly llm = signal<LlmType>('all');
  protected readonly startDate = signal('');
  protected readonly endDate = signal('');
}
