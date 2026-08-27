import type { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize, timeout } from 'rxjs';
import { HttpLoadingService } from './http-loading.service';

// Generous enough for a Cloud Run cold start (image pull + init can take 10-20s worst case) but
// bounded — without this, a request that never resolves (hung connection, backend deadlock, an
// even-slower-than-usual cold start) leaves every `loading` signal fed by it — and the global
// progress bar — stuck on forever, since nothing ever calls their `error`/`complete` handler.
const REQUEST_TIMEOUT_MS = 45_000;

/** Register alongside other interceptors via `provideHttpClient(withInterceptors([...]))`. */
export const httpLoadingInterceptor: HttpInterceptorFn = (req, next) => {
  const loading = inject(HttpLoadingService);
  loading.start();
  return next(req).pipe(
    timeout(REQUEST_TIMEOUT_MS),
    finalize(() => loading.stop()),
  );
};
