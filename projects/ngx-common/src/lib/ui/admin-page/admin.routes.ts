import type { Routes } from '@angular/router';
import { AdminLogsService, TURN_LOGS } from '../../services/turn-logs.service';
import { LOGS_ROUTES } from '../logs/logs.routes';
import { accessSectionRedirect } from '../admin-access/access-sections';
import { configSectionRedirect } from '../admin-config/config-sections';
import { adminSectionRedirect } from './admin-page.component';

/**
 * Child routes of the app's `admin` route (which renders `AdminPageComponent` behind
 * `roleGuard('Admin', 'SuperAdmin')`). Empty paths reopen the last selected section.
 */
export const ADMIN_ROUTES: Routes = [
  {
    path: 'access',
    children: [
      { path: 'users', loadComponent: () => import('../admin-access/access-users.component').then(m => m.AccessUsersComponent) },
      { path: 'groups', loadComponent: () => import('../admin-access/access-groups.component').then(m => m.AccessGroupsComponent) },
      { path: 'resource-types', loadComponent: () => import('../admin-access/access-stub.component').then(m => m.AccessStubComponent) },
      { path: 'grants', loadComponent: () => import('../admin-access/access-stub.component').then(m => m.AccessStubComponent) },
      { path: '', redirectTo: accessSectionRedirect, pathMatch: 'full' },
    ],
  },
  {
    path: 'config',
    children: [
      { path: 'agents', loadComponent: () => import('../admin-config/config-agents.component').then(m => m.ConfigAgentsComponent) },
      { path: 'agents/new', loadComponent: () => import('../admin-config/agent-editor.component').then(m => m.AgentEditorComponent) },
      { path: 'agents/:id/edit', loadComponent: () => import('../admin-config/agent-editor.component').then(m => m.AgentEditorComponent) },
      // Test: from the Agents table (agents/:id/test) or from the editor (agents/:id/edit/test).
      // `fromEdit` puts Edit in the breadcrumbs; `testRun` makes the execution page show the last
      // test run (kept in the browser, not saved) instead of loading a logged turn.
      { path: 'agents/:id/test', loadComponent: () => import('../admin-config/agent-test.component').then(m => m.AgentTestComponent) },
      {
        path: 'agents/:id/edit/test',
        data: { fromEdit: true },
        loadComponent: () => import('../admin-config/agent-test.component').then(m => m.AgentTestComponent),
      },
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
      { path: 'providers', loadComponent: () => import('../admin-config/config-providers.component').then(m => m.ConfigProvidersComponent) },
      { path: '', redirectTo: configSectionRedirect, pathMatch: 'full' },
    ],
  },
  {
    path: 'logs',
    providers: [{ provide: TURN_LOGS, useExisting: AdminLogsService }],
    children: LOGS_ROUTES,
  },
  { path: '', redirectTo: adminSectionRedirect, pathMatch: 'full' },
];
