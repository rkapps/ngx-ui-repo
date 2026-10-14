import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { filter, map } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { saveLastPage } from '../../auth/landing-page';
import { LOGIN_CONFIG } from '../../auth/login.config';
import { BreadcrumbBarComponent } from '../breadcrumbs/breadcrumb-bar.component';
import { type PageCrumb, PageBreadcrumbs } from '../breadcrumbs/page-breadcrumbs';
import { activeShellNavItem, activeShellNavPath, type ShellNavItem, shellNavTarget } from './shell-nav';
import { ShellSidebarComponent } from './shell-sidebar.component';
import { ShellTitleBarComponent } from './shell-title-bar.component';

/**
 * App shell: a full-height sidebar on the left; on the right a title bar (section title, user menu)
 * over the main area — a header (breadcrumbs, plus actions a page sets via `PageBreadcrumbs`) and
 * the detail, which is the router outlet. Signed out (e.g. the login page) it renders just the
 * outlet. Use it as the root component's whole template: `<app-shell [navItems]="..." />`.
 */
@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [BreadcrumbBarComponent, LucideAngularModule, NgTemplateOutlet, RouterOutlet, ShellSidebarComponent, ShellTitleBarComponent],
  host: { class: 'block h-screen' },
  template: `
    @if (!auth.ready()) {
      <div class="flex h-full items-center justify-center">
        <lucide-icon name="loader-circle" [size]="28" class="animate-spin text-text-muted" />
      </div>
    } @else if (!auth.isLoggedIn()) {
      <div class="flex h-full flex-col overflow-y-auto">
        <router-outlet />
      </div>
    } @else {
      <div class="relative flex h-full overflow-hidden">
        <!-- Sidebar: in the layout from md up; a drawer over the page below that. -->
        <app-shell-sidebar
          class="hidden md:flex"
          [class]="collapsed() ? 'w-16' : 'w-64 xl:w-72 3xl:w-80'"
          [navItems]="navItems()"
          [activeLink]="activeItem()?.link ?? null"
          [closedGroups]="closedGroups()"
          (toggleGroup)="toggleGroup($event)"
          [(collapsed)]="collapsed"
        />
        @if (drawerOpen()) {
          <div class="absolute inset-0 z-40 bg-black/20 md:hidden" aria-hidden="true" (click)="drawerOpen.set(false)"></div>
          <app-shell-sidebar
            class="absolute inset-y-0 left-0 z-50 w-72 shadow-xl md:hidden"
            [navItems]="navItems()"
            [activeLink]="activeItem()?.link ?? null"
            [closedGroups]="closedGroups()"
            (toggleGroup)="toggleGroup($event)"
            [drawer]="true"
            (closeDrawer)="drawerOpen.set(false)"
          />
        }

        <div class="flex min-w-0 flex-1 flex-col">
          <app-shell-title-bar [heading]="activeItem()?.label ?? ''" [settingsLink]="settingsLink()" (menuClick)="drawerOpen.set(true)" />

          <main class="flex min-h-0 flex-1 flex-col">
            @if (error(); as message) {
              <!-- Blocking error (e.g. the account couldn't be loaded): no page, just the message. -->
              <div class="flex min-h-0 flex-1 items-start justify-center overflow-y-auto bg-gray-100 p-3 md:p-4 lg:p-6 xl:p-8 3xl:px-16">
                <div class="mt-8 flex w-full max-w-lg flex-col items-center gap-3 rounded-lg border border-red-200 bg-white p-8 text-center">
                  <lucide-icon name="circle-alert" [size]="32" class="text-red-600" />
                  <h1 class="text-base font-semibold text-text">{{ errorTitle() }}</h1>
                  <p class="break-words text-sm text-text-muted">{{ message }}</p>
                  <div class="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      class="rounded-md border border-border px-3 py-1.5 text-sm text-text hover:bg-surface-muted"
                      (click)="reload()"
                    >
                      Try again
                    </button>
                    <button
                      type="button"
                      class="rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
                      (click)="signOut()"
                    >
                      Sign out
                    </button>
                  </div>
                </div>
              </div>
            } @else {
            <!-- Page header: breadcrumbs (section, then the page's own) and the page's actions.
                 Side padding matches the title bar and the detail, so everything lines up. -->
            <header class="flex min-h-12 shrink-0 items-center gap-2 border-b border-border bg-white px-3 py-2 md:px-4 lg:px-6 xl:px-8 3xl:px-16">
              <app-breadcrumb-bar class="flex-1" [base]="baseCrumbs()" />
              @if (actions(); as tpl) {
                <div class="ml-auto flex shrink-0 items-center gap-2">
                  <ng-container *ngTemplateOutlet="tpl" />
                </div>
              }
            </header>
            <!-- Detail: gray page background (panels stay white on it); a flex column so a page can fill the height. -->
            <div class="flex min-h-0 flex-1 flex-col overflow-y-auto bg-gray-100 p-3 md:p-4 lg:p-6 xl:p-8 3xl:px-16">
              <router-outlet />
            </div>
            }
          </main>
        </div>
      </div>
    }
  `,
})
export class AppShellComponent {
  readonly navItems = input<readonly ShellNavItem[]>([]);
  /** Forwarded to the user menu: its Settings item only renders when set. */
  readonly settingsLink = input<string | null>(null);
  /** Shown in place of the page (header and outlet) while set, e.g. the account failed to load. */
  readonly error = input<string | null>(null);
  readonly errorTitle = input("We couldn't load your account");

