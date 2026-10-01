import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, filter, map, Observable, of, shareReplay, startWith, switchMap } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { API_BASE_URL } from './api-url.token';
import type { Group } from './group.service';

export type RoleType = 'User' | 'Admin' | 'SuperAdmin';

export interface User {
  id: string;
  uid: string;
  email: string;
  role: RoleType;
  created_at: string;
  updated_at: string;
}

/** `GET /admin/users` row: the user with their group memberships resolved to groups. */
export interface UserResponse extends User {
  groups: Group[];
}

/**
 * Backend user record. Fetched from `/auth/user` each time the Firebase session becomes
 * logged-in (fresh login or a persisted session restored on reload) — the backend creates
 * the record on first call — and cleared on logout.
 */
@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);
  private readonly auth = inject(AuthService);

  // Each state is tagged with the login status it was computed for. `toObservable` delivers
  // `isLoggedIn` changes asynchronously, so right after Firebase restores a session (on reload)
  // the replayed state can still be the stale logged-out one; `user$` skips anything that doesn't
  // match the current status. `user` is `undefined` while a fetch is in flight, `null` when
  // logged out or the fetch failed.
  private readonly state$: Observable<{ loggedIn: boolean; user: User | null | undefined }> = toObservable(
    this.auth.isLoggedIn,
  ).pipe(
    switchMap(loggedIn => {
      if (!loggedIn) return of({ loggedIn, user: null });
      return this.http.get<User>(`${this.base}/auth/user`).pipe(
        catchError(err => {
          console.error('Failed to load user', err);
          return of(null);
        }),
        startWith(undefined),
        map(user => ({ loggedIn, user })),
      );
    }),
    shareReplay(1),
  );

  /**
   * Emits the resolved user (or null) for the current login status, skipping in-flight and stale
   * states — so `user$.pipe(first())` in a guard waits for the real answer.
   */
  readonly user$ = this.state$.pipe(
    filter(s => s.loggedIn === this.auth.isLoggedIn() && s.user !== undefined),
    map(s => s.user as User | null),
  );

  readonly user = toSignal(this.user$, { initialValue: null });

  /** All users with their groups; admin-only on the backend (403 otherwise). */
  getAllUsers(): Observable<UserResponse[]> {
    return this.http.get<UserResponse[]>(`${this.base}/admin/users`);
  }

  /**
   * Changes a user's role. The backend enforces who may grant what (403 otherwise): Admins can
   * grant User/Admin, SuperAdmins anything, and nobody can demote themselves out of admin.
   */
  updateUserRole(uid: string, role: RoleType): Observable<User> {
    return this.http.patch<User>(`${this.base}/admin/users/${encodeURIComponent(uid)}`, { role });
  }

  hasRole(...roles: RoleType[]): boolean {
    const user = this.user();
    return !!user && roles.includes(user.role);
  }
}
