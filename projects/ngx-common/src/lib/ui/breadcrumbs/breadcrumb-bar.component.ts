import { Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { PageBreadcrumbs } from './page-breadcrumbs';

/**
 * Breadcrumb trail: a root crumb (e.g. the admin section, or "Logs"), then whatever the open page
 * set on `PageBreadcrumbs`. The root links back to `rootLink` once there are crumbs after it; the
 * last crumb is plain text. Horizontal padding mirrors the title bar.
 */
@Component({
  selector: 'app-breadcrumb-bar',
  standalone: true,
  imports: [LucideAngularModule, RouterLink],
  template: `
    <nav
      aria-label="Breadcrumb"
      class="flex min-w-0 shrink-0 items-center gap-1.5 overflow-x-auto border-b border-border bg-white px-2 md:px-2 lg:px-4 3xl:px-16 py-3 text-xs"
    >
      @if (crumbs().length && rootLink()) {
        <a [routerLink]="rootLink()" class="shrink-0 font-semibold uppercase tracking-wider text-primary-600 hover:underline">
          {{ rootLabel() }}
        </a>
      } @else {
        <span class="shrink-0 font-semibold uppercase tracking-wider text-primary-600">{{ rootLabel() }}</span>
      }
      @for (crumb of crumbs(); track $index; let last = $last) {
        <lucide-icon name="chevron-right" [size]="12" class="shrink-0 text-text-muted" aria-hidden="true" />
        @if (crumb.path && !last) {
          <a
            [routerLink]="crumb.path"
            [queryParams]="crumb.queryParams"
            class="max-w-56 shrink-0 truncate text-text-muted hover:text-primary-600 hover:underline"
          >{{ crumb.label }}</a>
        } @else {
          <span class="max-w-72 shrink-0 truncate font-medium text-text" [attr.aria-current]="last ? 'page' : null">{{ crumb.label }}</span>
        }
      }
    </nav>
  `,
})
export class BreadcrumbBarComponent {
  readonly rootLabel = input('');
  /** Router link for the root crumb (relative links resolve against the host component's route). */
  readonly rootLink = input<string | unknown[] | null>(null);

  protected readonly crumbs = inject(PageBreadcrumbs).crumbs;
}
