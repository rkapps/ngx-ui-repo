import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../auth/auth.service';
import { ThemeService, type Theme } from '../../services/theme.service';

@Component({
  selector: 'app-user-menu',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    @if (open()) {
      <div class="fixed inset-0 z-40" (click)="open.set(false)"></div>
    }

    <div class="relative z-50">
      <button
        class="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full ring-2 ring-transparent transition hover:ring-primary-300 focus-visible:outline-none focus-visible:ring-primary-400"
        [attr.aria-expanded]="open()"
        aria-haspopup="true"
        (click)="open.set(!open())"
      >
        @if (auth.currentUser()?.picture) {
          <img
            [src]="auth.currentUser()!.picture"
            [alt]="auth.currentUser()?.name ?? 'User'"
            class="h-full w-full object-cover"
            referrerpolicy="no-referrer"
          />
        } @else {
          <span class="flex h-full w-full items-center justify-center bg-primary-600 text-xs font-bold text-white">
            {{ initials() }}
          </span>
        }
      </button>

      @if (open()) {
        <div
          class="absolute right-0 top-full mt-2 w-56 origin-top-right rounded-xl border border-border bg-white shadow-lg ring-1 ring-black/5"
          role="menu"
        >
          <div class="border-b border-border px-4 py-3">
            <p class="truncate text-sm font-semibold text-text">
              {{ auth.currentUser()?.name ?? 'User' }}
            </p>
            <p class="truncate text-xs text-text-muted">{{ auth.currentUser()?.email }}</p>
          </div>

          <div class="p-1.5">
            <div class="flex items-center justify-between gap-2 rounded-lg px-3 py-2">
              <div class="flex items-center gap-2.5">
                <lucide-icon name="palette" [size]="16" class="shrink-0 text-text-muted" />
                <span class="text-sm text-text">Theme</span>
              </div>
              <div class="flex items-center gap-1.5">
                @for (opt of themeOptions; track opt.value) {
                  <button
                    class="h-5 w-5 rounded-full ring-2 ring-offset-1 transition-all"
                    [style.background-color]="opt.color"
                    [class]="theme.theme() === opt.value
                      ? 'ring-primary-500'
                      : 'ring-transparent hover:ring-border'"
                    [attr.title]="opt.label"
                    [attr.aria-label]="opt.label"
                    (click)="setTheme(opt.value)"
                  ></button>
                }
              </div>
            </div>
          </div>

          <div class="border-t border-border p-1.5">
            <button
              class="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-danger-600 transition-colors hover:bg-danger-50"
              role="menuitem"
              (click)="signOut()"
            >
              <lucide-icon name="log-out" [size]="16" class="shrink-0" />
              Sign out
            </button>
          </div>
        </div>
      }
    </div>
  `,
})
export class UserMenuComponent {
  protected readonly auth = inject(AuthService);
  protected readonly theme = inject(ThemeService);
  private readonly router = inject(Router);

  protected readonly open = signal(false);

  protected readonly themeOptions: { value: Theme; label: string; color: string }[] = [
    { value: 'emerald', label: 'Emerald', color: 'oklch(0.45 0.19 264)' },
    { value: 'ocean',   label: 'Ocean',   color: 'oklch(0.44 0.15 230)' },
    { value: 'sunset',  label: 'Sunset',  color: 'oklch(0.5 0.17 35)'   },
  ];

  protected initials(): string {
    const name = this.auth.currentUser()?.name ?? this.auth.currentUser()?.email ?? 'U';
    return name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  }

  protected setTheme(t: Theme): void {
    this.theme.setTheme(t);
  }

  protected signOut(): void {
    this.open.set(false);
    this.auth.logout().then(() => this.router.navigate(['/login']));
  }
}
