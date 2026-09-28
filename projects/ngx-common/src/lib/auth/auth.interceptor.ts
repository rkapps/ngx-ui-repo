import { HttpContextToken, HttpHandlerFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { from, switchMap } from 'rxjs';
import { AuthService } from './auth.service';

/** Apply to a request to skip the Authorization header entirely. */
export const SKIP_AUTH = new HttpContextToken<boolean>(() => false);

export function authInterceptor(req: HttpRequest<unknown>, next: HttpHandlerFn) {
  if (req.context.get(SKIP_AUTH)) {
    return next(req);
  }

  const auth = inject(AuthService);

  // AuthService.getIdToken() falls back to the last known-good token when a live refresh
  // fails (e.g. no network reaching Google after the tab sat idle) instead of failing the
  // whole request, so the backend's own 401 (if any) surfaces rather than a client-side dead end.
  return from(auth.getIdToken()).pipe(
    switchMap(token =>
      next(token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req)
    )
  );
}
