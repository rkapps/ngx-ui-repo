import { Component, computed, effect, input, OnInit, output, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { TwangButtonComponent } from 'ngx-twang-ui';

@Component({
  selector: 'app-page-layout',
  standalone: true,
  imports: [LucideAngularModule, TwangButtonComponent],
  template: `
    <div class="flex h-full min-h-0 w-full">
      <!-- Left sidebar -->
      <aside [hidden]="asideHidden()" [class]="asideClasses()">
        <div
          class="flex min-h-10 md:min-h-16 shrink-0 items-center border-b border-border px-2"
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
            <div class="hidden md:block">
              <twang-button
                variant="default"
                size="sm"
                [icon]="collapsed() ? 'chevron-right' : 'chevron-left'"
                [ariaLabel]="collapsed() ? 'Expand panel' : 'Collapse panel'"
                (buttonClick)="collapsed.set(!collapsed())"
              />
            </div>
          </div>
        </div>

        @if (!collapsed()) {
          <div class="min-h-0 flex-1 overflow-y-auto">
            <ng-content select="[sidebar]" />
          </div>
        }
      </aside>

      <!-- Right panel -->
      <div [class]="contentClasses()">
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
  /**
   * Controls mobile panel visibility:
   *   null  – content is shown by default, no back button (usage/filter pages)
   *   false – show sidebar on mobile (list view)
   *   true  – show content on mobile with a back button (detail view)
   */
  readonly mobileShowContent = input<boolean | null>(null);

  /** Emitted when the mobile back button is tapped. */
  readonly mobileBack = output<void>();

  protected readonly collapsed = signal(false);

  /**
   * Aside visibility:
   *   mobile=true  → hidden on mobile, flex on desktop
   *   mobile=false → flex everywhere (sidebar view)
   *   mobile=null  → hidden on mobile, flex on desktop (content is default)
   */
  // True when the aside must be hidden on mobile; [hidden] attr is used so the
  // browser's UA rule ([hidden]{display:none}) does the hiding. Tailwind's md:flex
  // (author stylesheet) overrides the UA rule on desktop, so the aside still shows there.
  protected readonly asideHidden = computed(() => this.mobileShowContent() !== false);

  protected readonly asideClasses = computed(() => {
    const mobile = this.mobileShowContent();
    // 'flex' when explicitly showing sidebar on mobile; 'md:flex' otherwise (desktop only).
    // Mobile hiding is handled by [hidden] attribute, not a CSS class.
    const display = mobile === false ? 'flex' : 'md:flex';
    const desktopWidth = this.collapsed() ? 'w-12' : this.expandedWidth();
    // Enumerate complete class strings so Tailwind JIT includes them.
    const responsiveWidth =
      desktopWidth === 'w-12' ? 'w-full md:w-12' :
      desktopWidth === 'w-64' ? 'w-full md:w-64' :
      desktopWidth === 'w-72' ? 'w-full md:w-72' :
      desktopWidth === 'w-96' ? 'w-full md:w-72 xl:w-96' :
      'w-full';
    return `${display} ${responsiveWidth} shrink-0 flex-col border-r border-border bg-white transition-all duration-200`;
  });

  /**
   * Content visibility:
   *   mobile=false → hidden on mobile, flex on desktop (sidebar is shown)
   *   otherwise    → flex everywhere
   */
  protected readonly contentClasses = computed(() => {
    const mobile = this.mobileShowContent();
    const display = mobile === false ? 'hidden md:flex' : 'flex';
    return `${display} min-w-0 flex-1 flex-col overflow-hidden`;
  });

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
