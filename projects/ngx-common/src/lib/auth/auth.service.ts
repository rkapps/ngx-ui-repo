import { inject, Injectable, signal } from '@angular/core';
import {
  Auth,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  User,
} from '@angular/fire/auth';
import { ReplaySubject } from 'rxjs';

export interface AuthUser {
  email: string;
  name?: string;
  picture?: string;
  provider: 'password' | 'google';
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly firebaseAuth = inject(Auth);
  private readonly _ready = new ReplaySubject<void>(1);

  /** Emits once Firebase has resolved the initial auth state from its persisted session. */
  readonly ready$ = this._ready.asObservable();
  readonly ready = signal(false);
  readonly isLoggedIn = signal(false);
  readonly currentUser = signal<AuthUser | null>(null);

  private _initialized = false;

  constructor() {
    // Safety valve: if Firebase hangs connecting to Google (e.g., no network in dev),
    // force ready after 8s so the loading spinner doesn't persist indefinitely.
    const unblock = setTimeout(() => {
      if (!this.ready()) {
        this.ready.set(true);
        this._ready.next();
      }
    }, 8000);

    this.firebaseAuth.onAuthStateChanged((user) => {
      clearTimeout(unblock);
      // Always update on the first callback (initial session load) or when Firebase
      // confirms a user. After init, ignore null callbacks — those are background
      // token-refresh failures (e.g., no network in dev), not intentional sign-outs.
      // Explicit sign-outs are handled synchronously in logout() before signOut() resolves.
      if (!this._initialized || user !== null) {
        this._initialized = true;
        this.isLoggedIn.set(!!user);
        this.currentUser.set(user ? this._mapUser(user) : null);
      }
      this.ready.set(true);
      this._ready.next();
    });
  }

  async login(email: string, password: string): Promise<void> {
    await signInWithEmailAndPassword(this.firebaseAuth, email, password);
  }

  async loginWithGoogle(): Promise<void> {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(this.firebaseAuth, provider);
  }

  async logout(): Promise<void> {
    // Clear state before signOut so the ensuing onAuthStateChanged(null) is treated
    // as an intentional logout rather than a background token-refresh failure.
    this.isLoggedIn.set(false);
    this.currentUser.set(null);
    this._initialized = false;
    await signOut(this.firebaseAuth);
  }

  private _mapUser(user: User): AuthUser {
    const isGoogle = user.providerData.some((p) => p.providerId === 'google.com');
    return {
      email: user.email ?? '',
      name: user.displayName ?? undefined,
      picture: user.photoURL ?? undefined,
      provider: isGoogle ? 'google' : 'password',
    };
  }
}
