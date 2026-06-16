import { CommonModule } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';

import type {
  TwangNavTabItem,
  TwangNavTabsAlign,
  TwangNavTabsSize,
  TwangNavTabsVariant,
} from './twang-nav-tabs.models';

/**
 * Horizontal nav links: shared styles for app shell (`pill`), section strip (`segment`),
 * and underlined tabs with optional icons (`underline`). Sizes align loosely with `twang-button`.
 */
@Component({
  selector: 'twang-nav-tabs',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, LucideAngularModule],
  templateUrl: './twang-nav-tabs.html',
  host: { class: 'block w-full min-w-0' },
})
export class TwangNavTabsComponent {
  readonly variant = input<TwangNavTabsVariant>('segment');
  readonly size = input<TwangNavTabsSize>('md');
  readonly align = input<TwangNavTabsAlign>('center');
  readonly ariaLabel = input('');
  /** Optional `id` on the inner `<nav>` (e.g. `#markets-section-nav` in DevTools). */
  readonly navId = input('');
  readonly items = input<readonly TwangNavTabItem[]>([]);

  protected readonly navClasses = computed(() => {
    const v = this.variant();
    const s = this.size();
    const a = this.align();
    const justify =
      a === 'start' ? 'justify-start' : a === 'end' ? 'justify-end' : 'justify-center';

    if (v === 'pill') {
      const gap =
        s === 'xs' ? 'gap-1' : s === 'sm' ? 'gap-2.5' : s === 'lg' ? 'gap-3' : 'gap-2';
      return `flex w-full min-w-0 flex-wrap items-center ${justify} ${gap}`;
    }
    if (v === 'segment') {
      const itemGap = s === 'sm' ? 'gap-1.5' : 'gap-0.5';
      return `flex w-full min-w-0 max-w-full flex-wrap items-center ${justify} ${itemGap} rounded-lg p-1`;
    }

    const base = 'flex w-full min-w-0 flex-wrap items-center ' + justify + ' ';
    const gap =
      s === 'xs'
        ? 'gap-2 sm:gap-3'
        : s === 'sm'
          ? 'gap-4 sm:gap-5'
        : s === 'lg'
            ? 'gap-6 sm:gap-8 lg:gap-12'
            : 'gap-4 sm:gap-6 lg:gap-10';
    return base + gap;
  });

  protected readonly linkInactiveClasses = computed(() => {
    const v = this.variant();
    const s = this.size();
    const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/35 focus-visible:ring-offset-2';

    if (v === 'pill') {
      const sz =
        s === 'xs'
          ? 'rounded-full px-2.5 py-1 text-[11px] font-medium'
          : s === 'sm'
            ? 'rounded-full px-3 py-1.5 text-xs font-medium'
            : s === 'lg'
              ? 'rounded-full px-5 py-2.5 text-base font-medium'
              : 'rounded-full px-4 py-2 text-sm font-medium';
      return `inline-flex items-center gap-1 ${sz} text-text-muted transition hover:bg-surface-muted hover:text-text ${focus}`;
    }
    if (v === 'segment') {
      const sz =
        s === 'xs'
          ? 'rounded-md px-2 py-0.5 text-[11px] font-medium sm:px-2.5'
          : s === 'sm'
            ? 'rounded-md px-2.5 py-1 text-xs font-medium sm:px-3'
            : s === 'lg'
              ? 'rounded-md px-4 py-2 text-base font-medium sm:px-5'
              : 'rounded-md px-3 py-1.5 text-sm font-medium sm:px-4';
      return `inline-flex items-center gap-0.5 ${sz} text-text-muted transition-all hover:text-text ${focus}`;
    }
    const sz =
      s === 'xs'
        ? 'py-0.5 text-[11px] font-semibold'
        : s === 'sm'
          ? 'py-0.5 text-xs font-semibold'
          : s === 'lg'
            ? 'py-1 text-base font-semibold'
            : 'py-1 text-sm font-semibold';
    return `flex items-center gap-0.5 border-b-[3px] border-transparent ${sz} text-text-muted transition hover:text-primary-600 sm:gap-1 ${focus}`;
  });

  protected readonly routerLinkActiveClass = computed(() => {
    const v = this.variant();
    if (v === 'pill') {
      return 'bg-primary-50 text-primary-900 ring-1 ring-primary-200';
    }
    if (v === 'segment') {
      return '!font-bold !text-accent-600';
    }
    return 'border-primary-600 !font-bold !text-primary-600';
  });

  protected readonly iconSize = computed(() => {
    const s = this.size();
    if (s === 'xs') return 14;
    if (s === 'sm') return 14;
    if (s === 'lg') return 20;
    return 16;
  });

  protected trackKey(item: TwangNavTabItem, index: number): string {
    const link = typeof item.link === 'string' ? item.link : JSON.stringify(item.link);
    return `${index}:${item.label}:${link}`;
  }
}
