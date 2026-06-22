import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { FirebaseError } from '@angular/fire/app';
import { LucideAngularModule } from 'lucide-angular';
import { TwangButtonComponent, TwangInputComponent } from 'ngx-twang-ui';
import { AuthService } from '../../auth/auth.service';
import { LOGIN_CONFIG } from '../../auth/login.config';

const FIREBASE_ERRORS: Record<string, string> = {
  'auth/invalid-credential': 'Invalid email or password.',
  'auth/invalid-email': 'Invalid email address.',
  'auth/user-not-found': 'No account found with this email.',
  'auth/wrong-password': 'Incorrect password.',
  'auth/too-many-requests': 'Too many failed attempts. Try again later.',
  'auth/popup-closed-by-user': '',
  'auth/cancelled-popup-request': '',
};

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, TwangButtonComponent, TwangInputComponent],
  host: { class: 'flex flex-1 min-h-0' },
  template: `
    <div class="flex flex-1 items-center justify-center bg-surface-muted px-4 py-12">
      <div class="w-full max-w-sm rounded-2xl border border-border bg-white p-8 shadow-md">

        <!-- Brand -->
        <div class="mb-6 flex flex-col items-center gap-2">
          <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-600 text-xl font-bold text-white shadow-sm">
            {{ config.appName?.[0]?.toUpperCase() ?? 'A' }}
          </div>
          <h1 class="text-xl font-bold text-text">Sign in to {{ config.appName ?? 'App' }}</h1>
          <p class="text-xs text-text-muted">Enter your credentials to continue</p>
        </div>

        <!-- Google sign-in -->
        @if (config.enableGoogle !== false) {
          <div class="mb-5 flex flex-col gap-3">
            <twang-button variant="muted" size="md" [fluid]="true" [loading]="googleLoading()" (buttonClick)="signInWithGoogle()">
              <svg width="18" height="18" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path fill="#4285F4" d="M46.145 24.502c0-1.566-.14-3.073-.402-4.52H24v8.556h12.435c-.536 2.888-2.164 5.336-4.612 6.979v5.797h7.47c4.371-4.025 6.852-9.951 6.852-16.812z"/>
                <path fill="#34A853" d="M24 47c6.27 0 11.532-2.081 15.377-5.63l-7.47-5.797c-2.082 1.395-4.741 2.22-7.907 2.22-6.08 0-11.226-4.106-13.067-9.629H3.172v5.989C6.999 41.98 14.95 47 24 47z"/>
                <path fill="#FBBC05" d="M10.933 28.164A14.915 14.915 0 0 1 10.063 24c0-1.45.249-2.858.87-4.164v-5.989H3.172A22.996 22.996 0 0 0 1 24c0 3.71.89 7.22 2.172 10.153l7.761-5.989z"/>
                <path fill="#EA4335" d="M24 9.207c3.424 0 6.494 1.175 8.91 3.48l6.68-6.68C35.525 2.218 30.266 0 24 0 14.95 0 6.999 5.02 3.172 13.847l7.761 5.989C12.774 13.313 17.92 9.207 24 9.207z"/>
              </svg>
              <span>Continue with Google</span>
            </twang-button>

            @if (config.enableEmail !== false) {
              <div class="flex items-center gap-3">
                <hr class="flex-1 border-border" />
                <span class="text-xs text-text-muted">or</span>
                <hr class="flex-1 border-border" />
              </div>
            }
          </div>
        }

        <!-- Error -->
        @if (error()) {
          <div class="mb-4 flex items-center gap-2 rounded-lg border border-danger-600 bg-danger-50 px-3 py-2 text-sm text-danger-600">
            <lucide-icon name="shield-alert" [size]="16" class="shrink-0" />
            <span>{{ error() }}</span>
          </div>
        }

        <!-- Email / password -->
        @if (config.enableEmail !== false) {
          @if (resetSent()) {
            <div class="flex flex-col items-center gap-3 text-center">
              <lucide-icon name="circle-check" [size]="32" class="text-success-600" />
              <p class="text-sm text-text">If <strong>{{ email() }}</strong> is registered, a reset link is on its way.</p>
              <p class="text-xs text-text-muted">Check your inbox and follow the link to set a new password.</p>
              <button class="text-xs text-primary-600 underline" (click)="resetSent.set(false)">Back to sign in</button>
            </div>
          } @else if (forgotMode()) {
            <form (ngSubmit)="sendReset()" class="flex flex-col gap-4">
              <twang-input label="Email" type="email" placeholder="you@example.com"
                [ngModel]="email()" (ngModelChange)="email.set($event)" name="email" />
              <twang-button type="submit" variant="primary" size="md" icon="mail" label="Send reset link"
                [fluid]="true" [loading]="loading()" />
              <button type="button" class="text-xs text-text-muted underline text-center"
                (click)="forgotMode.set(false); error.set('')">Back to sign in</button>
            </form>
          } @else {
            <form (ngSubmit)="submit()" class="flex flex-col gap-4">
              <twang-input label="Email" type="email" placeholder="you@example.com"
                [ngModel]="email()" (ngModelChange)="email.set($event)" name="email" />
              <twang-input label="Password" type="password" placeholder="••••••••"
                [ngModel]="password()" (ngModelChange)="password.set($event)" name="password" />
              <twang-button type="submit" variant="primary" size="md" icon="log-in" label="Sign in"
                [fluid]="true" [loading]="loading()" />
              <button type="button" class="text-xs text-text-muted underline text-center"
                (click)="forgotMode.set(true); error.set('')">Forgot password?</button>
            </form>
          }
        }

      </div>
    </div>
  `,
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly config = inject(LOGIN_CONFIG);

  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly loading = signal(false);
  protected readonly googleLoading = signal(false);
  protected readonly error = signal('');
  protected readonly forgotMode = signal(false);
  protected readonly resetSent = signal(false);

  protected async submit(): Promise<void> {
    this.error.set('');
    if (!this.email() || !this.password()) {
      this.error.set('Please enter your email and password.');
      return;
    }
    this.loading.set(true);
    try {
      await this.auth.login(this.email(), this.password());
      this.router.navigate([this.config.redirectTo ?? '/']);
    } catch (err) {
      this.error.set(this._errorMessage(err));
    } finally {
      this.loading.set(false);
    }
  }

  protected async sendReset(): Promise<void> {
    this.error.set('');
    if (!this.email()) {
      this.error.set('Please enter your email address.');
      return;
    }
    this.loading.set(true);
    try {
      await this.auth.sendPasswordReset(this.email());
    } catch (err) {
      // Swallow user-not-found so we don't reveal whether the account exists
      if (!(err instanceof FirebaseError && err.code === 'auth/user-not-found')) {
        this.error.set(this._errorMessage(err));
        return;
      }
    } finally {
      this.loading.set(false);
    }
    this.resetSent.set(true);
  }

  protected async signInWithGoogle(): Promise<void> {
    this.error.set('');
    this.googleLoading.set(true);
    try {
      await this.auth.loginWithGoogle();
      this.router.navigate([this.config.redirectTo ?? '/']);
    } catch (err) {
      this.error.set(this._errorMessage(err));
    } finally {
      this.googleLoading.set(false);
    }
  }

  private _errorMessage(err: unknown): string {
    if (err instanceof FirebaseError) {
      return FIREBASE_ERRORS[err.code] ?? 'Something went wrong. Please try again.';
    }
    return 'Something went wrong. Please try again.';
  }
}
