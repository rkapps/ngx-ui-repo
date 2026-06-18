import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from 'ngx-common';
import { TitleBarComponent } from './shell/title-bar.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, TitleBarComponent, LucideAngularModule],
  template: `
    <div class="flex h-screen flex-col overflow-hidden">
      <app-title-bar />

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
        Rustic AI &mdash; For internal use only
      </footer>
    </div>
  `,
})
export class AppComponent {
  protected readonly auth = inject(AuthService);
}
