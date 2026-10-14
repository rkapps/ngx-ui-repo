import { Component, inject, input, output } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { HttpLoadingService } from '../../http/http-loading.service';
import { UserMenuComponent } from '../user-menu/user-menu.component';

/**
 * Title bar of the app shell (right of the sidebar): a menu button on small screens, the current
 * section's title, then app actions (`[actions]` content) and the user menu on the right. A thin
 * progress bar runs along the top while any request is in flight. Unlike `app-title-bar`, it has
 * no nav — that's in the sidebar.
 */
@Component({
  selector: 'app-shell-title-bar',
  standalone: true,
  imports: [LucideAngularModule, UserMenuComponent],
  styles: [`
    @keyframes shell-title-bar-progress {
      0% { transform: translateX(-100%); }
      55% { transform: translateX(60%); }
      100% { transform: translateX(220%); }
    }
    .shell-title-bar-progress { animation: shell-title-bar-progress 1.3s ease-in-out infinite; }
  `],
  template: `
    <!-- z-30: above page content's sticky table cells (z-20), so the user menu drops over them. -->
    <header class="relative z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-white px-3 md:px-4 lg:px-6 xl:px-8 3xl:px-16">
      @if (httpLoading.active()) {
        <div class="absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-primary-100" aria-hidden="true">
          <div class="shell-title-bar-progress h-full w-1/3 rounded-full bg-primary-600"></div>
        </div>
      }
      <button
        type="button"
        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-surface-muted hover:text-text md:hidden"
        aria-label="Open navigation"
        (click)="menuClick.emit()"
      >
        <lucide-icon name="menu" [size]="20" />
      </button>
      <span class="min-w-0 truncate text-base font-semibold tracking-tight text-text">{{ heading() }}</span>

      <div class="ml-auto flex shrink-0 items-center gap-2">
        <ng-content select="[actions]" />
        <app-user-menu [settingsLink]="settingsLink()" />
      </div>
    </header>
  `,
})
export class ShellTitleBarComponent {
  /** Usually the active section's label. */
  readonly heading = input('');
  /** Forwarded to `<app-user-menu>`: its Settings item only renders when set. */
  readonly settingsLink = input<string | null>(null);
  /** Small screens: open the sidebar drawer. */
  readonly menuClick = output<void>();

  protected readonly httpLoading = inject(HttpLoadingService);
}
