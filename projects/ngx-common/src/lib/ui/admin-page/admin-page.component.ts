import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { filter } from 'rxjs';
import { ACCESS_SECTION_KEY, ACCESS_SECTIONS } from '../admin-access/access-sections';
import { CONFIG_SECTION_KEY, CONFIG_SECTIONS } from '../admin-config/config-sections';
import { BreadcrumbBarComponent } from '../breadcrumbs/breadcrumb-bar.component';
import { type PageCrumb, PageBreadcrumbs } from '../breadcrumbs/page-breadcrumbs';
import { type AdminSection, rememberedSectionRedirect, trackActiveSection } from './section-memory';

const ADMIN_SECTIONS: readonly AdminSection[] = [
  { label: 'Access', icon: 'lock', path: 'access' },
  { label: 'Config', icon: 'settings', path: 'config' },
  { label: 'Logs', icon: 'scroll-text', path: 'logs' },
];

/** Sub-sections shown under each section in the sidebar tree (Logs has none). */
const ADMIN_CHILDREN: Record<string, readonly AdminSection[]> = {
  access: ACCESS_SECTIONS,
  config: CONFIG_SECTIONS,
};

const SECTION_KEY = 'admin.section';
const COLLAPSED_KEY = 'admin.nav.collapsed';

/** `redirectTo` for the admin route's empty child path: reopens the last selected section. */
export const adminSectionRedirect = rememberedSectionRedirect(SECTION_KEY, ADMIN_SECTIONS);

function readCollapsed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]'));
  } catch {
    return new Set();
  }
}

/**
 * Admin shell (below the app title bar): a sidebar tree on the left — Access › Users / User Groups /
 * Resource Types / Grants, Config › Agents / Providers, Logs — and the main area on the right: a
 * header (breadcrumbs, plus actions a page may set via `PageBreadcrumbs`) over a gray, scrolling
 * body that hosts the routed page. On small screens the sidebar opens as a drawer from the header.
 * Route it behind `roleGuard('Admin', 'SuperAdmin')`.
 */
