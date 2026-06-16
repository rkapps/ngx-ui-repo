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

  constructor() {
    this.firebaseAuth.onAuthStateChanged((user) => {
      this.isLoggedIn.set(!!user);
      this.currentUser.set(user ? this._mapUser(user) : null);
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
