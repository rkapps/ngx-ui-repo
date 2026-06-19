import { Routes } from '@angular/router';
import { authGuard, noAuthGuard } from 'ngx-common';

export const routes: Routes = [
  { path: 'login', canActivate: [noAuthGuard], loadComponent: () => import('ngx-common').then(m => m.LoginComponent) },
  { path: 'home', canActivate: [authGuard], loadComponent: () => import('./pages/home/home.component') },
  { path: 'usage', canActivate: [authGuard], loadComponent: () => import('ngx-common').then(m => m.UsageComponent) },
  {
    path: 'agents',
    canActivate: [authGuard],
    children: [
      { path: 'new', data: { showAllFields: true }, loadComponent: () => import('ngx-common').then(m => m.NewConversationComponent) },
      {
        path: '',
        loadComponent: () => import('ngx-common').then(m => m.AgentsPageComponent),
        children: [
          { path: ':id', data: { showEditButton: true }, loadComponent: () => import('ngx-common').then(m => m.ConversationDetailComponent) },
        ],
      },
    ],
  },
  {
    path: 'chats',
    canActivate: [authGuard],
    children: [
      { path: 'new', loadComponent: () => import('ngx-common').then(m => m.NewChatComponent) },
      {
        path: '',
        loadComponent: () => import('ngx-common').then(m => m.ChatsPageComponent),
        children: [
          { path: ':id', data: { alwaysMarkdown: true }, loadComponent: () => import('ngx-common').then(m => m.ConversationDetailComponent) },
        ],
      },
    ],
  },
  { path: '', redirectTo: 'agents', pathMatch: 'full' },
  { path: '**', redirectTo: '/login' },
];
