import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { type PageCrumb, PageBreadcrumbs } from './page-breadcrumbs';

/**
 * Breadcrumb trail: the host's `base` crumbs (e.g. the admin section and sub-section), then
 * whatever the open page set on `PageBreadcrumbs`. Every crumb with a `path` links except the last,
 * which is the current page. Renders only the trail — the host provides the header around it.
 */
@Component({
  selector: 'app-breadcrumb-bar',
  standalone: true,
  imports: [LucideAngularModule, RouterLink],
  host: { class: 'min-w-0' },
  template: `
    <nav aria-label="Breadcrumb" class="flex min-w-0 items-center gap-1.5 overflow-x-auto text-xs">
      @for (crumb of trail(); track $index; let first = $first; let last = $last) {
        @if (!first) {
          <lucide-icon name="chevron-right" [size]="12" class="shrink-0 text-text-muted" aria-hidden="true" />
        }
        @if (crumb.path && !last) {
          <a
            [routerLink]="crumb.path"
            [queryParams]="crumb.queryParams"
            class="max-w-56 shrink-0 truncate hover:underline"
            [class]="first ? 'font-semibold uppercase tracking-wider text-primary-600' : 'text-text-muted hover:text-primary-600'"
          >{{ crumb.label }}</a>
        } @else {
          <span
            class="max-w-72 shrink-0 truncate"
            [class]="first ? 'font-semibold uppercase tracking-wider text-primary-600' : 'font-medium text-text'"
            [attr.aria-current]="last ? 'page' : null"
          >{{ crumb.label }}</span>
        }
      }
    </nav>
  `,
})
export class BreadcrumbBarComponent {
  /** Leading crumbs owned by the host (section, sub-section); use absolute paths. */
  readonly base = input<PageCrumb[]>([]);

  private readonly pageCrumbs = inject(PageBreadcrumbs).crumbs;
  protected readonly trail = computed(() => [...this.base(), ...this.pageCrumbs()]);
}
