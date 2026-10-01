import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { type AdminSection, rememberedSectionRedirect, trackActiveSection } from './section-memory';

const ADMIN_SECTIONS: readonly AdminSection[] = [
  { label: 'Access', icon: 'lock', path: 'access' },
];

const SECTION_KEY = 'admin.section';

/** `redirectTo` for the admin route's empty child path: reopens the last selected section. */
export const adminSectionRedirect = rememberedSectionRedirect(SECTION_KEY, ADMIN_SECTIONS);

/**
 * Top-level admin shell: a header of section buttons (each its own child route) above a detail
 * area whose sub header names the active section and whose body scrolls the routed content.
 * Horizontal padding mirrors the title bar so content lines up with it at every breakpoint.
 * Route it behind `roleGuard('Admin', 'SuperAdmin')`.
 */
@Component({
  selector: 'app-admin-page',
  standalone: true,
  imports: [LucideAngularModule, RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <div class="flex h-full min-h-0 flex-col">
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
        <div class="flex shrink-0 items-center border-b border-border px-2 md:px-2 lg:px-4 3xl:px-16 py-3">
          <span class="text-xs font-semibold uppercase tracking-wider text-primary-600">
            {{ activeSection()?.label }}
          </span>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto px-2 md:px-2 lg:px-4 3xl:px-16 pt-2 pb-2 lg:pt-4 xl:pt-6">
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
