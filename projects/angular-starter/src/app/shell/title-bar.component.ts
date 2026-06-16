import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { TwangButtonComponent, TwangNavTabsComponent, type TwangNavTabItem } from 'ngx-twang-ui';
import { AuthService, LOGIN_CONFIG, UserMenuComponent } from 'ngx-common';

@Component({
  selector: 'app-title-bar',
  standalone: true,
  imports: [LucideAngularModule, TwangButtonComponent, TwangNavTabsComponent, UserMenuComponent],
  template: `
    <header class="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-white px-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <!-- Logo -->
      <div class="flex shrink-0 items-center gap-2">
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

      <!-- Nav tabs — only when signed in -->
      @if (auth.isLoggedIn()) {
        <twang-nav-tabs
          [items]="navItems"
          variant="segment"
          size="sm"
          align="center"
          ariaLabel="Main navigation"
          class="max-w-xs"
        />
      }

      <!-- User menu or sign-in -->
      @if (auth.isLoggedIn()) {
        <app-user-menu />
      } @else {
        <twang-button variant="primary" size="sm" icon="log-in" label="Sign in" (buttonClick)="goToLogin()" />
      }
    </header>
  `,
})
export class TitleBarComponent {
  protected readonly auth = inject(AuthService);
  protected readonly loginConfig = inject(LOGIN_CONFIG);
  private readonly router = inject(Router);

  protected readonly navItems: readonly TwangNavTabItem[] = [
    { label: 'Home', icon: 'house', link: '/home' },
    { label: 'Agents', icon: 'bot', link: '/agents' },
    { label: 'Usage', icon: 'chart-bar', link: '/usage' },
  ];

  goToLogin(): void {
    this.router.navigate(['/login']);
  }
}
