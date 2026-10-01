import { inject } from '@angular/core';
import { type RedirectFunction, Router } from '@angular/router';
import { LOGIN_CONFIG, type LoginConfig } from './login.config';

const FALLBACK_PAGE = '/agents';

// Scoped per app so apps served from the same origin (e.g. localhost in dev) don't share it.
function storageKey(config: LoginConfig): string {
  return `${config.appName ?? 'app'}.lastPage`;
}

/** Remembers the selected title-bar tab (its link, e.g. `/chats`) so the app can reopen it. */
export function saveLastPage(link: string, config: LoginConfig = inject(LOGIN_CONFIG)): void {
  try {
    localStorage.setItem(storageKey(config), link);
  } catch {
    // storage unavailable — the tab just isn't remembered
  }
}

/**
 * Where to send a signed-in user who hasn't asked for a specific page: the last selected tab,
 * else `LOGIN_CONFIG.redirectTo`. Pass `config` and `router` when calling outside an injection
 * context.
 */
export function landingPage(config: LoginConfig = inject(LOGIN_CONFIG), router: Router = inject(Router)): string {
  // Only a top-level route this app actually has — anything else ('/', '/login', a tab saved by
  // an older build) would bounce through the empty-path or '**' redirects, possibly in a loop.
  const isPage = (p: string | null | undefined): p is string => {
    const segment = p?.startsWith('/') ? p.slice(1).split('/')[0] : '';
    return !!segment && segment !== 'login' && router.config.some(r => r.path === segment);
  };

  let stored: string | null = null;
  try {
    stored = localStorage.getItem(storageKey(config));
  } catch {
    // storage unavailable — use the configured default
  }
  if (isPage(stored)) return stored;
  return isPage(config.redirectTo) ? config.redirectTo : FALLBACK_PAGE;
}

/** `redirectTo` for the app's empty path: reopens the last selected tab. */
export const lastPageRedirect: RedirectFunction = () => landingPage();
