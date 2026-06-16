import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { first, map } from 'rxjs';
import { AuthService } from './auth.service';

/** Protects routes that require authentication. Waits for Firebase to resolve the session. */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.ready$.pipe(
    first(),
    map(() => auth.isLoggedIn() ? true : router.createUrlTree(['/login'])),
  );
};

/** Redirects already-authenticated users away from the login page. */
export const noAuthGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.ready$.pipe(
    first(),
    map(() => auth.isLoggedIn() ? router.createUrlTree(['/agents']) : true),
  );
};
