import { HttpHandlerFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { from, of, switchMap } from 'rxjs';

export function authInterceptor(req: HttpRequest<unknown>, next: HttpHandlerFn) {
  const auth = inject(Auth);
  const user = auth.currentUser;

  if (!user) {
    return next(req);
  }

  return from(user.getIdToken()).pipe(
    switchMap((token) =>
      next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }))
    )
  );
}
