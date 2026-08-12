import type { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize } from 'rxjs';
import { HttpLoadingService } from './http-loading.service';

/** Register alongside other interceptors via `provideHttpClient(withInterceptors([...]))`. */
export const httpLoadingInterceptor: HttpInterceptorFn = (req, next) => {
  const loading = inject(HttpLoadingService);
  loading.start();
  return next(req).pipe(finalize(() => loading.stop()));
};
