import { inject, InjectionToken } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';

/** Optional areas an app can switch off (sidebar item and routes). */
export interface AppFeatures {
  /** Projects (files and search). */
  projects: boolean;
}

const DEFAULT_FEATURES: AppFeatures = { projects: true };

/** Per-app feature switches; provide `{ provide: APP_FEATURES, useValue: { projects: false } }` to turn one off. */
export const APP_FEATURES = new InjectionToken<AppFeatures>('APP_FEATURES', {
  providedIn: 'root',
  factory: () => DEFAULT_FEATURES,
});

/** Route guard for a feature's pages: sends users to `redirectTo` when the app has it switched off. */
export function featureGuard(feature: keyof AppFeatures, redirectTo = '/home'): CanActivateFn {
  return () => (inject(APP_FEATURES)[feature] ? true : inject(Router).parseUrl(redirectTo));
}
