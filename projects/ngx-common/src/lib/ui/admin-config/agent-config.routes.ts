import type { Routes } from '@angular/router';
import { AdminLogsService, TURN_LOGS } from '../../services/turn-logs.service';

/**
 * Admin agent-config pages, to mount under `/admin/config` (the pages link to `/admin/config/agents/...`):
 * the Agents table, New / Edit (draft versions, promote, discard), and Test with its execution view.
 * Same pages as `ADMIN_ROUTES`' config section, for apps with their own shell (rustic-ai-ng).
 */
export const AGENT_CONFIG_ROUTES: Routes = [
  { path: 'agents', loadComponent: () => import('./config-agents.component').then(m => m.ConfigAgentsComponent) },
  { path: 'agents/new', loadComponent: () => import('./agent-editor.component').then(m => m.AgentEditorComponent) },
  { path: 'agents/:id/edit', loadComponent: () => import('./agent-editor.component').then(m => m.AgentEditorComponent) },
  // Test: from the Agents table (agents/:id/test) or from the editor (agents/:id/edit/test).
  // `fromEdit` puts Edit in the breadcrumbs; `testRun` makes the execution page show the last test
  // run (kept in the browser, not saved) instead of loading a logged turn.
  { path: 'agents/:id/test', loadComponent: () => import('./agent-test.component').then(m => m.AgentTestComponent) },
  { path: 'agents/:id/edit/test', data: { fromEdit: true }, loadComponent: () => import('./agent-test.component').then(m => m.AgentTestComponent) },
  {
    path: 'agents/:id/test/execution',
    data: { testRun: true },
    providers: [{ provide: TURN_LOGS, useExisting: AdminLogsService }],
    loadComponent: () => import('../logs/turn-execution.component').then(m => m.TurnExecutionComponent),
  },
  {
    path: 'agents/:id/edit/test/execution',
    data: { testRun: true, fromEdit: true },
    providers: [{ provide: TURN_LOGS, useExisting: AdminLogsService }],
    loadComponent: () => import('../logs/turn-execution.component').then(m => m.TurnExecutionComponent),
  },
];
