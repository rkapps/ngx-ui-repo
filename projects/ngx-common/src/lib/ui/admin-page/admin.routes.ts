import type { Routes } from '@angular/router';
import { accessSectionRedirect } from '../admin-access/access-sections';
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
  { path: '', redirectTo: adminSectionRedirect, pathMatch: 'full' },
];
