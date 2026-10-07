import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { BreadcrumbBarComponent } from '../breadcrumbs/breadcrumb-bar.component';
import { type AdminSection, rememberedSectionRedirect, trackActiveSection } from './section-memory';

const ADMIN_SECTIONS: readonly AdminSection[] = [
  { label: 'Access', icon: 'lock', path: 'access' },
  { label: 'Config', icon: 'settings', path: 'config' },
  { label: 'Logs', icon: 'scroll-text', path: 'logs' },
];

const SECTION_KEY = 'admin.section';

/** `redirectTo` for the admin route's empty child path: reopens the last selected section. */
export const adminSectionRedirect = rememberedSectionRedirect(SECTION_KEY, ADMIN_SECTIONS);

/**
 * Top-level admin shell: a header of section buttons (each its own child route) above a detail
 * area whose sub header is a breadcrumb trail — the active section, then any crumbs the open page
 * sets via `PageBreadcrumbs` — and whose body scrolls the routed content.
 * Horizontal padding mirrors the title bar so content lines up with it at every breakpoint.
 * Route it behind `roleGuard('Admin', 'SuperAdmin')`.
 */
@Component({
  selector: 'app-admin-page',
  standalone: true,
  // Fill the app's flex-column <main> so the gray detail section reaches the bottom.
  host: { class: 'flex min-h-0 flex-1 flex-col' },
  imports: [BreadcrumbBarComponent, LucideAngularModule, RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <div class="flex min-h-0 flex-1 flex-col">
      <!-- Header -->
      <header class="flex shrink-0 overflow-x-auto border-b border-border bg-white px-2 md:px-2 lg:px-4 3xl:px-16 py-2">
        <!-- ml-auto (not justify-end) right-aligns while keeping overflowed buttons scrollable -->
        <nav class="ml-auto flex items-center gap-1" aria-label="Admin sections">
          @for (section of sections; track section.path) {
            <button
              type="button"
              [routerLink]="section.path"
              routerLinkActive="bg-primary-50 !text-primary-700 !font-semibold"
              class="flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
            >
              <lucide-icon [name]="section.icon" [size]="16" aria-hidden="true" />
              {{ section.label }}
            </button>
          }
        </nav>
      </header>

      <!-- Detail -->
      <section class="flex min-h-0 flex-1 flex-col">
        <app-breadcrumb-bar [rootLabel]="activeSection()?.label ?? ''" [rootLink]="activeSection()?.path ?? null" />
        <!-- Gray page background; the three panels on each admin page stay white on top of it. -->
        <div class="min-h-0 flex-1 overflow-y-auto bg-gray-50 px-2 md:px-2 lg:px-4 3xl:px-16 pt-2 pb-2 lg:pt-4 xl:pt-6">
          <router-outlet />
        </div>
      </section>
    </div>
  `,
})
export class AdminPageComponent {
  protected readonly sections = ADMIN_SECTIONS;
  protected readonly activeSection = trackActiveSection(SECTION_KEY, ADMIN_SECTIONS);
}
