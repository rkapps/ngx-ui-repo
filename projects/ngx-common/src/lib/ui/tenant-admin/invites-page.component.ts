import { DatePipe, formatDate } from '@angular/common';
import { Component, computed, DestroyRef, effect, inject, signal, type TemplateRef, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import {
  TwangButtonComponent,
  TwangDropdownComponent,
  type TwangDropdownOption,
  TwangInputComponent,
  TwangTableComponent,
  type TwangTableColumn,
} from 'ngx-twang-ui';
import { finalize } from 'rxjs';
import { type Invite, InviteService } from '../../services/invite.service';
import type { RoleType } from '../../services/user.service';
import { ADMIN_RIGHT_WIDTH } from '../admin-page/admin-layout';
import { PageBreadcrumbs } from '../breadcrumbs/page-breadcrumbs';
import { ThreePanelLayoutComponent } from '../three-panel-layout/three-panel-layout.component';

/** Roles an admin can invite with (the backend's tenant roles). */
const ROLE_OPTIONS: TwangDropdownOption[] = [
  { value: 'User', label: 'User' },
  { value: 'Admin', label: 'Admin' },
];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Status text colour: pending amber, accepted green (anything else muted). */
function statusClass(status: string): string {
  return status === 'Pending' ? 'text-amber-700' : status === 'Accepted' ? 'text-green-700' : 'text-text-muted';
}

const DATE_FORMAT = 'MMM d, y, HH:mm';
const formatWhen = (iso: string | number | null) => (iso ? formatDate(iso, DATE_FORMAT, 'en-US') : '—');

/** Backend error text (axum returns plain strings), else a fallback. */
function errorText(err: unknown, fallback: string): string {
  const body = (err as { error?: unknown })?.error;
  return typeof body === 'string' && body.trim() ? body : fallback;
}

/**
 * Admin › Access › Invites: the active tenant's invites (`GET /admin/invites`) in the middle; the
 * right panel shows the selected invite, or the New invite form (`POST /admin/invites`) opened from
 * the page header.
 */
@Component({
  selector: 'app-invites-page',
  standalone: true,
  imports: [DatePipe, FormsModule, LucideAngularModule, ThreePanelLayoutComponent, TwangButtonComponent, TwangDropdownComponent, TwangInputComponent, TwangTableComponent],
  template: `
    <app-three-panel-layout
      [showLeft]="false"
      [rightTitle]="creating() ? 'New invite' : (selected()?.email ?? 'Details')"
      storageKey="tenant.access.invites.layout"
      [rightWidth]="rightWidth"
      panelMinHeight="min-h-[70vh]"
    >
      <div middle class="flex flex-1 flex-col overflow-hidden rounded-lg border border-border bg-white">
        <div class="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
          <span class="text-sm font-semibold text-primary-600">Invites</span>
          <span class="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700">{{ invites().length }}</span>
          <twang-button
            class="ml-auto"
            variant="default"
            size="sm"
            icon="refresh-cw"
            ariaLabel="Refresh invites"
            title="Refresh invites"
            [loading]="loading()"
            [disabled]="loading()"
            (buttonClick)="load()"
          />
        </div>
        <div class="flex min-h-0 flex-1 flex-col">
          @if (error()) {
            <div class="flex flex-1 items-center justify-center p-8 text-sm text-red-600">{{ error() }}</div>
          } @else {
            <twang-table
              [rows]="invites()"
              [columns]="columns"
              [loading]="loading()"
              [fillContainerWidth]="true"
              [onRowClick]="onRowClick"
              [rowClass]="rowClass"
              initialSortKey="invited_at"
              initialSortDir="desc"
              tableMinWidthClass="min-w-[960px]"
              emptyMessage="No invites yet."
            />
          }
        </div>
      </div>

      <div right class="flex flex-col gap-4 p-4 text-sm">
        @if (creating()) {
          <!-- New invite -->
          <div class="flex flex-col gap-1.5">
            <label class="text-xs font-medium text-text-muted">Email</label>
            <twang-input type="email" placeholder="name@example.com" [ngModel]="email()" (ngModelChange)="email.set($event.trim())" />
            @if (email() && !emailValid()) {
              <span class="text-xs text-red-600">Enter a valid email address.</span>
            }
          </div>
          <div class="flex flex-col gap-1.5">
            <label class="text-xs font-medium text-text-muted">Role</label>
            <twang-dropdown size="sm" [options]="roleOptions" [value]="role()" (valueChange)="role.set($any($event))" />
          </div>
          @if (createError()) {
            <div class="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
              <lucide-icon name="circle-alert" [size]="14" class="mt-0.5 shrink-0" />
              <span class="min-w-0 flex-1 break-words">{{ createError() }}</span>
            </div>
          }
          <div class="flex items-center justify-end gap-2 border-t border-border pt-3">
            <twang-button variant="default" size="sm" label="Cancel" [disabled]="saving()" (buttonClick)="cancelCreate()" />
            <twang-button
              variant="primary"
              size="sm"
              icon="mail"
              label="Send invite"
              [loading]="saving()"
              [disabled]="saving() || !emailValid()"
              (buttonClick)="create()"
            />
          </div>
        } @else if (selected(); as i) {
          <dl class="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2">
            <dt class="text-xs text-text-muted">Email</dt>
            <dd class="break-all">{{ i.email }}</dd>
            <dt class="text-xs text-text-muted">Role</dt>
            <dd>{{ i.role }}</dd>
            <dt class="text-xs text-text-muted">Status</dt>
            <dd [class]="statusClass(i.status)">{{ i.status }}</dd>
            <dt class="text-xs text-text-muted">Invited</dt>
            <dd>{{ i.invited_at | date: dateFormat }}</dd>
            <dt class="text-xs text-text-muted">Accepted</dt>
            <dd>{{ i.accepted_at ? (i.accepted_at | date: dateFormat) : '—' }}</dd>
            <dt class="text-xs text-text-muted">Invited by</dt>
            <dd class="break-all font-mono text-xs">{{ i.invited_by }}</dd>
          </dl>
        } @else {
          <p class="text-text-muted">Select an invite to see its details, or use New invite.</p>
        }
      </div>
    </app-three-panel-layout>

    <!-- Rendered in the page header (right side) via PageBreadcrumbs.actions. -->
    <ng-template #headerActions>
      <twang-button variant="primary" size="sm" icon="user-plus" label="New invite" [disabled]="creating()" (buttonClick)="startCreate()" />
    </ng-template>
  `,
})
export class InvitesPageComponent {
  private readonly inviteService = inject(InviteService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly headerActions = viewChild<TemplateRef<unknown>>('headerActions');

  protected readonly rightWidth = ADMIN_RIGHT_WIDTH;
  protected readonly roleOptions = ROLE_OPTIONS;
  protected readonly statusClass = statusClass;
  protected readonly dateFormat = DATE_FORMAT;

  protected readonly invites = signal<Invite[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly selectedId = signal<string | null>(null);
  protected readonly selected = computed(() => this.invites().find(i => i.id === this.selectedId()) ?? null);

  // New invite form
  protected readonly creating = signal(false);
  protected readonly email = signal('');
  protected readonly role = signal<RoleType>('User');
  protected readonly emailValid = computed(() => EMAIL.test(this.email()));
  protected readonly saving = signal(false);
  protected readonly createError = signal<string | null>(null);

  protected readonly onRowClick = (row: Invite) => {
    this.selectedId.set(row.id);
    this.creating.set(false);
  };
  protected readonly rowClass = (row: Invite) => (row.id === this.selectedId() && !this.creating() ? 'bg-primary-50' : '');

  protected readonly columns: TwangTableColumn<Invite>[] = [
    { id: 'email', header: 'Email', align: 'left', sortable: true, fillRemaining: true, minWidth: '240px', cellTruncate: true, value: i => i.email },
    { id: 'role', header: 'Role', align: 'left', sortable: true, width: '110px', value: i => i.role },
    { id: 'invited_at', header: 'Invited', align: 'left', sortable: true, width: '170px', value: i => i.invited_at, format: v => formatWhen(v) },
    { id: 'invited_by', header: 'Invited by', align: 'left', sortable: true, width: '220px', cellTruncate: true, value: i => i.invited_by },
    { id: 'status', header: 'Status', align: 'left', sortable: true, width: '120px', value: i => i.status, cellClass: i => statusClass(i.status) },
    { id: 'accepted_at', header: 'Accepted', align: 'left', sortable: true, width: '170px', value: i => i.accepted_at, format: v => formatWhen(v) },
  ];

  constructor() {
    const breadcrumbs = inject(PageBreadcrumbs);
    effect(() => breadcrumbs.actions.set(this.headerActions() ?? null));
    // Only drop our actions (not the crumbs): the next page may already have set its own.
    this.destroyRef.onDestroy(() => {
      if (breadcrumbs.actions() === this.headerActions()) breadcrumbs.actions.set(null);
    });

    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.inviteService
      .getInvites()
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: invites => {
          this.invites.set(invites);
          // Keep the selection if it's still there; otherwise select the newest (the table's default order).
          if (this.selected()) return;
          const first = [...invites].sort((a, b) => b.invited_at.localeCompare(a.invited_at))[0];
          this.selectedId.set(first?.id ?? null);
        },
        error: err => {
          console.error('Failed to load invites', err);
          this.error.set(errorText(err, 'Failed to load invites.'));
        },
      });
  }

  protected startCreate(): void {
    this.email.set('');
    this.role.set('User');
    this.createError.set(null);
    this.creating.set(true);
  }

  protected cancelCreate(): void {
    this.creating.set(false);
    this.createError.set(null);
  }

  protected create(): void {
    if (!this.emailValid()) return;
    this.saving.set(true);
    this.createError.set(null);
    this.inviteService
      .createInvite({ email: this.email(), role: this.role() })
      .pipe(
        finalize(() => this.saving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: invite => {
          this.invites.update(list => [...list.filter(i => i.id !== invite.id), invite]);
          this.selectedId.set(invite.id);
          this.creating.set(false);
        },
        error: err => {
          console.error('Failed to create invite', err);
          this.createError.set(errorText(err, 'Failed to send the invite.'));
        },
      });
  }
}
