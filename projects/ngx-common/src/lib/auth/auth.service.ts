import { inject, Injectable, signal } from '@angular/core';
import {
  Auth,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendPasswordResetEmail,
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
  // Last successfully-issued ID token. A background refresh can reject (e.g. a transient
  // network blip while the tab was idle) and Firebase then clears its own `currentUser`,
  // leaving nothing to call `getIdToken()` on until the page reloads. Falling back to this
  // keeps requests authenticated with the still-valid token instead of 401ing until reload.
  private cachedToken: string | null = null;

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

    // Fires on every successful token issuance/rotation — captures a fresh token to fall
    // back on independently of the (deliberately more conservative) sign-in/out signals above.
    this.firebaseAuth.onIdTokenChanged((user) => {
      if (user) user.getIdToken().then(token => { this.cachedToken = token; }).catch(() => {});
    });
  }

  /** Current ID token, falling back to the last known-good one if a live refresh fails. */
  async getIdToken(): Promise<string | null> {
    const user = this.firebaseAuth.currentUser;
    if (user) {
      try {
        const token = await user.getIdToken();
        this.cachedToken = token;
        return token;
      } catch {
        // fall through to the cached token below
      }
    }
    return this.cachedToken;
  }

  async login(email: string, password: string): Promise<void> {
    await signInWithEmailAndPassword(this.firebaseAuth, email, password);
  }

  async register(email: string, password: string): Promise<void> {
    await createUserWithEmailAndPassword(this.firebaseAuth, email, password);
  }

  async sendPasswordReset(email: string): Promise<void> {
    await sendPasswordResetEmail(this.firebaseAuth, email);
  }

  async loginWithGoogle(): Promise<void> {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    await signInWithPopup(this.firebaseAuth, provider);
  }

  async logout(): Promise<void> {
    // Clear state before signOut so the ensuing onAuthStateChanged(null) is treated
    // as an intentional logout rather than a background token-refresh failure.
    this.isLoggedIn.set(false);
    this.currentUser.set(null);
    this._initialized = false;
    this.cachedToken = null;
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
