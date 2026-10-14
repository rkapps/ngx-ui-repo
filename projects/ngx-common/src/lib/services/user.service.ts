import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, filter, map, Observable, of, shareReplay, startWith, switchMap } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { API_BASE_URL } from './api-url.token';
import type { Group } from './group.service';

/**
 * The backend's roles are `User` | `Admin`; super admin is the `is_super_admin` flag on
 * `CurrentUser`. `'SuperAdmin'` stays for the older single-tenant backend and for role checks —
 * `hasRole(..., 'SuperAdmin')` matches a user with the flag set.
 */
export type RoleType = 'User' | 'Admin' | 'SuperAdmin';

/** The user's role in one tenant. */
export interface Membership {
  id: string;
  tenant_id: string;
  uid: string;
  role: RoleType;
  created_by: string;
  created_at: string;
}

/** `GET /auth/user` (backend `UserResponse`): the signed-in user, with `role` for the active tenant. */
export interface CurrentUser {
  uid: string;
  email: string;
  is_super_admin: boolean;
  active_tenant: string;
  role: RoleType;
  memberships: Membership[];
}

/** Readable message for a failed `/auth/user`: the backend's text, else a generic one. */
function userErrorText(err: unknown): string {
  const e = err as { status?: number; error?: unknown };
  if (typeof e?.error === 'string' && e.error.trim()) return e.error;
  if (e?.status === 0) return "Can't reach the server. Check your connection and try again.";
  return 'Your account could not be loaded.';
}

/** Whether `user` has one of `roles`; `'SuperAdmin'` also matches the `is_super_admin` flag. */
export function userHasRole(user: Pick<CurrentUser, 'role' | 'is_super_admin'> | null | undefined, roles: readonly RoleType[]): boolean {
  if (!user) return false;
  return roles.includes(user.role) || (!!user.is_super_admin && roles.includes('SuperAdmin'));
}

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
  private readonly state$: Observable<{ loggedIn: boolean; user: CurrentUser | null | undefined; error: string | null }> = toObservable(
    this.auth.isLoggedIn,
  ).pipe(
    switchMap(loggedIn => {
      if (!loggedIn) return of({ loggedIn, user: null, error: null });
      return this.http.get<CurrentUser>(`${this.base}/auth/user`).pipe(
        map(user => ({ user, error: null as string | null })),
        catchError(err => {
          console.error('Failed to load user', err);
          return of({ user: null, error: userErrorText(err) });
        }),
        startWith({ user: undefined, error: null }),
        map(s => ({ loggedIn, ...s })),
      );
    }),
    shareReplay(1),
  );

  /** States for the current login status, once the fetch has resolved (see `user$`). */
  private readonly resolved$ = this.state$.pipe(filter(s => s.loggedIn === this.auth.isLoggedIn() && s.user !== undefined));

  /**
   * Emits the resolved user (or null) for the current login status, skipping in-flight and stale
   * states — so `user$.pipe(first())` in a guard waits for the real answer.
   */
  readonly user$ = this.resolved$.pipe(map(s => s.user as CurrentUser | null));

  readonly user = toSignal(this.user$, { initialValue: null });

  /**
   * Why `/auth/user` failed for the signed-in user (backend message when it sent one), or null —
   * also null while signed out or loading. `user()` is null when this is set.
   */
  readonly loadError = toSignal(this.resolved$.pipe(map(s => s.error)), { initialValue: null });

  /** `is_super_admin` (or the older backend's `SuperAdmin` role). */
  readonly isSuperAdmin = computed(() => userHasRole(this.user(), ['SuperAdmin']));

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
    return userHasRole(this.user(), roles);
  }
}
