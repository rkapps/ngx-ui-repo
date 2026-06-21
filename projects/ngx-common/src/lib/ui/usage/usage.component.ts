import { Component, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { TwangButtonComponent, TwangDatepickerComponent } from 'ngx-twang-ui';
import { UsageTableComponent } from '../usage-table/usage-table.component';
import { PageLayoutComponent } from '../page-layout/page-layout.component';

type ConvType = 'all' | 'chat' | 'agent';
type LlmType = 'all' | 'openai' | 'gemini' | 'anthropic' | 'local';

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
          <span class="flex-1 text-sm font-semibold text-primary-600">Token Usage</span>
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
            [filterEndDate]="endDate()" />
        </div>
      </div>

    </app-page-layout>
  `,
})
export class UsageComponent {
  protected readonly mobilePanel = signal<boolean | null>(null);
  protected readonly convType = signal<ConvType>('all');
  protected readonly llm = signal<LlmType>('all');
  protected readonly startDate = signal('');
  protected readonly endDate = signal('');
}
