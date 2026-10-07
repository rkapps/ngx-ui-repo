import { Routes } from '@angular/router';
import { authGuard, lastPageRedirect, noAuthGuard, roleGuard, USER_LOGS_ROUTE } from 'ngx-common';

export const routes: Routes = [
  { path: 'login', canActivate: [noAuthGuard], loadComponent: () => import('ngx-common').then(m => m.LoginComponent) },
  { path: 'home', canActivate: [authGuard], loadComponent: () => import('./pages/home/home.component') },
  USER_LOGS_ROUTE,
  {
    path: 'agents',
    canActivate: [authGuard],
    children: [
      { path: 'new', data: { showAllFields: true, showSystemPrompt: false }, loadComponent: () => import('ngx-common').then(m => m.NewConversationComponent) },
      {
        path: '',
        loadComponent: () => import('ngx-common').then(m => m.AgentsPageComponent),
        children: [
          { path: ':id', data: { showEditButton: true, showSystemPrompt: false }, loadComponent: () => import('ngx-common').then(m => m.ConversationDetailComponent) },
        ],
      },
    ],
  },
  {
    path: 'admin',
    canActivate: [roleGuard('Admin', 'SuperAdmin')],
    loadComponent: () => import('ngx-common').then(m => m.AdminPageComponent),
    loadChildren: () => import('ngx-common').then(m => m.ADMIN_ROUTES),
  },
  { path: '', redirectTo: lastPageRedirect, pathMatch: 'full' },
  { path: '**', redirectTo: '/login' },
];