  protected readonly auth = inject(AuthService);
  protected readonly actions = inject(PageBreadcrumbs).actions;
  private readonly loginConfig = inject(LOGIN_CONFIG);
  private readonly router = inject(Router);

  private readonly collapsedKey = `${this.loginConfig.appName ?? 'app'}.sidebar.collapsed`;
  protected readonly collapsed = signal(this.readCollapsed());
  protected readonly drawerOpen = signal(false);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(e => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );
  protected readonly activeItem = computed(() => activeShellNavItem(this.navItems(), this.url()));

  /** The nav path to the current page (Admin › Config › Agents) as the first crumbs; the open page appends its own via `PageBreadcrumbs`. */
  protected readonly baseCrumbs = computed<PageCrumb[]>(() =>
    activeShellNavPath(this.navItems(), this.url()).map(item => ({ label: item.label, path: [shellNavTarget(item)] })),
  );

  /** Sidebar groups the user closed; remembered per browser. */
  private readonly groupsKey = `${this.loginConfig.appName ?? 'app'}.sidebar.closedGroups`;
  protected readonly closedGroups = signal<ReadonlySet<string>>(this.readClosedGroups());

  protected toggleGroup(link: string): void {
    const next = new Set(this.closedGroups());
    if (next.has(link)) next.delete(link);
    else next.add(link);
    this.closedGroups.set(next);
    try {
      localStorage.setItem(this.groupsKey, JSON.stringify([...next]));
    } catch {
      // storage unavailable — just not remembered
    }
  }

  private readClosedGroups(): Set<string> {
    try {
      return new Set(JSON.parse(localStorage.getItem(this.groupsKey) ?? '[]'));
    } catch {
      return new Set();
    }
  }

  constructor() {
    // Remember the section so the empty path reopens it (`lastPageRedirect`).
    effect(() => {
      const link = this.activeItem()?.link;
      if (link) saveLastPage(link, this.loginConfig);
    });
    // Close the drawer after any navigation.
    effect(() => {
      this.url();
      this.drawerOpen.set(false);
    });
    effect(() => {
      try {
        localStorage.setItem(this.collapsedKey, String(this.collapsed()));
      } catch {
        // storage unavailable — just not remembered
      }
    });
  }

  protected reload(): void {
    location.reload();
  }

  protected async signOut(): Promise<void> {
    await this.auth.logout();
    await this.router.navigate(['/login']);
  }

  private readCollapsed(): boolean {
    try {
      return localStorage.getItem(this.collapsedKey) === 'true';
    } catch {
      return false;
    }
  }
}