@Component({
  selector: 'app-admin-page',
  standalone: true,
  // Fill the app's flex-column <main>.
  host: { class: 'flex min-h-0 flex-1 flex-col' },
  imports: [BreadcrumbBarComponent, LucideAngularModule, NgTemplateOutlet, RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <div class="relative flex min-h-0 flex-1">
      <!-- Sidebar tree -->
      <aside
        class="w-64 shrink-0 flex-col border-r border-border bg-white md:static md:flex md:w-60 md:shadow-none lg:w-64 xl:w-72 3xl:w-80"
        [class]="mobileNavOpen() ? 'absolute inset-y-0 left-0 z-30 flex shadow-lg' : 'hidden'"
        aria-label="Admin navigation"
      >
        <!-- Same height and border as the main header, so the two line up; on 3xl the left padding
             matches the title bar's (px-16), lining "Admin" up with the logo. -->
        <div class="flex min-h-12 shrink-0 items-center gap-2 border-b border-border px-4 py-2 lg:px-5 xl:px-6 3xl:pl-16">
          <lucide-icon name="shield" [size]="16" class="text-primary-600" />
          <span class="text-xs font-semibold uppercase tracking-wider text-primary-600">Admin</span>
        </div>
        <nav class="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-3 lg:gap-1 lg:px-3 lg:py-4 xl:px-4 3xl:pl-14">
          @for (section of sections; track section.path) {
            @if (children[section.path]; as kids) {
              <button
                type="button"
                class="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium hover:bg-surface-muted"
                [class.text-primary-700]="activeSection()?.path === section.path"
                [attr.aria-expanded]="!collapsed().has(section.path)"
                (click)="toggle(section.path)"
              >
                <lucide-icon
                  name="chevron-right"
                  [size]="14"
                  class="shrink-0 text-text-muted transition-transform"
                  [class.rotate-90]="!collapsed().has(section.path)"
                />
                <lucide-icon [name]="section.icon" [size]="16" class="shrink-0" />
                <span class="flex-1">{{ section.label }}</span>
              </button>
              @if (!collapsed().has(section.path)) {
                @for (child of kids; track child.path) {
                  <a
                    [routerLink]="['/admin', section.path, child.path]"
                    routerLinkActive="bg-primary-50 !text-primary-700 font-semibold"
                    class="flex items-center gap-2 rounded-md py-1.5 pl-9 pr-2 text-sm text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
                  >
                    <lucide-icon [name]="child.icon" [size]="14" class="shrink-0" />
                    {{ child.label }}
                  </a>
                }
              }
            } @else {
              <a
                [routerLink]="['/admin', section.path]"
                routerLinkActive="bg-primary-50 !text-primary-700"
                class="flex items-center gap-2 rounded-md py-1.5 pl-7 pr-2 text-sm font-medium transition-colors hover:bg-surface-muted"
              >
                <lucide-icon [name]="section.icon" [size]="16" class="shrink-0" />
                {{ section.label }}
              </a>
            }
          }
        </nav>
      </aside>
      @if (mobileNavOpen()) {
        <div class="absolute inset-0 z-20 bg-black/10 md:hidden" aria-hidden="true" (click)="mobileNavOpen.set(false)"></div>
      }

      <!-- Main: header + scrolling body -->
      <section class="flex min-h-0 min-w-0 flex-1 flex-col">
        <!-- Side padding matches the body below, so the breadcrumbs line up with the page content; on 3xl
             both match the title bar's px-16, so the right edges line up with its user menu. -->
        <header class="flex min-h-12 shrink-0 items-center gap-2 border-b border-border bg-white px-3 py-2 md:px-4 lg:px-6 xl:px-8 2xl:px-10 3xl:px-16">
          <button
            type="button"
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-surface-muted md:hidden"
            aria-label="Admin navigation"
            (click)="mobileNavOpen.set(!mobileNavOpen())"
          >
            <lucide-icon name="menu" [size]="18" />
          </button>
          <app-breadcrumb-bar class="flex-1" [base]="baseCrumbs()" />
          @if (actions(); as tpl) {
            <div class="ml-auto flex shrink-0 items-center gap-2">
              <ng-container *ngTemplateOutlet="tpl" />
            </div>
          }
        </header>
        <!-- Gray page background; panels stay white on top of it. -->
        <!-- Flex column so a page can fill the height (e.g. a three-panel layout with "fill"). -->
        <div class="flex min-h-0 flex-1 flex-col overflow-y-auto bg-gray-50 p-3 md:p-4 lg:p-6 xl:p-8 2xl:p-10 3xl:px-16">
          <router-outlet />
        </div>
      </section>
    </div>
  `,
})
export class AdminPageComponent {
  protected readonly sections = ADMIN_SECTIONS;
  protected readonly children = ADMIN_CHILDREN;
  protected readonly actions = inject(PageBreadcrumbs).actions;
  protected readonly mobileNavOpen = signal(false);

  // Remember the selected section and sub-sections, so empty paths reopen them.
  protected readonly activeSection = trackActiveSection(SECTION_KEY, ADMIN_SECTIONS);
  private readonly activeAccess = trackActiveSection(ACCESS_SECTION_KEY, ACCESS_SECTIONS);
  private readonly activeConfig = trackActiveSection(CONFIG_SECTION_KEY, CONFIG_SECTIONS);

  /** Sections collapsed in the sidebar (everything starts expanded); remembered per browser. */
  protected readonly collapsed = signal(readCollapsed());

  /** "ACCESS › Users", "CONFIG › Agents", "LOGS"; pages append their own crumbs after these. */
  protected readonly baseCrumbs = computed<PageCrumb[]>(() => {
    const section = this.activeSection();
    if (!section) return [];
    const crumbs: PageCrumb[] = [{ label: section.label, path: ['/admin', section.path] }];
    const child = section.path === 'access' ? this.activeAccess() : section.path === 'config' ? this.activeConfig() : undefined;
    if (child) crumbs.push({ label: child.label, path: ['/admin', section.path, child.path] });
    return crumbs;
  });

  constructor() {
    // Close the mobile drawer after any navigation.
    inject(Router)
      .events.pipe(
        filter(e => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.mobileNavOpen.set(false));
  }

  protected toggle(path: string): void {
    this.collapsed.update(set => {
      const next = new Set(set);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
      } catch {
        // storage unavailable — just not remembered
      }
      return next;
    });
  }
}
