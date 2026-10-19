import { inject, Injectable, signal } from '@angular/core';
import {
  Auth,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendEmailVerification,
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
  /**
   * Email of a Firebase user who is signed in but hasn't verified their email yet, or null. Such a
   * user is kept logged out (`isLoggedIn` false) so the backend never sees an unverified token; the
   * login page shows the "check your email" step until `checkEmailVerified()` succeeds.
   */
  readonly pendingVerification = signal<string | null>(null);

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

    this.firebaseAuth.onAuthStateChanged(async (user) => {
      // A restored session can predate the user clicking the verification link (e.g. the link
      // opened this tab), so re-check an unverified user against Firebase before deciding.
      if (user && !user.emailVerified) await this._refreshVerified(user);
      clearTimeout(unblock);
      // Always update on the first callback (initial session load) or when Firebase
      // confirms a user. After init, ignore null callbacks — those are background
      // token-refresh failures (e.g., no network in dev), not intentional sign-outs.
      // Explicit sign-outs are handled synchronously in logout() before signOut() resolves.
      if (!this._initialized || user !== null) {
        this._initialized = true;
        this._setUser(user);
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

  /**
   * Signs in with email and password. Returns false when the email isn't verified yet: the user is
   * then pending verification and a fresh verification email has been sent.
   */
  async login(email: string, password: string): Promise<boolean> {
    const { user } = await signInWithEmailAndPassword(this.firebaseAuth, email, password);
    this._setUser(user);
    if (user.emailVerified) return true;
    await this.sendVerificationEmail();
    return false;
  }

  /** Creates the account and sends its verification email; the user is pending verification. */
  async register(email: string, password: string): Promise<void> {
    const { user } = await createUserWithEmailAndPassword(this.firebaseAuth, email, password);
    this._setUser(user);
    await this.sendVerificationEmail();
  }

  /** Sends (or re-sends) the verification email; its link returns the user to /login. */
  async sendVerificationEmail(): Promise<void> {
    const user = this.firebaseAuth.currentUser;
    if (!user) return;
    await sendEmailVerification(user, { url: `${location.origin}/login` });
  }

  /**
   * Re-checks the pending user with Firebase after they clicked the link. When verified, forces a
   * new ID token (the old one still says `email_verified: false`) and signs them in; returns
   * whether they're verified.
   */
  async checkEmailVerified(): Promise<boolean> {
    const user = this.firebaseAuth.currentUser;
    if (!user) return false;
    if (!user.emailVerified && !(await this._refreshVerified(user))) return false;
    this._setUser(user);
    return true;
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
    this.pendingVerification.set(null);
    this._initialized = false;
    this.cachedToken = null;
    await signOut(this.firebaseAuth);
  }

  /** Signed in only once the email is verified; an unverified user is pending verification. */
  private _setUser(user: User | null): void {
    const verified = !!user?.emailVerified;
    this.isLoggedIn.set(verified);
    this.currentUser.set(verified ? this._mapUser(user!) : null);
    this.pendingVerification.set(user && !verified ? user.email ?? '' : null);
  }

  /** Reloads the user from Firebase; if now verified, fetches a token that says so. */
  private async _refreshVerified(user: User): Promise<boolean> {
    try {
      await user.reload();
      if (!user.emailVerified) return false;
      this.cachedToken = await user.getIdToken(true);
      return true;
    } catch {
      return false;
    }
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
