import { Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, NavigationStart, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter, map } from 'rxjs';
import { LucideAngularModule } from 'lucide-angular';
import { TwangButtonComponent, TwangNavTabsComponent, type TwangNavTabItem } from 'ngx-twang-ui';
import { AuthService } from '../../auth/auth.service';
import { LOGIN_CONFIG } from '../../auth/login.config';
import { HttpLoadingService } from '../../http/http-loading.service';
import { UserMenuComponent } from '../user-menu/user-menu.component';

@Component({
  selector: 'app-title-bar',
  standalone: true,
  imports: [LucideAngularModule, TwangButtonComponent, TwangNavTabsComponent, UserMenuComponent, RouterLink, RouterLinkActive],
  styles: [`
    @keyframes title-bar-progress {
      0% { transform: translateX(-100%); }
      55% { transform: translateX(60%); }
      100% { transform: translateX(220%); }
    }
    .title-bar-progress-bar {
      animation: title-bar-progress 1.3s ease-in-out infinite;
    }
  `],
  template: `
    <header class="relative z-10 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-white px-2 shadow-sm dark:border-gray-700 dark:bg-gray-900 md:px-2 lg:px-4 xl:px-16">
      <!-- Global "something is happening" indicator — backs off to individual pages' own
           loading spinners, but this fires the instant ANY request is in-flight, which matters
           most for a cold-starting backend (e.g. Cloud Run at min_instances=0) where the very
           first request can otherwise look like nothing happened for several seconds. -->
      @if (httpLoading.active()) {
        <div class="absolute inset-x-0 top-0 z-20 h-0.5 overflow-hidden bg-primary-100" aria-hidden="true">
          <div class="title-bar-progress-bar h-full w-1/3 rounded-full bg-primary-600"></div>
        </div>
      }
      <div class="flex shrink-0 items-center gap-2">
        <!-- Mobile hamburger button -->
        @if (auth.isLoggedIn()) {
          <button
            class="flex h-9 w-9 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-muted hover:text-text md:hidden"
            (click)="menuOpen.set(!menuOpen())"
            [attr.aria-expanded]="menuOpen()"
            aria-label="Toggle navigation menu"
          >
            <lucide-icon [name]="menuOpen() ? 'x' : 'menu'" [size]="20" />
          </button>
        }
        <!-- Consumers can override this by projecting their own markup: <svg logo>...</svg> (or
             <img logo src="...">) inside <app-title-bar>. Falls back to this default icon. -->
        <ng-content select="[logo]">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="20" height="20">
            <rect width="100" height="100" rx="22" fill="#1971c2"/>
            <line x1="50" y1="26" x2="50" y2="74" stroke="rgba(255,255,255,0.35)" stroke-width="5" stroke-linecap="round"/>
            <line x1="26" y1="50" x2="74" y2="50" stroke="rgba(255,255,255,0.35)" stroke-width="5" stroke-linecap="round"/>
            <line x1="30" y1="30" x2="70" y2="70" stroke="rgba(255,255,255,0.2)" stroke-width="4" stroke-linecap="round"/>
            <line x1="70" y1="30" x2="30" y2="70" stroke="rgba(255,255,255,0.2)" stroke-width="4" stroke-linecap="round"/>
            <circle cx="50" cy="20" r="8" fill="rgba(255,255,255,0.75)"/>
            <circle cx="50" cy="80" r="8" fill="rgba(255,255,255,0.75)"/>
            <circle cx="20" cy="50" r="8" fill="rgba(255,255,255,0.75)"/>
            <circle cx="80" cy="50" r="8" fill="rgba(255,255,255,0.75)"/>
            <circle cx="50" cy="50" r="14" fill="white"/>
          </svg>
        </ng-content>
        <span class="hidden text-base font-bold tracking-tight text-primary-600 md:inline">{{ loginConfig.appName }}</span>
        <span class="text-base font-bold tracking-tight text-primary-600 md:hidden">{{ activeNavLabel() || loginConfig.appName }}</span>
      </div>

      <!-- Desktop nav tabs -->
      @if (auth.isLoggedIn()) {
        <twang-nav-tabs
          [items]="navItems()"
          variant="segment"
          size="md"
          align="center"
          ariaLabel="Main navigation"
          class="hidden md:block min-w-0 flex-1"
        />
      }

      @if (auth.isLoggedIn()) {
        <div class="flex shrink-0 items-center gap-2">
          <twang-button
            routerLink="/accounts"
            variant="default"
            size="sm"
            icon="briefcase"
            label="Accounts"
            title="Accounts"
            class="[&_span]:hidden md:[&_span]:inline"
          />
          <app-user-menu />
        </div>
      } @else {
        <twang-button variant="primary" size="sm" icon="log-in" label="Sign in" (buttonClick)="goToLogin()" />
      }
    </header>

    <!-- Mobile menu overlay -->
    @if (menuOpen() && auth.isLoggedIn()) {
      <div
        class="fixed inset-0 z-40 md:hidden"
        (click)="menuOpen.set(false)"
        aria-hidden="true"
      ></div>
      <div class="fixed left-0 right-0 top-14 z-50 border-b border-border bg-white shadow-lg md:hidden">
        <nav class="flex flex-col gap-1 p-3" aria-label="Mobile navigation">
          @for (item of navItems(); track item.label) {
            <button
              routerLinkActive="bg-primary-50 !text-primary-700 !font-semibold"
              [routerLinkActiveOptions]="{ exact: item.exact ?? false }"
              [routerLink]="item.link"
              class="flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium text-left text-text-muted transition-colors hover:bg-surface-muted hover:text-text w-full"
              (click)="mobileNavClick()"
            >
              @if (item.icon) {
                <lucide-icon [name]="item.icon" [size]="18" aria-hidden="true" />
              }
              {{ item.label }}
            </button>
          }
        </nav>
      </div>
    }
  `,
})
export class TitleBarComponent {
  readonly navItems = input<readonly TwangNavTabItem[]>([]);

  protected readonly menuOpen = signal(false);
  protected readonly auth = inject(AuthService);
  protected readonly loginConfig = inject(LOGIN_CONFIG);
  protected readonly httpLoading = inject(HttpLoadingService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  // Mobile-only stand-in for the app name — the desktop segmented nav tabs already show which
  // section is active, but on mobile those tabs are hidden behind the hamburger menu.
  protected readonly activeNavLabel = computed(() => {
    const url = this.currentUrl();
    const match = this.navItems().find(item => {
      if (typeof item.link !== 'string') return false;
      return item.exact ? url === item.link : url === item.link || url.startsWith(item.link + '/');
    });
    return match?.label ?? '';
  });

  constructor() {
    this.router.events.pipe(
      filter(e => e instanceof NavigationStart),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(() => this.menuOpen.set(false));
  }

  protected mobileNavClick(): void {
    this.menuOpen.set(false);
  }

  goToLogin(): void {
    this.router.navigate(['/login']);
  }
}
