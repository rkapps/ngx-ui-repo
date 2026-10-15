import { DatePipe } from '@angular/common';
import { Component, computed, DestroyRef, effect, inject, signal, type TemplateRef, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { TwangButtonComponent, TwangInputComponent, TwangTableComponent, type TwangTableColumn } from 'ngx-twang-ui';
import { finalize, type Observable } from 'rxjs';
import { type Project, type ProjectCreateRequest, ProjectService } from '../../services/project.service';
import { ADMIN_RIGHT_WIDTH } from '../admin-page/admin-layout';
import { PageBreadcrumbs } from '../breadcrumbs/page-breadcrumbs';
import { ThreePanelLayoutComponent } from '../three-panel-layout/three-panel-layout.component';
import { DATE_FORMAT, errorText, formatWhen } from './project-utils';

/** The backend's ProjectChunkConfig::default(), shown as placeholders. */
const DEFAULT_MAX_TOKENS = 600;
const DEFAULT_OVERLAP_TOKENS = 80;

/** Blank → null; otherwise a non-negative whole number, or NaN when it isn't one. */
function parseCount(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  return /^\d+$/.test(t) ? Number(t) : NaN;
}

/**
 * Projects: the user's projects (`GET /projects`) in the middle, the selected one's details in the
 * right panel. The page header has New project (`POST /projects`), and for the selection Edit
 * (`PUT /projects/{id}`: name and description) and Files — which, like double-clicking a row,
 * opens the project's files page (`/projects/:id`).
 */
@Component({
  selector: 'app-projects-page',
  standalone: true,
  imports: [DatePipe, FormsModule, LucideAngularModule, ThreePanelLayoutComponent, TwangButtonComponent, TwangInputComponent, TwangTableComponent],
  template: `
    <app-three-panel-layout
      [showLeft]="false"
      [rightTitle]="mode() === 'create' ? 'New project' : mode() === 'edit' ? 'Edit project' : (selected()?.name ?? 'Details')"
      storageKey="projects.layout"
      [rightWidth]="rightWidth"
      panelMinHeight="min-h-[70vh]"
    >
      <div middle class="flex flex-1 flex-col overflow-hidden rounded-lg border border-border bg-white">
        <div class="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
          <span class="text-sm font-semibold text-primary-600">Projects</span>
          <span class="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700">{{ projects().length }}</span>
          <twang-button
            class="ml-auto"
            variant="default"
            size="sm"
            icon="refresh-cw"
            ariaLabel="Refresh projects"
            title="Refresh projects"
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
              [rows]="projects()"
              [columns]="columns"
              [loading]="loading()"
              [fillContainerWidth]="true"
              [onRowClick]="onRowClick"
              [onRowDoubleClick]="openFiles"
              [rowClass]="rowClass"
              initialSortKey="updated_at"
              initialSortDir="desc"
              tableMinWidthClass="min-w-[760px]"
              emptyMessage="No projects yet — create one with New project."
            />
          }
        </div>
      </div>

      <div right class="flex flex-col gap-4 p-4 text-sm">
        @if (mode() !== 'view') {
          <!-- New / edit project -->
          <div class="flex flex-col gap-1.5">
            <label class="text-xs font-medium text-text-muted">Name</label>
            <twang-input placeholder="Project name" [ngModel]="name()" (ngModelChange)="name.set($event)" />
          </div>
          <div class="flex flex-col gap-1.5">
            <label class="text-xs font-medium text-text-muted">Description</label>
            <textarea
              rows="4"
              class="w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              placeholder="Optional"
              [value]="description()"
              (input)="description.set($any($event.target).value)"
            ></textarea>
          </div>
          @if (mode() === 'create') {
            <div class="flex flex-col gap-1.5">
              <label class="text-xs font-medium text-text-muted">Embedding model</label>
              <twang-input placeholder="Server default" [mono]="true" [ngModel]="embeddingModel()" (ngModelChange)="embeddingModel.set($event)" />
            </div>
            <section class="flex flex-col gap-2 border-t border-border pt-3">
              <span class="text-xs font-semibold uppercase tracking-wider text-primary-600">Chunking</span>
              <div class="grid grid-cols-[7rem_1fr] items-center gap-x-3 gap-y-2">
                <label class="text-xs text-text-muted">Max tokens</label>
                <twang-input type="number" min="1" step="50" [placeholder]="'' + defaultMaxTokens" [ngModel]="maxTokens()" (ngModelChange)="maxTokens.set('' + ($event ?? ''))" />
                <label class="text-xs text-text-muted">Overlap tokens</label>
                <twang-input type="number" min="0" step="10" [placeholder]="'' + defaultOverlapTokens" [ngModel]="overlapTokens()" (ngModelChange)="overlapTokens.set('' + ($event ?? ''))" />
              </div>
              @if (chunkError(); as err) {
                <span class="text-xs text-red-600">{{ err }}</span>
              } @else {
                <span class="text-xs text-text-muted">Leave blank for the defaults ({{ defaultMaxTokens }} / {{ defaultOverlapTokens }}).</span>
              }
            </section>
          } @else if (selected(); as p) {
            <!-- Fixed once created: changing them would invalidate the indexed chunks. -->
            <dl class="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 border-t border-border pt-3 text-text-muted">
              <dt class="text-xs">Embedding model</dt>
              <dd class="break-all font-mono text-xs">{{ p.embedding_model }}</dd>
              <dt class="text-xs">Chunking</dt>
              <dd class="text-xs">{{ p.chunk_config.max_tokens }} / {{ p.chunk_config.overlap_tokens }} tokens</dd>
            </dl>
          }
          @if (saveError()) {
            <div class="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
              <lucide-icon name="circle-alert" [size]="14" class="mt-0.5 shrink-0" />
              <span class="min-w-0 flex-1 break-words">{{ saveError() }}</span>
            </div>
          }
          <div class="flex items-center justify-end gap-2 border-t border-border pt-3">
            <twang-button variant="default" size="sm" label="Cancel" [disabled]="saving()" (buttonClick)="cancel()" />
            <twang-button
              variant="primary"
              size="sm"
              [icon]="mode() === 'create' ? 'plus' : 'check'"
              [label]="mode() === 'create' ? 'Create project' : 'Save'"
              [loading]="saving()"
              [disabled]="saving() || !name().trim() || (mode() === 'create' && !!chunkError()) || (mode() === 'edit' && !editDirty())"
              (buttonClick)="save()"
            />
          </div>
        } @else if (selected(); as p) {
          <dl class="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2">
            <dt class="text-xs text-text-muted">Name</dt>
            <dd class="break-words font-medium">{{ p.name }}</dd>
            <dt class="text-xs text-text-muted">Embedding model</dt>
            <dd class="break-all font-mono text-xs">{{ p.embedding_model }}</dd>
            <dt class="text-xs text-text-muted">Created</dt>
            <dd>{{ p.created_at | date: dateFormat }}</dd>
            <dt class="text-xs text-text-muted">Updated</dt>
            <dd>{{ p.updated_at | date: dateFormat }}</dd>
          </dl>
          <section class="flex flex-col gap-2 border-t border-border pt-4">
            <span class="text-xs font-semibold uppercase tracking-wider text-primary-600">Chunking</span>
            <dl class="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2">
              <dt class="text-xs text-text-muted">Max tokens</dt>
              <dd>{{ p.chunk_config.max_tokens }}</dd>
              <dt class="text-xs text-text-muted">Overlap tokens</dt>
              <dd>{{ p.chunk_config.overlap_tokens }}</dd>
            </dl>
          </section>
          <section class="flex flex-col gap-2 border-t border-border pt-4">
            <span class="text-xs font-semibold uppercase tracking-wider text-primary-600">Description</span>
            <p class="whitespace-pre-wrap" [class.text-text-muted]="!p.description">{{ p.description || 'None.' }}</p>
          </section>
        } @else {
          <p class="text-text-muted">Select a project to see its details, or use New project.</p>
        }
      </div>
    </app-three-panel-layout>

    <!-- Rendered in the page header (right side) via PageBreadcrumbs.actions. -->
    <ng-template #headerActions>
      @if (selected(); as p) {
        <twang-button variant="default" size="sm" icon="square-pen" label="Edit" [disabled]="mode() !== 'view'" (buttonClick)="startEdit(p)" />
        <twang-button variant="default" size="sm" icon="file-text" label="Files" title="Files and search for this project" (buttonClick)="openFiles(p)" />
      }
      <twang-button variant="primary" size="sm" icon="plus" label="New project" [disabled]="mode() !== 'view'" (buttonClick)="startCreate()" />
    </ng-template>
  `,
})
export class ProjectsPageComponent {
  private readonly projectService = inject(ProjectService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly headerActions = viewChild<TemplateRef<unknown>>('headerActions');

  protected readonly rightWidth = ADMIN_RIGHT_WIDTH;
  protected readonly dateFormat = DATE_FORMAT;
  protected readonly defaultMaxTokens = DEFAULT_MAX_TOKENS;
  protected readonly defaultOverlapTokens = DEFAULT_OVERLAP_TOKENS;

  protected readonly projects = signal<Project[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly selectedId = signal<string | null>(null);
  protected readonly selected = computed(() => this.projects().find(p => p.id === this.selectedId()) ?? null);

  /** Right panel: the selection's details, or the create / edit form. */
  protected readonly mode = signal<'view' | 'create' | 'edit'>('view');
  protected readonly name = signal('');
  protected readonly description = signal('');
  protected readonly embeddingModel = signal('');
  protected readonly maxTokens = signal('');
  protected readonly overlapTokens = signal('');
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);

  /** Edit: whether name or description differ from the saved project. */
  protected readonly editDirty = computed(() => {
    const p = this.selected();
    return !!p && (this.name().trim() !== p.name || (this.description().trim() || null) !== (p.description ?? null));
  });

  /** Create: the chunk config to send — null for the server default — or an error message. */
  private readonly chunkConfig = computed(() => {
    const max = parseCount(this.maxTokens());
    const overlap = parseCount(this.overlapTokens());
    if (max === null && overlap === null) return { config: null, error: null };
    if (Number.isNaN(max) || Number.isNaN(overlap)) return { config: null, error: 'Token counts must be whole numbers.' };
    const config = { max_tokens: max ?? DEFAULT_MAX_TOKENS, overlap_tokens: overlap ?? DEFAULT_OVERLAP_TOKENS };
    if (config.max_tokens < 1) return { config: null, error: 'Max tokens must be at least 1.' };
    if (config.overlap_tokens >= config.max_tokens) return { config: null, error: 'Overlap must be smaller than max tokens.' };
    return { config, error: null };
  });
  protected readonly chunkError = computed(() => this.chunkConfig().error);

  protected readonly onRowClick = (row: Project) => {
    this.selectedId.set(row.id);
    this.mode.set('view');
  };
  /** Files page for a project (also row double-click). */
  protected readonly openFiles = (row: Project) => this.router.navigate(['/projects', row.id]);
  protected readonly rowClass = (row: Project) => (row.id === this.selectedId() ? 'bg-primary-50' : '');

  protected readonly columns: TwangTableColumn<Project>[] = [
    { id: 'name', header: 'Name', align: 'left', sortable: true, width: '220px', cellTruncate: true, value: p => p.name },
    { id: 'description', header: 'Description', align: 'left', sortable: false, fillRemaining: true, minWidth: '200px', cellTruncate: true, value: p => p.description ?? '' },
    { id: 'embedding_model', header: 'Embedding model', align: 'left', sortable: true, width: '200px', cellTruncate: true, value: p => p.embedding_model },
    { id: 'updated_at', header: 'Updated', align: 'left', sortable: true, width: '170px', value: p => p.updated_at, format: v => formatWhen(v) },
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
    this.projectService
      .getProjects()
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: projects => {
          this.projects.set(projects);
          // Keep the selection if it's still there; otherwise select the most recently updated.
          if (this.selected()) return;
          const first = [...projects].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
          this.selectedId.set(first?.id ?? null);
        },
        error: err => {
          console.error('Failed to load projects', err);
          this.error.set(errorText(err, 'Failed to load projects.'));
        },
      });
  }

  protected startCreate(): void {
    this.name.set('');
    this.description.set('');
    this.embeddingModel.set('');
    this.maxTokens.set('');
    this.overlapTokens.set('');
    this.saveError.set(null);
    this.mode.set('create');
  }

  protected startEdit(project: Project): void {
    this.name.set(project.name);
    this.description.set(project.description ?? '');
    this.saveError.set(null);
    this.mode.set('edit');
  }

  protected cancel(): void {
    this.mode.set('view');
    this.saveError.set(null);
  }

  protected save(): void {
    const name = this.name().trim();
    if (!name) return;
    const description = this.description().trim() || null;
    let request$: Observable<Project>;
    if (this.mode() === 'create') {
      const { config, error } = this.chunkConfig();
      if (error) return;
      const request: ProjectCreateRequest = { name };
      const embeddingModel = this.embeddingModel().trim();
      if (description) request.description = description;
      if (embeddingModel) request.embedding_model = embeddingModel;
      if (config) request.chunk_config = config;
      request$ = this.projectService.createProject(request);
    } else {
      const project = this.selected();
      if (!project) return;
      request$ = this.projectService.updateProject(project.id, { name, description });
    }

    this.saving.set(true);
    this.saveError.set(null);
    request$
      .pipe(
        finalize(() => this.saving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: project => {
          this.projects.update(list => [...list.filter(p => p.id !== project.id), project]);
          this.selectedId.set(project.id);
          this.mode.set('view');
        },
        error: err => {
          console.error('Failed to save project', err);
          this.saveError.set(errorText(err, 'Failed to save the project.'));
        },
      });
  }
}
