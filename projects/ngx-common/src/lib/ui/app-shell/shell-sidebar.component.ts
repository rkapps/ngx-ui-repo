import { Component, inject, input, model, output } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { LOGIN_CONFIG } from '../../auth/login.config';
import { type ShellNavItem, shellNavTarget } from './shell-nav';

/**
 * Full-height left sidebar of the app shell: brand (same height as the title bar, so their bottom
 * borders line up), the nav, and a collapse toggle at the bottom. Collapsed, it narrows to icons.
 * On small screens the shell shows it as a drawer instead (`drawer` true: always expanded, no toggle).
 */
@Component({
  selector: 'app-shell-sidebar',
  standalone: true,
  imports: [LucideAngularModule, NgTemplateOutlet, RouterLink, RouterLinkActive],
  host: { class: 'flex h-full shrink-0 flex-col border-r border-border bg-white transition-[width] duration-200' },
  template: `
    <div class="flex h-14 shrink-0 items-center gap-2.5 border-b border-border" [class]="narrow() ? 'justify-center px-2' : 'px-4'">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="24" height="24" class="shrink-0" aria-hidden="true">
        <rect width="100" height="100" rx="22" fill="#1971c2" />
        <line x1="50" y1="26" x2="50" y2="74" stroke="rgba(255,255,255,0.35)" stroke-width="5" stroke-linecap="round" />
        <line x1="26" y1="50" x2="74" y2="50" stroke="rgba(255,255,255,0.35)" stroke-width="5" stroke-linecap="round" />
        <line x1="30" y1="30" x2="70" y2="70" stroke="rgba(255,255,255,0.2)" stroke-width="4" stroke-linecap="round" />
        <line x1="70" y1="30" x2="30" y2="70" stroke="rgba(255,255,255,0.2)" stroke-width="4" stroke-linecap="round" />
        <circle cx="50" cy="20" r="8" fill="rgba(255,255,255,0.75)" />
        <circle cx="50" cy="80" r="8" fill="rgba(255,255,255,0.75)" />
        <circle cx="20" cy="50" r="8" fill="rgba(255,255,255,0.75)" />
        <circle cx="80" cy="50" r="8" fill="rgba(255,255,255,0.75)" />
        <circle cx="50" cy="50" r="14" fill="white" />
      </svg>
      @if (!narrow()) {
        <span class="truncate text-base font-bold tracking-tight text-primary-600">{{ loginConfig.appName }}</span>
      }
      @if (drawer()) {
        <button
          type="button"
          class="ml-auto flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-surface-muted"
          aria-label="Close navigation"
          (click)="closeDrawer.emit()"
        >
          <lucide-icon name="x" [size]="18" />
        </button>
      }
    </div>

    <nav class="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2" aria-label="Main navigation">
      @for (item of navItems(); track item.link) {
        @if (item.divider) {
          <div class="my-1 border-t border-border" role="separator"></div>
        }
        @if (item.children?.length && !narrow()) {
          <!-- Group: expands to its pages -->
          <button
            type="button"
            class="flex items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-medium text-gray-800 transition-colors hover:bg-surface-muted hover:text-gray-950"
            [class.!text-primary-700]="activeLink() === item.link"
            [attr.aria-expanded]="!closedGroups().has(item.link)"
            (click)="toggleGroup.emit(item.link)"
          >
            <lucide-icon [name]="item.icon" [size]="18" class="shrink-0" aria-hidden="true" />
            <span class="flex-1 truncate">{{ item.label }}</span>
            <lucide-icon
              name="chevron-right"
              [size]="14"
              class="shrink-0 transition-transform"
              [class.rotate-90]="!closedGroups().has(item.link)"
              aria-hidden="true"
            />
          </button>
          @if (!closedGroups().has(item.link)) {
            @for (child of item.children; track child.link) {
              @if (child.children?.length) {
                <!-- Sub-group: a heading over its pages -->
                <div class="flex items-center gap-2 pb-0.5 pl-9 pr-3 pt-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                  <lucide-icon [name]="child.icon" [size]="14" class="shrink-0" aria-hidden="true" />
                  <span class="truncate">{{ child.label }}</span>
                </div>
                @for (page of child.children; track page.link) {
                  <ng-container *ngTemplateOutlet="pageLink; context: { $implicit: page, indent: 'pl-14' }" />
                }
              } @else {
                <ng-container *ngTemplateOutlet="pageLink; context: { $implicit: child, indent: 'pl-9' }" />
              }
            }
          }
        } @else {
          <!-- Page, or a group in the icon-only sidebar (opens its first page) -->
          <a
            [routerLink]="target(item)"
            class="flex items-center gap-3 rounded-md py-2 text-sm font-medium text-gray-800 transition-colors hover:bg-surface-muted hover:text-gray-950"
            [class]="(narrow() ? 'justify-center px-2' : 'px-3') + (activeLink() === item.link ? ' bg-primary-50 !text-primary-700 font-semibold' : '')"
            [title]="narrow() ? item.label : ''"
            [attr.aria-label]="item.label"
            (click)="closeDrawer.emit()"
          >
            <lucide-icon [name]="item.icon" [size]="18" class="shrink-0" aria-hidden="true" />
            @if (!narrow()) {
              <span class="truncate">{{ item.label }}</span>
            }
          </a>
        }
      }
    </nav>

    <!-- A page inside a group; indent is a literal class (pl-9 / pl-14) so Tailwind sees it. -->
    <ng-template #pageLink let-page let-indent="indent">
      <a
        [routerLink]="page.link"
        routerLinkActive="bg-primary-50 !text-primary-700 font-semibold"
        [routerLinkActiveOptions]="{ exact: !!page.exact }"
        class="flex items-center gap-3 rounded-md py-1.5 pr-3 text-sm text-gray-700 transition-colors hover:bg-surface-muted hover:text-gray-950"
        [class]="indent"
        (click)="closeDrawer.emit()"
      >
        <lucide-icon [name]="page.icon" [size]="16" class="shrink-0" aria-hidden="true" />
        <span class="truncate">{{ page.label }}</span>
      </a>
    </ng-template>

    @if (!drawer()) {
      <div class="shrink-0 border-t border-border p-2">
        <button
          type="button"
          class="flex w-full items-center gap-3 rounded-md py-2 text-sm text-text-muted hover:bg-surface-muted hover:text-text"
          [class]="narrow() ? 'justify-center px-2' : 'px-3'"
          [attr.aria-label]="collapsed() ? 'Expand sidebar' : 'Collapse sidebar'"
          [title]="collapsed() ? 'Expand sidebar' : 'Collapse sidebar'"
          (click)="collapsed.set(!collapsed())"
        >
          <lucide-icon [name]="collapsed() ? 'panel-left-open' : 'panel-left-close'" [size]="18" class="shrink-0" />
          @if (!narrow()) {
            <span>Collapse</span>
          }
        </button>
      </div>
    }
  `,
})
export class ShellSidebarComponent {
  readonly navItems = input<readonly ShellNavItem[]>([]);
  /** Icons only. Two-way bindable so the shell can remember it. */
  readonly collapsed = model(false);
  /** Rendered as the mobile drawer: always expanded, with a close button instead of the collapse toggle. */
  readonly drawer = input(false);
  readonly closeDrawer = output<void>();
  /** Link of the top-level item containing the current page (highlights it, and a collapsed group). */
  readonly activeLink = input<string | null>(null);
  /** Groups (by `link`) the user has closed; groups start open. */
  readonly closedGroups = input<ReadonlySet<string>>(new Set());
  readonly toggleGroup = output<string>();

  protected readonly loginConfig = inject(LOGIN_CONFIG);
  protected readonly narrow = () => this.collapsed() && !this.drawer();
  protected readonly target = shellNavTarget;
}
