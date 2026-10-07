import type { Route, Routes } from '@angular/router';
import { authGuard } from '../../auth/auth.guard';
import { TURN_LOGS, UserLogsService } from '../../services/turn-logs.service';

/**
 * Children of a `logs` route: the Logs list and a turn's execution viewer. The parent provides
 * `TURN_LOGS` to pick the scope (admin: every user; user: own turns).
 */
export const LOGS_ROUTES: Routes = [
  { path: '', loadComponent: () => import('./turn-logs.component').then(m => m.TurnLogsComponent) },
  { path: 'execution/:turnId', loadComponent: () => import('./turn-execution.component').then(m => m.TurnExecutionComponent) },
];

/** The signed-in user's own Logs page — add to an app's routes as-is (`/logs`, `/logs/execution/:turnId`). */
export const USER_LOGS_ROUTE: Route = {
  path: 'logs',
  canActivate: [authGuard],
  providers: [{ provide: TURN_LOGS, useExisting: UserLogsService }],
  loadComponent: () => import('./logs-shell.component').then(m => m.LogsShellComponent),
  children: LOGS_ROUTES,
};
