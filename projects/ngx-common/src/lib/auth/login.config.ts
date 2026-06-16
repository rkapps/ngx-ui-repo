import { InjectionToken } from '@angular/core';

export interface LoginConfig {
  appName?: string;
  enableEmail?: boolean;
  enableGoogle?: boolean;
  redirectTo?: string;
}

export const LOGIN_CONFIG = new InjectionToken<LoginConfig>('LOGIN_CONFIG', {
  providedIn: 'root',
  factory: () => ({ appName: 'App', enableEmail: true, enableGoogle: true, redirectTo: '/' }),
});
