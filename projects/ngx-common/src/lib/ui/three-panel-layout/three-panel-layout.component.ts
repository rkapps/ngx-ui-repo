import { Component, computed, effect, input, OnInit, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { TwangButtonComponent } from 'ngx-twang-ui';

/**
 * Left / middle / right page layout. Middle is always present; left and right are each
 * optional (via `showLeft` / `showRight`), independently collapsible, and pinnable —
 * a pinned panel stays visible even on mobile, where unpinned side panels hide by default.
 */
@Component({
  selector: 'app-three-panel-layout',
  standalone: true,
  imports: [LucideAngularModule, TwangButtonComponent],
  template: `
    <div [class]="rootClasses()">
      @if (showLeft()) {
        <aside [hidden]="leftHidden()" [class]="leftClasses()">
          <div class="flex min-h-10 shrink-0 items-center gap-1 border-b border-border px-2" [class.justify-center]="leftCollapsed()">
            @if (!leftCollapsed() && leftTitle()) {
              <span class="ml-1 flex-1 truncate text-xs font-semibold uppercase tracking-wider text-primary-600">
                {{ leftTitle() }}
              </span>
            }
            <div class="flex items-center gap-0.5">
              @if (!leftCollapsed()) {
                <twang-button
                  variant="default"
                  size="sm"
                  [icon]="leftPinned() ? 'pin-off' : 'pin'"
                  [ariaLabel]="leftPinned() ? 'Unpin panel' : 'Pin panel'"
                  (buttonClick)="leftPinned.set(!leftPinned())"
                />
              }
              <twang-button
                variant="default"
                size="sm"
                [icon]="leftCollapsed() ? 'chevron-right' : 'chevron-left'"
                [ariaLabel]="leftCollapsed() ? 'Expand panel' : 'Collapse panel'"
                (buttonClick)="leftCollapsed.set(!leftCollapsed())"
              />
            </div>
          </div>
          @if (!leftCollapsed()) {
            <div class="min-h-0 flex-1 overflow-y-auto p-3">
              <ng-content select="[left]" />
            </div>
          }
        </aside>
      }

      <!-- Middle -->
      <div [class]="middleClasses()">
        @if (middleTitle()) {
          <div class="flex min-h-10 shrink-0 items-center border-b border-border px-3">
            <span class="text-xs font-semibold uppercase tracking-wider text-primary-600">{{ middleTitle() }}</span>
          </div>
        }
        <ng-content select="[middle]" />
      </div>

      @if (showRight()) {
        <aside [hidden]="rightHidden()" [class]="rightClasses()">
          <div class="flex min-h-10 shrink-0 items-center gap-1 border-b border-border px-2" [class.justify-center]="rightCollapsed()">
            <div class="flex items-center gap-0.5">
              <twang-button
                variant="default"
                size="sm"
                [icon]="rightCollapsed() ? 'chevron-left' : 'chevron-right'"
                [ariaLabel]="rightCollapsed() ? 'Expand panel' : 'Collapse panel'"
                (buttonClick)="rightCollapsed.set(!rightCollapsed())"
              />
              @if (!rightCollapsed()) {
                <twang-button
                  variant="default"
                  size="sm"
                  [icon]="rightPinned() ? 'pin-off' : 'pin'"
                  [ariaLabel]="rightPinned() ? 'Unpin panel' : 'Pin panel'"
                  (buttonClick)="rightPinned.set(!rightPinned())"
                />
              }
            </div>
            @if (!rightCollapsed() && rightTitle()) {
              <span class="mr-1 flex-1 truncate text-right text-xs font-semibold uppercase tracking-wider text-primary-600">
                {{ rightTitle() }}
              </span>
            }
          </div>
          @if (!rightCollapsed()) {
            <div class="min-h-0 flex-1 overflow-y-auto">
              <ng-content select="[right]" />
            </div>
          }
        </aside>
      }
    </div>
  `,
})
export class ThreePanelLayoutComponent implements OnInit {
  readonly showLeft = input(true);
  readonly showRight = input(true);
  readonly leftTitle = input('');
  readonly rightTitle = input('');
  readonly middleTitle = input('');
  /** Tailwind class for the expanded left panel width. */
  readonly leftWidth = input('w-72');
  /** Tailwind class for the expanded right panel width. */
  readonly rightWidth = input('w-72');
  /** Base localStorage key for persisting collapsed/pinned state; state isn't persisted if omitted. */
  readonly storageKey = input('');
  /** Tailwind background class for the layout's root container (e.g. `bg-gray-50`). */
  readonly background = input('');
  /**
   * Tailwind min-height class applied to all three panels (e.g. `min-h-[70vh]`). Since panels
   * don't stretch to match each other (see `items-start` below), a page with sparse/placeholder
   * content in one panel would otherwise render each panel sized to only its own content. Leave
   * unset for content-driven layouts (e.g. a tall chat thread should decide the page's height).
   */
  readonly panelMinHeight = input('');

  protected readonly rootClasses = computed(() =>
    `flex w-full items-start gap-3 md:gap-4 lg:gap-6 xl:gap-8 ${this.background()}`
  );

  /** No background/border here by design — each consumer decides how its middle content should look. */
  protected readonly middleClasses = computed(() => `flex min-w-0 flex-1 flex-col ${this.panelMinHeight()}`);

  protected readonly leftCollapsed = signal(false);
  protected readonly leftPinned = signal(false);
  protected readonly rightCollapsed = signal(false);
  protected readonly rightPinned = signal(false);

  // Hidden on mobile unless pinned — [hidden] attr lets Tailwind's md:flex (author
  // stylesheet) override the UA [hidden]{display:none} rule on desktop.
  protected readonly leftHidden = computed(() => !this.leftPinned());
  protected readonly rightHidden = computed(() => !this.rightPinned());

  protected readonly leftClasses = computed(() => panelClasses(this.leftPinned(), this.leftCollapsed(), this.leftWidth(), this.panelMinHeight()));
  protected readonly rightClasses = computed(() => panelClasses(this.rightPinned(), this.rightCollapsed(), this.rightWidth(), this.panelMinHeight()));

  constructor() {
    effect(() => {
      const key = this.storageKey();
      if (!key) return;
      localStorage.setItem(`${key}.left.collapsed`, String(this.leftCollapsed()));
      localStorage.setItem(`${key}.left.pinned`, String(this.leftPinned()));
      localStorage.setItem(`${key}.right.collapsed`, String(this.rightCollapsed()));
      localStorage.setItem(`${key}.right.pinned`, String(this.rightPinned()));
    });
  }

  ngOnInit(): void {
    const key = this.storageKey();
    if (!key) return;
    const read = (suffix: string) => localStorage.getItem(`${key}.${suffix}`);
    if (read('left.collapsed') !== null) this.leftCollapsed.set(read('left.collapsed') === 'true');
    if (read('left.pinned') !== null) this.leftPinned.set(read('left.pinned') === 'true');
    if (read('right.collapsed') !== null) this.rightCollapsed.set(read('right.collapsed') === 'true');
    if (read('right.pinned') !== null) this.rightPinned.set(read('right.pinned') === 'true');
  }
}

function panelClasses(pinned: boolean, collapsed: boolean, expandedWidth: string, minHeight: string): string {
  // 'flex' when pinned (visible on mobile too); 'md:flex' otherwise (desktop only).
  const display = pinned ? 'flex' : 'md:flex';
  const desktopWidth = collapsed ? 'w-12' : expandedWidth;
  // Enumerate complete class strings so Tailwind JIT includes them.
  const responsiveWidth =
    desktopWidth === 'w-12' ? 'w-full md:w-12' :
    desktopWidth === 'w-64' ? 'w-full md:w-64' :
    desktopWidth === 'w-72' ? 'w-full md:w-72' :
    desktopWidth === 'w-80' ? 'w-full md:w-80' :
    desktopWidth === 'w-96' ? 'w-full md:w-72 xl:w-96' :
    'w-full';
  return `${display} ${responsiveWidth} shrink-0 flex-col rounded-lg border border-border bg-white transition-all duration-200 sticky top-3 max-h-[calc(100vh-1.5rem)] ${minHeight}`;
}
