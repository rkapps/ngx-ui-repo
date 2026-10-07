import { DatePipe, formatDate } from '@angular/common';
import { Component, computed, DestroyRef, inject, linkedSignal, LOCALE_ID, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LucideAngularModule } from 'lucide-angular';
import {
  TwangButtonComponent,
  TwangDropdownComponent,
  type TwangDropdownOption,
  TwangTableComponent,
  type TwangTableColumn,
} from 'ngx-twang-ui';
import { finalize } from 'rxjs';
import { type RoleType, type UserResponse, UserService } from '../../services/user.service';
import { ThreePanelLayoutComponent } from '../three-panel-layout/three-panel-layout.component';
import { ADMIN_RIGHT_WIDTH } from '../admin-page/admin-layout';
import { AccessNavComponent } from './access-nav.component';
import { ACCESS_LAYOUT_KEY } from './access-sections';

const ROLES: readonly RoleType[] = ['User', 'Admin', 'SuperAdmin'];

/**
 * Admin > Access > Users: the middle table lists every user (the first is selected on load);
 * the right panel shows the selected user's details and groups, and changes their role.
 */
@Component({
  selector: 'app-access-users',
  standalone: true,
  imports: [
    AccessNavComponent,
    DatePipe,
    LucideAngularModule,
    ThreePanelLayoutComponent,
    TwangButtonComponent,
    TwangDropdownComponent,
    TwangTableComponent,
  ],
  template: `
    <app-three-panel-layout
      leftTitle="Access"
      [rightTitle]="selected()?.email ?? 'Details'"
      [storageKey]="layoutKey"
      [rightWidth]="rightWidth"
      panelMinHeight="min-h-[70vh]"
    >
      <app-access-nav left />

      <div middle class="flex flex-1 flex-col overflow-hidden rounded-lg border border-border bg-white">
        <div class="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
          <span class="text-sm font-semibold text-primary-600">Users</span>
          <span class="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700">
            {{ users().length }}
          </span>
          <twang-button
            class="ml-auto"
            variant="default"
            size="sm"
            icon="refresh-cw"
            ariaLabel="Refresh users"
            title="Refresh users"
            [loading]="loading()"
            [disabled]="loading()"
            (buttonClick)="loadUsers()"
          />
        </div>

        <div class="flex min-h-0 flex-1 flex-col">
          @if (error()) {
            <div class="flex flex-1 items-center justify-center p-8 text-sm text-red-600">{{ error() }}</div>
          } @else {
            <twang-table
              [rows]="users()"
              [columns]="columns"
              [loading]="loading()"
              [fillContainerWidth]="true"
              [onRowClick]="onRowClick"
              [rowClass]="rowClass"
              initialSortKey="email"
              initialSortDir="asc"
              tableMinWidthClass="min-w-[720px]"
              emptyMessage="No users found."
            />
          }
        </div>
      </div>

      <div right class="flex flex-col gap-4 p-4 text-sm">
        @if (selected(); as u) {
          <dl class="flex flex-col gap-3">
            <div>
              <dt class="text-xs text-text-muted">Email</dt>
              <dd class="break-all">{{ u.email }}</dd>
            </div>
            <div>
              <dt class="mb-1.5 text-xs text-text-muted">Role</dt>
              <dd class="flex flex-col gap-2">
                @if (roleOptions().length > 1) {
                  <twang-dropdown
                    size="sm"
                    [options]="roleOptions()"
                    [value]="roleDraft()"
                    [disabled]="savingRole()"
                    (valueChange)="roleDraft.set($any($event))"
                  />
                  @if (roleDraft() !== u.role) {
                    <div class="flex justify-end gap-2">
                      <twang-button variant="default" size="sm" label="Cancel" [disabled]="savingRole()" (buttonClick)="roleDraft.set(u.role)" />
                      <twang-button
                        variant="primary"
                        size="sm"
                        label="Save role"
                        [loading]="savingRole()"
                        [disabled]="savingRole()"
                        (buttonClick)="saveRole()"
                      />
                    </div>
                  }
                } @else {
                  <span>{{ u.role }}</span>
                  @if (roleLockReason()) {
                    <span class="text-xs text-text-muted">{{ roleLockReason() }}</span>
                  }
                }
                @if (roleError()) {
                  <span class="text-xs text-red-600">{{ roleError() }}</span>
                }
              </dd>
            </div>
            <div>
              <dt class="text-xs text-text-muted">Member since</dt>
              <dd>{{ u.created_at | date: 'mediumDate' }}</dd>
            </div>
          </dl>

          <section class="flex flex-col gap-2 border-t border-border pt-4">
            <div class="flex items-center gap-2">
              <span class="text-xs font-semibold uppercase tracking-wider text-primary-600">Groups</span>
              <span class="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700">{{ u.groups.length }}</span>
            </div>
            <ul class="flex flex-col gap-1">
              @for (group of u.groups; track group.id) {
                <li class="rounded-md border border-border px-3 py-2">
                  <div class="font-medium">{{ group.name }}</div>
                  @if (group.description) {
                    <div class="truncate text-xs text-text-muted">{{ group.description }}</div>
                  }
                </li>
              } @empty {
                <li class="text-text-muted">Not a member of any group.</li>
              }
            </ul>
          </section>
        } @else {
          <p class="text-text-muted">Select a user to see their details.</p>
        }
      </div>
    </app-three-panel-layout>
  `,
})
export class AccessUsersComponent {
  protected readonly layoutKey = ACCESS_LAYOUT_KEY;
  protected readonly rightWidth = ADMIN_RIGHT_WIDTH;
  private readonly userService = inject(UserService);
  private readonly locale = inject(LOCALE_ID);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly users = signal<UserResponse[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly selectedUid = signal<string | null>(null);
  protected readonly selected = computed(() => this.users().find(u => u.uid === this.selectedUid()) ?? null);

  /** Signed-in admin making the changes. */
  private readonly me = this.userService.user;

  /**
   * Roles the signed-in admin may set on the selected user, mirroring the backend's rules:
   * Admins can't grant SuperAdmin, nobody can demote themselves out of admin — plus one the
   * backend doesn't enforce yet: an Admin can't change a SuperAdmin's role.
   */
  private readonly allowedRoles = computed<RoleType[]>(() => {
    const me = this.me();
    const target = this.selected();
    if (!me || !target) return [];
    if (me.role === 'Admin' && target.role === 'SuperAdmin') return [];
    return ROLES.filter(role => {
      if (me.role === 'Admin' && role === 'SuperAdmin') return false;
      if (me.uid === target.uid && role === 'User') return false;
      return true;
    });
  });

  protected readonly roleOptions = computed<TwangDropdownOption[]>(() => this.allowedRoles().map(role => ({ value: role, label: role })));

  protected readonly roleLockReason = computed(() => {
    const me = this.me();
    const target = this.selected();
    if (!me || !target) return '';
    if (me.uid === target.uid) return "You can't change your own role.";
    if (me.role === 'Admin' && target.role === 'SuperAdmin') return "Only a SuperAdmin can change a SuperAdmin's role.";
    return '';
  });

  /** Pending role for the selected user; resets whenever the selection (or its saved role) changes. */
  protected readonly roleDraft = linkedSignal<RoleType>(() => this.selected()?.role ?? 'User');
  protected readonly savingRole = signal(false);
  protected readonly roleError = linkedSignal<string | null>(() => (this.selectedUid(), null));

  protected readonly onRowClick = (row: UserResponse) => this.selectedUid.set(row.uid);
  protected readonly rowClass = (row: UserResponse) => (row.uid === this.selectedUid() ? 'bg-primary-50' : '');

  private readonly date = (v: string | number | null) => (v ? formatDate(v, 'mediumDate', this.locale) : '');

  protected readonly columns: TwangTableColumn<UserResponse>[] = [
    { id: 'email', header: 'Email', align: 'left', sortable: true, width: '240px', cellTruncate: true, value: u => u.email },
    { id: 'role', header: 'Role', align: 'left', sortable: true, width: '120px', value: u => u.role },
    { id: 'groups', header: 'Groups', align: 'left', fillRemaining: true, minWidth: '200px', cellTruncate: true, value: u => u.groups.map(g => g.name).join(', ') },
    { id: 'created_at', header: 'Created', align: 'left', sortable: true, width: '130px', value: u => u.created_at, format: this.date },
    { id: 'updated_at', header: 'Updated', align: 'left', sortable: true, width: '130px', value: u => u.updated_at, format: this.date },
  ];

  constructor() {
    this.loadUsers();
  }

  protected saveRole(): void {
    const target = this.selected();
    if (!target) return;
    const role = this.roleDraft();
    this.savingRole.set(true);
    this.roleError.set(null);
    this.userService
      .updateUserRole(target.uid, role)
      .pipe(
        finalize(() => this.savingRole.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        // Merge rather than replace: the PATCH returns a plain user, without groups.
        next: user => this.users.update(us => us.map(u => (u.uid === user.uid ? { ...u, ...user, groups: u.groups } : u))),
        error: err => {
          console.error('Failed to update role', err);
          const detail = typeof err?.error === 'string' && err.error ? `: ${err.error}` : '.';
          this.roleError.set(`Couldn't change the role${detail}`);
        },
      });
  }

  protected loadUsers(): void {
    this.loading.set(true);
    this.error.set(null);
    this.userService
      .getAllUsers()
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: users => {
          // Groups sorted by name once here, for both the table column and the right panel.
          this.users.set(users.map(u => ({ ...u, groups: [...u.groups].sort((a, b) => a.name.localeCompare(b.name)) })));
          // Keep the current selection if it's still there; otherwise select the first user
          // in the table's default order (email A–Z).
          if (this.selected()) return;
          const first = [...users].sort((a, b) => a.email.localeCompare(b.email))[0];
          this.selectedUid.set(first?.uid ?? null);
        },
        error: err => {
          console.error('Failed to load users', err);
          this.error.set(err?.status === 403 ? 'You do not have permission to view users.' : 'Failed to load users.');
        },
      });
  }
}
