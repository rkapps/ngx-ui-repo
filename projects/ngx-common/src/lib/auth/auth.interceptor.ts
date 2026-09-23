import { HttpContextToken, HttpHandlerFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { catchError, from, of, switchMap } from 'rxjs';

/** Apply to a request to skip the Authorization header entirely. */
export const SKIP_AUTH = new HttpContextToken<boolean>(() => false);

export function authInterceptor(req: HttpRequest<unknown>, next: HttpHandlerFn) {
  if (req.context.get(SKIP_AUTH)) {
    return next(req);
  }

  const auth = inject(Auth);
  const user = auth.currentUser;

  if (!user) {
    return next(req);
  }

  // A background token refresh (e.g. no network reaching Google) rejects here even though
  // the user never signed out — fall back to sending unauthenticated rather than failing the
  // whole request, so the backend's own 401 (if any) surfaces instead of a client-side dead end.
  return from(user.getIdToken()).pipe(
    catchError(() => of(null)),
    switchMap(token =>
      next(token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req)
    )
  );
}
