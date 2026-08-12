import { Injectable, computed, signal } from '@angular/core';

/**
 * Tracks in-flight HTTP requests app-wide (paired with `httpLoadingInterceptor`) so any UI —
 * e.g. TitleBarComponent's top progress bar — can show that *something* is happening, even
 * before an individual page's own `loading` signal resolves. Useful for backends with a cold
 * start (e.g. Cloud Run at min_instances=0), where the first request after idle can take
 * several seconds with otherwise no feedback at all.
 */
@Injectable({ providedIn: 'root' })
export class HttpLoadingService {
  private readonly count = signal(0);

  readonly active = computed(() => this.count() > 0);

  start(): void {
    this.count.update(n => n + 1);
  }

  stop(): void {
    this.count.update(n => Math.max(0, n - 1));
  }
}
