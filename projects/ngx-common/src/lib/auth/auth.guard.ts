import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { first, map, of, switchMap } from 'rxjs';
import { type RoleType, UserService } from '../services/user.service';
import { AuthService } from './auth.service';
import { landingPage } from './landing-page';

/** Protects routes that require authentication. Waits for Firebase to resolve the session. */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.ready$.pipe(
    first(),
    map(() => auth.isLoggedIn() ? true : router.createUrlTree(['/login'])),
  );
};

/** Redirects already-authenticated users away from the login page, to the last selected tab. */
export const noAuthGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const landing = landingPage();
  return auth.ready$.pipe(
    first(),
    map(() => auth.isLoggedIn() ? router.parseUrl(landing) : true),
  );
};

/**
 * Protects routes that require one of the given backend roles. Waits for Firebase and then the
 * `/auth/user` fetch; logged-out users go to /login, users without the role to /agents.
 */
export function roleGuard(...roles: RoleType[]): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const users = inject(UserService);
    const router = inject(Router);
    return auth.ready$.pipe(
      first(),
      switchMap(() => auth.isLoggedIn() ? users.user$.pipe(first()) : of(null)),
      map(user => {
        if (!auth.isLoggedIn()) return router.createUrlTree(['/login']);
        return user && roles.includes(user.role) ? true : router.createUrlTree(['/agents']);
      }),
    );
  };
}
