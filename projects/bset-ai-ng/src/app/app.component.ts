import { Component, computed, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterOutlet } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService, LOGIN_CONFIG, TitleBarComponent, UserService } from 'ngx-common';
import type { TwangNavTabItem } from 'ngx-twang-ui';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, TitleBarComponent, LucideAngularModule],
  template: `
    <div class="flex h-screen flex-col overflow-hidden">
      <app-title-bar [navItems]="navItems()" />

      <main class="flex min-h-0 flex-1 flex-col overflow-hidden">
        @if (auth.ready()) {
          <router-outlet />
        } @else {
          <div class="flex flex-1 items-center justify-center">
            <lucide-icon name="loader-circle" [size]="28" class="animate-spin text-text-muted" />
          </div>
        }
      </main>

      <footer class="shrink-0 border-t border-border bg-white px-4 py-2 text-center text-xs text-text-muted">
        {{ loginConfig.appName }} &mdash; For internal use only
      </footer>
    </div>
  `,
})
export class AppComponent {
  protected readonly auth = inject(AuthService);
  protected readonly loginConfig = inject(LOGIN_CONFIG);
  // Eagerly constructed so the backend user is fetched from /auth/user on login.
  private readonly userService = inject(UserService);

  private readonly baseNavItems: readonly TwangNavTabItem[] = [
    { label: 'Home', icon: 'house', link: '/home' },
    { label: 'Agents', icon: 'bot', link: '/agents' },
    { label: 'Logs', icon: 'scroll-text', link: '/logs' },
  ];

  protected readonly navItems = computed<readonly TwangNavTabItem[]>(() =>
    this.userService.hasRole('Admin', 'SuperAdmin')
      ? [...this.baseNavItems, { label: 'Admin', icon: 'shield', link: '/admin' }]
      : this.baseNavItems
  );

  constructor() {
    const titleService = inject(Title);
    if (this.loginConfig.appName) {
      titleService.setTitle(this.loginConfig.appName);
    }
  }
}
