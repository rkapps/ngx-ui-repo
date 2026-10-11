import { Injectable, signal, type TemplateRef } from '@angular/core';
import type { Params } from '@angular/router';

/** A breadcrumb after the bar's root crumb. Without `path` it renders as plain text. */
export interface PageCrumb {
  label: string;
  /** Absolute router commands, e.g. `['/admin', 'logs', 'execution', id, 3]`. */
  path?: unknown[];
  queryParams?: Params;
}

/**
 * Extra breadcrumbs (and optional header actions) for the page header above the current page — the
 * admin shell's, or the user Logs page's — after the host's own crumbs. A page sets them while it's
 * open and clears them when it's destroyed.
 */
@Injectable({ providedIn: 'root' })
export class PageBreadcrumbs {
  readonly crumbs = signal<PageCrumb[]>([]);
  /** Optional buttons for the right side of the page header; a page sets it while open. */
  readonly actions = signal<TemplateRef<unknown> | null>(null);

  set(crumbs: PageCrumb[]): void {
    this.crumbs.set(crumbs);
  }

  clear(): void {
    this.crumbs.set([]);
    this.actions.set(null);
  }
}
