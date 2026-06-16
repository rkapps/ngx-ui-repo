import { Component, effect, input, OnInit, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { TwangButtonComponent } from 'ngx-twang-ui';

@Component({
  selector: 'app-page-layout',
  standalone: true,
  imports: [LucideAngularModule, TwangButtonComponent],
  template: `
    <div class="flex h-full min-h-0">
      <!-- Left sidebar -->
      <aside
        class="flex shrink-0 flex-col border-r border-border bg-white transition-all duration-200"
        [class]="collapsed() ? 'w-12' : expandedWidth()"
      >
        <div
          class="flex min-h-16 shrink-0 items-center border-b border-border px-2"
          [class.justify-center]="collapsed()"
        >
          @if (!collapsed() && panelTitle()) {
            <span class="ml-2 flex-1 text-xs font-semibold uppercase tracking-wider text-primary-600">
              {{ panelTitle() }}
            </span>
          }
          <div class="flex items-center gap-0.5">
            @if (!collapsed()) {
              <ng-content select="[panel-action]" />
            }
            <twang-button
              variant="default"
              size="sm"
              [icon]="collapsed() ? 'chevron-right' : 'chevron-left'"
              [ariaLabel]="collapsed() ? 'Expand panel' : 'Collapse panel'"
              (buttonClick)="collapsed.set(!collapsed())"
            />
          </div>
        </div>

        @if (!collapsed()) {
          <div class="min-h-0 flex-1 overflow-y-auto">
            <ng-content select="[sidebar]" />
          </div>
        }
      </aside>

      <!-- Right panel -->
      <div class="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
        <ng-content select="[content]" />
      </div>
    </div>
  `,
})
export class PageLayoutComponent implements OnInit {
  /** Tailwind class for the expanded sidebar width. */
  readonly expandedWidth = input('w-64');
  readonly panelTitle = input('');
  /**
   * localStorage key for persisting collapsed state across sessions.
   * If omitted, state is not persisted.
   */
  readonly storageKey = input('');

  protected readonly collapsed = signal(false);

  constructor() {
    effect(() => {
      const key = this.storageKey();
      if (key) localStorage.setItem(key, String(this.collapsed()));
    });
  }

  ngOnInit(): void {
    const key = this.storageKey();
    if (key) {
      const saved = localStorage.getItem(key);
      if (saved !== null) this.collapsed.set(saved === 'true');
    }
  }
}
