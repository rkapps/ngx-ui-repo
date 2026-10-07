import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BreadcrumbBarComponent } from '../breadcrumbs/breadcrumb-bar.component';

/**
 * Frame for the user's Logs pages, matching the admin detail area: a breadcrumb bar ("Logs" plus
 * whatever the open page adds) over a gray, scrolling body. Padding mirrors the title bar.
 */
@Component({
  selector: 'app-logs-shell',
  standalone: true,
  // Fill the app's flex-column <main> so the gray body reaches the bottom.
  host: { class: 'flex min-h-0 flex-1 flex-col' },
  imports: [BreadcrumbBarComponent, RouterOutlet],
  template: `
    <app-breadcrumb-bar rootLabel="Logs" rootLink="/logs" />
    <div class="min-h-0 flex-1 overflow-y-auto bg-gray-50 px-2 md:px-2 lg:px-4 3xl:px-16 pt-2 pb-2 lg:pt-4 xl:pt-6">
      <router-outlet />
    </div>
  `,
})
export class LogsShellComponent {}
