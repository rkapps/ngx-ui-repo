import { NgTemplateOutlet } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BreadcrumbBarComponent } from '../breadcrumbs/breadcrumb-bar.component';
import { PageBreadcrumbs } from '../breadcrumbs/page-breadcrumbs';

/**
 * Frame for the user's Logs pages, matching the admin detail area: a breadcrumb bar ("Logs" plus
 * whatever the open page adds) over a gray, scrolling body. Padding mirrors the title bar.
 */
@Component({
  selector: 'app-logs-shell',
  standalone: true,
  // Fill the app's flex-column <main> so the gray body reaches the bottom.
  host: { class: 'flex min-h-0 flex-1 flex-col' },
  imports: [BreadcrumbBarComponent, NgTemplateOutlet, RouterOutlet],
  template: `
    <header class="flex shrink-0 items-center gap-2 border-b border-border bg-white px-2 md:px-2 lg:px-4 3xl:px-16 py-3">
      <app-breadcrumb-bar class="flex-1" [base]="base" />
      @if (actions(); as tpl) {
        <div class="ml-auto flex shrink-0 items-center gap-2">
          <ng-container *ngTemplateOutlet="tpl" />
        </div>
      }
    </header>
    <!-- Flex column so a page can fill the height (e.g. a three-panel layout with "fill"). -->
    <div class="flex min-h-0 flex-1 flex-col overflow-y-auto bg-gray-50 px-2 md:px-2 lg:px-4 3xl:px-16 pt-2 pb-2 lg:pt-4 xl:pt-6">
      <router-outlet />
    </div>
  `,
})
export class LogsShellComponent {
  protected readonly base = [{ label: 'Logs', path: ['/logs'] }];
  protected readonly actions = inject(PageBreadcrumbs).actions;
}
