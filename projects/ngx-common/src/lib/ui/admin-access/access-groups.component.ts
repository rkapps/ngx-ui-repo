import { formatDate } from '@angular/common';
import { Component, computed, DestroyRef, inject, LOCALE_ID, signal, type WritableSignal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { TwangButtonComponent, TwangInputComponent, TwangTableComponent, type TwangTableColumn } from 'ngx-twang-ui';
import { finalize, type Observable } from 'rxjs';
import { type GroupWithCount, GroupService } from '../../services/group.service';
import { type UserResponse, UserService } from '../../services/user.service';
import { ThreePanelLayoutComponent } from '../three-panel-layout/three-panel-layout.component';
import { ADMIN_RIGHT_WIDTH } from '../admin-page/admin-layout';
import { AccessNavComponent } from './access-nav.component';
import { ACCESS_LAYOUT_KEY } from './access-sections';

type Mode = 'none' | 'create' | 'edit';

/**
 * Admin > Access > User Groups: full CRUD over groups plus membership. The middle table lists
 * every group (the first is selected on load); the right panel creates a group or edits the
 * selected one (name, description, members), with delete in its header.
 */
@Component({
  selector: 'app-access-groups',
  standalone: true,
  imports: [
    AccessNavComponent,
    FormsModule,
    LucideAngularModule,
    ThreePanelLayoutComponent,
    TwangButtonComponent,
    TwangInputComponent,
    TwangTableComponent,
  ],
  template: `
    <app-three-panel-layout
      leftTitle="Access"
      [rightTitle]="rightTitle()"
      [storageKey]="layoutKey"
      [rightWidth]="rightWidth"
      panelMinHeight="min-h-[70vh]"
    >
      <app-access-nav left />

      <!-- Middle: groups table -->
      <div middle class="flex flex-1 flex-col overflow-hidden rounded-lg border border-border bg-white">
        <div class="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
          <span class="text-sm font-semibold text-primary-600">User Groups</span>
          <span class="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700">
            {{ groups().length }}
          </span>
          <div class="ml-auto flex items-center gap-1">
            <twang-button variant="primary" size="sm" icon="plus" label="New group" (buttonClick)="startCreate()" />
            <twang-button
              variant="default"
              size="sm"
              icon="refresh-cw"
              ariaLabel="Refresh groups"
              title="Refresh groups"
              [loading]="loading()"
              [disabled]="loading()"
              (buttonClick)="loadGroups()"
            />
          </div>
        </div>

        <div class="flex min-h-0 flex-1 flex-col">
          @if (loadError()) {
            <div class="flex flex-1 items-center justify-center p-8 text-sm text-red-600">{{ loadError() }}</div>
          } @else {
            <twang-table
              [rows]="groups()"
              [columns]="columns"
              [loading]="loading()"
              [fillContainerWidth]="true"
              [onRowClick]="onRowClick"
              [rowClass]="rowClass"
              initialSortKey="name"
              initialSortDir="asc"
              tableMinWidthClass="min-w-[640px]"
              emptyMessage="No groups yet."
            />
          }
        </div>
      </div>

      <!-- Right: create / edit -->
      @if (mode() === 'edit' && !confirmDelete()) {
        <twang-button
          right-action
          variant="default"
          size="sm"
          icon="trash-2"
          ariaLabel="Delete group"
          title="Delete group"
          (buttonClick)="confirmDelete.set(true)"
        />
      }
      <div right class="flex flex-col gap-4 p-4 text-sm">
        @if (mode() === 'none') {
          <p class="text-text-muted">Select a group to edit it, or create a new one.</p>
        } @else {
          @if (confirmDelete()) {
            <div class="flex flex-col gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2">
              <p class="text-xs text-red-700">Delete "{{ selected()?.group?.name }}" and all of its memberships? This can't be undone.</p>
              <div class="flex justify-end gap-2">
                <twang-button variant="default" size="sm" label="Cancel" [disabled]="deleting()" (buttonClick)="confirmDelete.set(false)" />
                <twang-button
                  variant="destructive"
                  size="sm"
                  label="Delete"
                  [loading]="deleting()"
                  [disabled]="deleting()"
                  (buttonClick)="remove()"
                />
              </div>
            </div>
          }
          @if (actionError()) {
            <div class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{{ actionError() }}</div>
          }

          <!-- Details -->
          <section class="flex flex-col gap-3">
            <div class="flex flex-col gap-1.5">
              <label class="text-xs font-medium text-text-muted">Name</label>
              <twang-input placeholder="Group name" [ngModel]="name()" (ngModelChange)="name.set($event)" />
            </div>
            <div class="flex flex-col gap-1.5">
              <label class="text-xs font-medium text-text-muted">Description</label>
              <textarea
                rows="3"
                class="w-full resize-y rounded-lg border border-border bg-white px-3 py-2 text-sm text-text placeholder:text-text-muted outline-none transition-shadow focus:border-primary-400 focus:ring-2 focus:ring-primary-400/20"
                placeholder="What this group is for"
                [value]="description()"
                (input)="description.set($any($event.target).value)"
              ></textarea>
            </div>
            <div class="flex justify-end gap-2">
              @if (mode() === 'create') {
                <twang-button variant="default" size="sm" label="Cancel" (buttonClick)="selectFirst()" />
                <twang-button
                  variant="primary"
                  size="sm"
                  label="Create group"
                  [loading]="saving()"
                  [disabled]="saving() || !name().trim()"
                  (buttonClick)="create()"
                />
              } @else {
                <twang-button
                  variant="primary"
                  size="sm"
                  label="Save details"
                  [loading]="saving()"
                  [disabled]="saving() || !detailsDirty() || !name().trim()"
                  (buttonClick)="saveDetails()"
                />
              }
            </div>
          </section>

          @if (mode() === 'edit') {
            <!-- Members -->
            <section class="flex flex-col gap-2 border-t border-border pt-4">
              <div class="flex items-center gap-2">
                <span class="text-xs font-semibold uppercase tracking-wider text-primary-600">Members</span>
                <span class="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700">
                  {{ memberDraft().size }}
                </span>
              </div>
              <twang-input placeholder="Filter users…" [ngModel]="memberFilter()" (ngModelChange)="memberFilter.set($event)" />

              @if (membersLoading()) {
                <div class="flex items-center gap-2 py-4 text-text-muted">
                  <lucide-icon name="loader-circle" [size]="16" class="animate-spin" /> Loading members…
                </div>
              } @else {
                <ul class="flex max-h-72 flex-col overflow-y-auto rounded-lg border border-border">
                  @for (user of filteredUsers(); track user.uid) {
                    <li>
                      <label class="flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-surface-muted">
                        <input
                          type="checkbox"
                          class="accent-primary-600"
                          [checked]="memberDraft().has(user.uid)"
                          (change)="toggleMember(user.uid)"
                        />
                        <span class="min-w-0 flex-1 truncate">{{ user.email }}</span>
                      </label>
                    </li>
                  } @empty {
                    <li class="px-3 py-2 text-text-muted">No matching users.</li>
                  }
                </ul>
                <div class="flex justify-end gap-2">
                  <twang-button
                    variant="default"
                    size="sm"
                    label="Reset"
                    [disabled]="savingMembers() || !membersDirty()"
                    (buttonClick)="resetMembers()"
                  />
                  <twang-button
                    variant="primary"
                    size="sm"
                    label="Save members"
                    [loading]="savingMembers()"
                    [disabled]="savingMembers() || !membersDirty()"
                    (buttonClick)="saveMembers()"
                  />
                </div>
              }
            </section>
          }
        }
      </div>
    </app-three-panel-layout>
  `,
})
export class AccessGroupsComponent {
  private readonly groupService = inject(GroupService);
  private readonly userService = inject(UserService);
  private readonly locale = inject(LOCALE_ID);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly layoutKey = ACCESS_LAYOUT_KEY;
  protected readonly rightWidth = ADMIN_RIGHT_WIDTH;

  // Table
  protected readonly groups = signal<GroupWithCount[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);

  // Selection / form
  protected readonly mode = signal<Mode>('none');
  protected readonly selectedId = signal<string | null>(null);
  protected readonly selected = computed(() => this.groups().find(g => g.group.id === this.selectedId()) ?? null);
  protected readonly name = signal('');
  protected readonly description = signal('');
  protected readonly saving = signal(false);
  protected readonly deleting = signal(false);
  protected readonly confirmDelete = signal(false);
  protected readonly actionError = signal<string | null>(null);

  // Members
  private readonly users = signal<UserResponse[]>([]);
  private readonly savedMembers = signal<ReadonlySet<string>>(new Set());
  protected readonly memberDraft = signal<ReadonlySet<string>>(new Set());
  protected readonly membersLoading = signal(false);
  protected readonly savingMembers = signal(false);
  protected readonly memberFilter = signal('');

  protected readonly rightTitle = computed(() =>
    this.mode() === 'create' ? 'New group' : (this.selected()?.group.name ?? 'Details')
  );

  protected readonly detailsDirty = computed(() => {
    const g = this.selected()?.group;
    return !!g && (this.name().trim() !== g.name || this.description().trim() !== g.description);
  });

  protected readonly membersDirty = computed(() => {
    const saved = this.savedMembers();
    const draft = this.memberDraft();
    return saved.size !== draft.size || [...draft].some(uid => !saved.has(uid));
  });

  /**
   * Users matching the search box: saved members first, then everyone else, each by email.
   * Ordered by *saved* membership so rows don't jump around while boxes are being ticked.
   */
  protected readonly filteredUsers = computed(() => {
    const q = this.memberFilter().trim().toLowerCase();
    const saved = this.savedMembers();
    return this.users()
      .filter(u => !q || u.email.toLowerCase().includes(q))
      .sort((a, b) => Number(saved.has(b.uid)) - Number(saved.has(a.uid)) || a.email.localeCompare(b.email));
  });

  private readonly date = (v: string | number | null) => (v ? formatDate(v, 'mediumDate', this.locale) : '');

  protected readonly columns: TwangTableColumn<GroupWithCount>[] = [
    { id: 'name', header: 'Name', align: 'left', sortable: true, width: '200px', cellTruncate: true, value: g => g.group.name },
    { id: 'description', header: 'Description', align: 'left', fillRemaining: true, cellTruncate: true, value: g => g.group.description },
    { id: 'members', header: 'Members', align: 'right', sortable: true, width: '110px', value: g => g.member_count },
    { id: 'updated_at', header: 'Updated', align: 'left', sortable: true, width: '130px', value: g => g.group.updated_at, format: this.date },
  ];

  protected readonly onRowClick = (row: GroupWithCount) => this.select(row.group.id);
  protected readonly rowClass = (row: GroupWithCount) => (row.group.id === this.selectedId() ? 'bg-primary-50' : '');

  constructor() {
    this.loadGroups();
    this.userService
      .getAllUsers()
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: users => this.users.set(users),
        error: err => console.error('Failed to load users', err),
      });
  }

  protected loadGroups(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.groupService
      .getGroups()
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: groups => {
          this.groups.set(groups);
          // Keep the current selection (or an in-progress create); otherwise — first load, or the
          // selected group was deleted elsewhere — select the first group.
          if (this.mode() === 'create' || this.selected()) return;
          this.selectFirst();
        },
        error: err => {
          console.error('Failed to load groups', err);
          this.loadError.set('Failed to load groups.');
        },
      });
  }

  protected startCreate(): void {
    this.resetForm('create', null);
    this.name.set('');
    this.description.set('');
  }

  protected clearSelection(): void {
    this.resetForm('none', null);
  }

  /** Selects the first group in the table's default order (name A–Z), or clears if none. */
  protected selectFirst(): void {
    const first = [...this.groups()].sort((a, b) => a.group.name.localeCompare(b.group.name))[0];
    if (first) this.select(first.group.id);
    else this.clearSelection();
  }

  private select(id: string): void {
    const row = this.groups().find(g => g.group.id === id);
    if (!row) return;
    this.resetForm('edit', id);
    this.name.set(row.group.name);
    this.description.set(row.group.description);
    this.loadMembers(id);
  }

  private resetForm(mode: Mode, id: string | null): void {
    this.mode.set(mode);
    this.selectedId.set(id);
    this.actionError.set(null);
    this.confirmDelete.set(false);
    this.memberFilter.set('');
    this.savedMembers.set(new Set());
    this.memberDraft.set(new Set());
  }

  protected create(): void {
    this.run(this.saving, this.groupService.createGroup(this.formValue()), 'create the group', group => {
      this.groups.update(gs => [...gs, { group, member_count: 0 }]);
      // Straight into edit mode so members can be assigned next.
      this.select(group.id);
    });
  }

  protected saveDetails(): void {
    const id = this.selectedId();
    if (!id) return;
    this.run(this.saving, this.groupService.updateGroup(id, this.formValue()), 'save the group', group => {
      this.groups.update(gs => gs.map(g => (g.group.id === id ? { ...g, group } : g)));
      this.name.set(group.name);
      this.description.set(group.description);
    });
  }

  protected remove(): void {
    const id = this.selectedId();
    if (!id) return;
    this.run(this.deleting, this.groupService.deleteGroup(id), 'delete the group', () => {
      this.groups.update(gs => gs.filter(g => g.group.id !== id));
      this.selectFirst();
    });
  }

  private loadMembers(id: string): void {
    this.membersLoading.set(true);
    this.groupService
      .getMembers(id)
      .pipe(
        finalize(() => this.membersLoading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: uids => {
          if (this.selectedId() !== id) return; // selection moved on while loading
          this.savedMembers.set(new Set(uids));
          this.memberDraft.set(new Set(uids));
        },
        error: err => {
          console.error('Failed to load members', err);
          this.actionError.set('Failed to load members.');
        },
      });
  }

  protected toggleMember(uid: string): void {
    this.memberDraft.update(draft => {
      const next = new Set(draft);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }

  protected resetMembers(): void {
    this.memberDraft.set(new Set(this.savedMembers()));
  }

  protected saveMembers(): void {
    const id = this.selectedId();
    if (!id) return;
    const uids = [...this.memberDraft()];
    this.run(this.savingMembers, this.groupService.setMembers(id, uids), 'save members', () => {
      this.savedMembers.set(new Set(uids));
      this.groups.update(gs => gs.map(g => (g.group.id === id ? { ...g, member_count: uids.length } : g)));
    });
  }

  private formValue() {
    return { name: this.name().trim(), description: this.description().trim() };
  }

  /** Runs a mutation with a busy flag, surfacing failures in the right panel. */
  private run<T>(busy: WritableSignal<boolean>, request: Observable<T>, what: string, done: (result: T) => void): void {
    busy.set(true);
    this.actionError.set(null);
    request
      .pipe(
        finalize(() => busy.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: done,
        error: err => {
          console.error(`Failed to ${what}`, err);
          const detail = typeof err?.error === 'string' && err.error ? `: ${err.error}` : '.';
          this.actionError.set(`Couldn't ${what}${detail}`);
        },
      });
  }
}
