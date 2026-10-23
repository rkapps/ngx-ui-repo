import { Routes } from '@angular/router';
import { AdminLogsService, AGENT_CONFIG_ROUTES, AnalyticsLogsService, authGuard, featureGuard, type ConfigScope, lastPageRedirect, LOGS_ROUTES, noAuthGuard, roleRedirectGuard, TURN_LOGS } from 'ngx-common';

const placeholder = () => import('./pages/placeholder/placeholder.component');

/**
 * Agents / Providers for a config area; `scope` picks the API. Platform: agents list + import.
 * Admin: the full agent pages (list, new, edit with versions, test).
 */
const configChildren = (scope: ConfigScope): Routes => [
  ...(scope === 'platform'
    ? [{ path: 'agents', loadComponent: () => import('ngx-common').then(m => m.ConfigAgentsComponent), data: { scope } }]
    : AGENT_CONFIG_ROUTES),
  { path: 'providers', loadComponent: () => import('ngx-common').then(m => m.ConfigProvidersComponent), data: { scope } },
  { path: '', redirectTo: 'agents', pathMatch: 'full' },
];

export const routes: Routes = [
  { path: 'login', canActivate: [noAuthGuard], loadComponent: () => import('ngx-common').then(m => m.LoginComponent) },
  { path: 'home', canActivate: [authGuard], loadComponent: () => import('./pages/home/home.component') },
  {
    path: 'conversations',
    canActivate: [authGuard],
    children: [
      { path: '', loadComponent: () => import('./pages/conversations/conversations.component') },
      // Agent conversation form; basePath makes Cancel / create land back under /conversations.
      { path: 'new', data: { showAllFields: true, basePath: '/conversations', tiled: true }, loadComponent: () => import('ngx-common').then(m => m.NewConversationComponent) },
      { path: ':id', data: { showEditButton: true, tiled: true }, loadComponent: () => import('ngx-common').then(m => m.ConversationDetailComponent) },
    ],
  },
  {
    path: 'projects',
    // Off unless the app enables it (APP_FEATURES); then users land on /home.
    canActivate: [authGuard, featureGuard('projects')],
    children: [
      { path: '', loadComponent: () => import('ngx-common').then(m => m.ProjectsPageComponent) },
      // A project's files: table, upload, and search.
      { path: ':id', loadComponent: () => import('ngx-common').then(m => m.ProjectFilesPageComponent) },
    ],
  },
  {
    path: 'analytics',
    canActivate: [authGuard],
    children: [
      // The user's turn logs (list + execution view), same pages as rustic-ai-ng's Logs.
      { path: 'logs', providers: [{ provide: TURN_LOGS, useExisting: AnalyticsLogsService }], children: LOGS_ROUTES },
      { path: '', redirectTo: 'logs', pathMatch: 'full' },
    ],
  },
  // Platform: super admins only ('SuperAdmin' matches is_super_admin). Admin: admins of the active tenant.
  {
    path: 'platform',
    canActivate: [roleRedirectGuard(['SuperAdmin'], '/home')],
    children: [
      { path: 'mcp-servers', loadComponent: () => import('ngx-common').then(m => m.McpServersPageComponent), data: { scope: 'platform' } },
      { path: 'chat-templates', loadComponent: () => import('ngx-common').then(m => m.ChatTemplatesPageComponent) },
      ...configChildren('platform'),
    ],
  },
  {
    path: 'admin',
    canActivate: [roleRedirectGuard(['Admin'], '/home')],
    children: [
      {
        path: 'access',
        children: [
          { path: 'groups', loadComponent: () => import('ngx-common').then(m => m.AccessGroupsComponent) },
          { path: 'invites', loadComponent: () => import('ngx-common').then(m => m.InvitesPageComponent) },
          { path: 'users', loadComponent: () => import('ngx-common').then(m => m.AccessUsersComponent) },
          { path: '', redirectTo: 'groups', pathMatch: 'full' },
        ],
      },
      {
        path: 'config',
        children: [
          { path: 'mcp-servers', loadComponent: () => import('ngx-common').then(m => m.McpServersPageComponent), data: { scope: 'admin' } },
          ...configChildren('admin'),
        ],
      },
      {
        path: 'analytics',
        children: [
          // Every user's turn logs (with a User column).
          { path: 'logs', providers: [{ provide: TURN_LOGS, useExisting: AdminLogsService }], children: LOGS_ROUTES },
          { path: '', redirectTo: 'logs', pathMatch: 'full' },
        ],
      },
      { path: '', redirectTo: 'access', pathMatch: 'full' },
    ],
  },
  { path: '', redirectTo: lastPageRedirect, pathMatch: 'full' },
  { path: '**', redirectTo: '/login' },
];
