import { computed, effect, inject, type Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, type RedirectFunction, Router } from '@angular/router';
import { filter, map } from 'rxjs';

/** A routed section of the admin area (header button or sidebar option). */
export interface AdminSection {
  label: string;
  icon: string;
  /** Child route path under the parent route. */
  path: string;
}

/**
 * `redirectTo` for a parent route's empty child path: reopens the last selected section stored
 * under `key` (see `trackActiveSection`), falling back to the first section.
 */
export function rememberedSectionRedirect(key: string, sections: readonly AdminSection[]): RedirectFunction {
  return () => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(key);
    } catch {
      // storage unavailable (e.g. blocked) — use the default
    }
    return sections.some(s => s.path === stored) ? stored! : sections[0].path;
  };
}

/**
 * The section whose path appears in the current URL, persisted under `key` whenever it changes.
 * Must be called in an injection context.
 */
export function trackActiveSection(key: string, sections: readonly AdminSection[]): Signal<AdminSection | undefined> {
  const router = inject(Router);
  const url = toSignal(
    router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      map(() => router.url),
    ),
    { initialValue: router.url },
  );
  const active = computed(() => {
    const segments = url().split(/[?#]/)[0].split('/');
    return sections.find(s => segments.includes(s.path));
  });
  effect(() => {
    const section = active();
    if (!section) return;
    try {
      localStorage.setItem(key, section.path);
    } catch {
      // storage unavailable — selection just isn't remembered
    }
  });
  return active;
}
