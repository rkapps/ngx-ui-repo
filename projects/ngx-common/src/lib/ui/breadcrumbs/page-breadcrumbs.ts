import { Injectable, signal } from '@angular/core';
import type { Params } from '@angular/router';

/** A breadcrumb after the bar's root crumb. Without `path` it renders as plain text. */
export interface PageCrumb {
  label: string;
  /** Absolute router commands, e.g. `['/admin', 'logs', 'execution', id, 3]`. */
  path?: unknown[];
  queryParams?: Params;
}

/**
 * Extra breadcrumbs for the `app-breadcrumb-bar` above the current page (the admin sub header, or
 * the user Logs header), after its root crumb (e.g. "Logs"). A page sets them while it's open and
 * clears them when it's destroyed.
 */
@Injectable({ providedIn: 'root' })
export class PageBreadcrumbs {
  readonly crumbs = signal<PageCrumb[]>([]);

  set(crumbs: PageCrumb[]): void {
    this.crumbs.set(crumbs);
  }

  clear(): void {
    this.crumbs.set([]);
  }
}
