import { Component, DestroyRef, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationStart, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs';
import { LucideAngularModule } from 'lucide-angular';
import { TwangButtonComponent, TwangNavTabsComponent, type TwangNavTabItem } from 'ngx-twang-ui';
import { AuthService } from '../../auth/auth.service';
import { LOGIN_CONFIG } from '../../auth/login.config';
import { UserMenuComponent } from '../user-menu/user-menu.component';

@Component({
  selector: 'app-title-bar',
  standalone: true,
  imports: [LucideAngularModule, TwangButtonComponent, TwangNavTabsComponent, UserMenuComponent, RouterLink, RouterLinkActive],
  template: `
    <header class="relative z-10 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-white px-2 shadow-sm dark:border-gray-700 dark:bg-gray-900">
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
        <span class="text-base font-bold tracking-tight text-primary-600">{{ loginConfig.appName }}</span>
      </div>

      <!-- Desktop nav tabs -->
      @if (auth.isLoggedIn()) {
        <twang-nav-tabs
          [items]="navItems()"
          variant="segment"
          size="md"
          align="center"
          ariaLabel="Main navigation"
          class="hidden md:block max-w-sm"
        />
      }

      @if (auth.isLoggedIn()) {
        <app-user-menu />
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
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

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
