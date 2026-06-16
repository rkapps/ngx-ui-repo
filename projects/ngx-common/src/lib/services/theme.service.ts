import { Injectable, signal } from '@angular/core';

export type Theme = 'emerald' | 'ocean' | 'sunset';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>(this._stored());

  constructor() {
    this._apply(this.theme());
  }

  setTheme(t: Theme): void {
    this.theme.set(t);
    localStorage.setItem('theme', t);
    this._apply(t);
  }

  private _apply(t: Theme): void {
    document.documentElement.setAttribute('data-theme', t);
  }

  private _stored(): Theme {
    const v = localStorage.getItem('theme');
    return v === 'emerald' || v === 'ocean' || v === 'sunset' ? v : 'ocean';
  }
}
