import { Component, computed, DestroyRef, effect, inject, input, signal, type TemplateRef, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { TwangButtonComponent, TwangInputComponent, TwangTableComponent, type TwangTableColumn } from 'ngx-twang-ui';
import { concatMap, finalize, from, type Subscription, tap } from 'rxjs';
import { type Project, type ProjectFile, type ProjectFileStatus, type ProjectSearchResult, ProjectService } from '../../services/project.service';
import { PageBreadcrumbs } from '../breadcrumbs/page-breadcrumbs';
import { ThreePanelLayoutComponent } from '../three-panel-layout/three-panel-layout.component';
import { errorText, formatWhen } from './project-utils';

/** Status text colour per file status. */
const FILE_STATUS_CLASS: Record<ProjectFileStatus, string> = {
  uploaded: 'text-text-muted',
  processing: 'text-amber-700',
  indexed: 'text-green-700',
  failed: 'text-red-700',
};

/** The backend trims file descriptions to this many characters. */
const MAX_DESCRIPTION = 200;

/** 1536 → "1.5 KB". */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let size = bytes / 1024;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }
  return `${size.toFixed(size < 10 ? 1 : 0)} ${units[unit]}`;
}

/** Why an upload failed: the backend's text, else the HTTP status. */
function uploadErrorText(err: unknown): string {
  const e = err as { status?: number; statusText?: string; error?: unknown };
  if (typeof e?.error === 'string' && e.error.trim()) return e.error;
  if (e?.status === 413) return 'the file is larger than the server accepts.';
  if (e?.status === 0) return "couldn't reach the server.";
  return e?.status ? `HTTP ${e.status}${e.statusText ? ` ${e.statusText}` : ''}.` : 'upload failed.';
}

/**
 * A project's files (`/projects/:id`): the files table in the middle (`GET /projects/{id}/files`),
 * Upload in the page header (PDFs, one at a time, `POST /projects/{id}/files`), and Search in the
 * right panel (`GET /projects/{id}/search`). The list reloads on open, after uploads, and on refresh.
 */
@Component({
  selector: 'app-project-files-page',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, ThreePanelLayoutComponent, TwangButtonComponent, TwangInputComponent, TwangTableComponent],
  template: `
    <app-three-panel-layout
      [showLeft]="false"
      [rightTitle]="pending().length ? 'Upload files' : 'Search'"
      storageKey="projects.files.layout"
      rightWidth="w-[32rem]"
      panelMinHeight="min-h-[70vh]"
    >
      <div middle class="flex flex-1 flex-col overflow-hidden rounded-lg border border-border bg-white">
        <div class="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
          <span class="text-sm font-semibold text-primary-600">Files</span>
          <span class="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700">{{ files().length }}</span>
          @if (project(); as p) {
            <span class="truncate text-xs text-text-muted">{{ p.embedding_model }} · {{ p.chunk_config.max_tokens }} / {{ p.chunk_config.overlap_tokens }} tokens</span>
          }
          <twang-button
            class="ml-auto"
            variant="default"
            size="sm"
            icon="refresh-cw"
            ariaLabel="Refresh files"
            title="Refresh files"
            [loading]="filesLoading()"
            [disabled]="filesLoading() || !!uploading()"
            (buttonClick)="loadFiles()"
          />
        </div>
        @if (filesError()) {
          <div class="flex shrink-0 items-start gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
            <lucide-icon name="circle-alert" [size]="14" class="mt-0.5 shrink-0" />
            <span class="min-w-0 flex-1 break-words">{{ filesError() }}</span>
          </div>
        }
        <div class="flex min-h-0 flex-1 flex-col">
          <twang-table
            [rows]="files()"
            [columns]="columns"
            [loading]="filesLoading()"
            [fillContainerWidth]="true"
            initialSortKey="created_at"
            initialSortDir="desc"
            tableMinWidthClass="min-w-[760px]"
            emptyMessage="No files yet — use Upload to add PDFs."
          />
        </div>
      </div>

      <!-- Right: search over the project's indexed chunks (for testing). Exactly the panel's height:
           the query stays at the top and only the results scroll. -->
      <div right class="flex min-h-0 flex-1 flex-col text-sm">
        @if (pending().length) {
          <!-- Upload: a required description per chosen file, then upload them one at a time. -->
          <div class="min-h-0 flex-1 overflow-y-auto p-4">
            <ul class="flex flex-col gap-3">
              @for (p of pending(); track p.key) {
                <li class="flex flex-col gap-1.5 rounded-md border border-border p-2.5">
                  <div class="flex items-center gap-2 text-xs">
                    <lucide-icon name="file-text" [size]="14" class="shrink-0 text-text-muted" />
                    <span class="min-w-0 flex-1 truncate font-medium" [title]="p.file.name">{{ p.file.name }}</span>
                    <span class="shrink-0 text-text-muted">{{ formatSize(p.file.size) }}</span>
                    <button
                      type="button"
                      class="flex h-6 w-6 shrink-0 items-center justify-center rounded text-text-muted hover:bg-surface-muted hover:text-text disabled:opacity-40"
                      title="Remove"
                      aria-label="Remove file"
                      [disabled]="!!uploading()"
                      (click)="removePending(p.key)"
                    >
                      <lucide-icon name="x" [size]="14" />
                    </button>
                  </div>
                  <textarea
                    rows="2"
                    [attr.maxlength]="maxDescription"
                    class="w-full resize-y rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-text placeholder:text-text-muted focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                    placeholder="Describe this file (required)"
                    [value]="p.description"
                    [disabled]="!!uploading()"
                    (input)="setDescription(p.key, $any($event.target).value)"
                  ></textarea>
                  <span class="self-end text-[10px] tabular-nums text-text-muted">{{ p.description.length }}/{{ maxDescription }}</span>
                </li>
              }
            </ul>
          </div>
          <div class="flex shrink-0 flex-col gap-2 border-t border-border p-4">
            @if (uploadError()) {
              <div class="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                <lucide-icon name="circle-alert" [size]="14" class="mt-0.5 shrink-0" />
                <span class="min-w-0 flex-1 break-words">{{ uploadError() }}</span>
              </div>
            }
            <div class="flex items-center gap-2">
              @if (uploading(); as u) {
                <span class="min-w-0 flex-1 truncate text-xs text-text-muted">Uploading {{ u.done + 1 }} of {{ u.total }}: {{ u.name }}…</span>
              } @else {
                <span class="min-w-0 flex-1 text-xs text-text-muted">{{ pending().length }} file{{ pending().length === 1 ? '' : 's' }}</span>
              }
              <twang-button variant="default" size="sm" label="Cancel" [disabled]="!!uploading()" (buttonClick)="cancelUpload()" />
              <twang-button
                variant="primary"
                size="sm"
                icon="upload"
                label="Upload"
                [loading]="!!uploading()"
                [disabled]="!!uploading() || !pendingReady()"
                (buttonClick)="uploadPending()"
              />
            </div>
          </div>
        } @else {
          <div class="flex shrink-0 flex-col gap-3 border-b border-border p-4">
            <div class="flex flex-col gap-1.5">
              <label class="text-xs font-medium text-text-muted">Query</label>
              <twang-input placeholder="What are you looking for?" [ngModel]="query()" (ngModelChange)="query.set($event)" (keydown.enter)="search()" />
            </div>
            <div class="flex items-end gap-2">
              <div class="flex w-24 flex-col gap-1.5">
                <label class="text-xs font-medium text-text-muted">Top K</label>
                <twang-input type="number" min="1" step="1" placeholder="5" [ngModel]="topK()" (ngModelChange)="topK.set('' + ($event ?? ''))" />
              </div>
              @if (searchResults(); as results) {
                <span class="pb-2 text-xs text-text-muted">{{ results.length }} result{{ results.length === 1 ? '' : 's' }}</span>
              }
              <twang-button
                class="ml-auto"
                variant="primary"
                size="sm"
                icon="search"
                label="Search"
                [loading]="searching()"
                [disabled]="searching() || !query().trim()"
                (buttonClick)="search()"
              />
            </div>
            @if (searchError()) {
              <div class="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                <lucide-icon name="circle-alert" [size]="14" class="mt-0.5 shrink-0" />
                <span class="min-w-0 flex-1 break-words">{{ searchError() }}</span>
              </div>
            }
          </div>

          <div class="min-h-0 flex-1 overflow-y-auto p-4">
            @if (searchResults(); as results) {
              @if (results.length) {
                <ol class="flex flex-col gap-2">
                  @for (r of results; track r.chunk_id; let i = $index) {
                    @let open = expanded().has(r.chunk_id);
                    <li class="overflow-hidden rounded-md border border-border">
                      <button
                        type="button"
                        class="flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs hover:bg-surface-muted"
                        [class.bg-surface-muted]="open"
                        [attr.aria-expanded]="open"
                        (click)="toggleResult(r.chunk_id)"
                      >
                        <lucide-icon name="chevron-right" [size]="14" class="shrink-0 text-text-muted transition-transform" [class.rotate-90]="open" />
                        <span class="shrink-0 tabular-nums text-text-muted">{{ i + 1 }}.</span>
                        <span class="min-w-0 flex-1 truncate">
                          <span class="font-medium" [title]="r.file_name">{{ r.file_name }}</span>
                          <span class="text-text-muted"> · p{{ r.page }} · #{{ r.seq }}</span>
                        </span>
                        <span class="shrink-0 rounded bg-primary-50 px-1.5 py-0.5 font-mono tabular-nums text-primary-700" title="Cosine similarity">
                          {{ r.score.toFixed(3) }}
                        </span>
                      </button>
                      @if (open) {
                        <p class="whitespace-pre-wrap border-t border-border px-2.5 py-2 text-xs leading-relaxed text-text">{{ r.text }}</p>
                      }
                    </li>
                  }
                </ol>
              } @else {
                <p class="text-text-muted">No matches.</p>
              }
            } @else {
              <p class="text-text-muted">Search the project's indexed chunks.</p>
            }
          </div>
        }
      </div>
    </app-three-panel-layout>

    <!-- Rendered in the page header (right side) via PageBreadcrumbs.actions. -->
    <ng-template #headerActions>
      <input #fileInput type="file" multiple accept=".pdf,application/pdf" class="hidden" (change)="choose(fileInput)" />
      <twang-button
        variant="primary"
        size="sm"
        icon="upload"
        label="Upload"
        title="Choose PDF files to upload — each needs a description"
        [loading]="!!uploading()"
        [disabled]="!!uploading()"
        (buttonClick)="fileInput.click()"
      />
    </ng-template>
  `,
})
export class ProjectFilesPageComponent {
  /** Route `:id`. */
  readonly id = input.required<string>();

  private readonly projectService = inject(ProjectService);
  private readonly breadcrumbs = inject(PageBreadcrumbs);
  private readonly destroyRef = inject(DestroyRef);
  private readonly headerActions = viewChild<TemplateRef<unknown>>('headerActions');

  protected readonly project = signal<Project | null>(null);

  protected readonly files = signal<ProjectFile[]>([]);
  protected readonly filesLoading = signal(false);
  /** Loading the list failed (cleared by the next successful load). */
  protected readonly filesError = signal<string | null>(null);
  /** The last upload failed — shown in the upload form until the next attempt. */
  protected readonly uploadError = signal<string | null>(null);
  /** Files chosen for upload, each needing a description; while non-empty the right panel shows the upload form. */
  protected readonly pending = signal<{ key: number; file: File; description: string }[]>([]);
  protected readonly pendingReady = computed(() => this.pending().every(p => p.description.trim().length > 0));
  protected readonly maxDescription = MAX_DESCRIPTION;
  protected readonly formatSize = formatSize;
  private nextKey = 0;
  private readonly layout = viewChild(ThreePanelLayoutComponent);
  /** Upload in progress: which file of how many. */
  protected readonly uploading = signal<{ done: number; total: number; name: string } | null>(null);
  private filesSub?: Subscription;

  protected readonly query = signal('');
  protected readonly topK = signal('');
  protected readonly searching = signal(false);
  protected readonly searchError = signal<string | null>(null);
  /** Null until a search has run. */
  protected readonly searchResults = signal<ProjectSearchResult[] | null>(null);
  /** Results (by chunk id) whose text is shown; every new search starts all collapsed. */
  protected readonly expanded = signal<ReadonlySet<string>>(new Set());
  private searchSub?: Subscription;

  protected readonly columns: TwangTableColumn<ProjectFile>[] = [
    { id: 'name', header: 'Name', align: 'left', sortable: true, width: '240px', cellTruncate: true, value: f => f.name },
    { id: 'description', header: 'Description', align: 'left', sortable: false, fillRemaining: true, minWidth: '200px', cellTruncate: true, value: f => f.description ?? '' },
    { id: 'status', header: 'Status', align: 'left', sortable: true, width: '120px', value: f => f.status, cellClass: f => FILE_STATUS_CLASS[f.status] ?? '' },
    { id: 'chunks', header: 'Chunks', align: 'right', sortable: true, width: '100px', value: f => f.chunk_count },
    { id: 'size', header: 'Size', align: 'right', sortable: true, width: '100px', value: f => f.size, format: v => (v == null ? '' : formatSize(Number(v))) },
    { id: 'created_at', header: 'Uploaded', align: 'left', sortable: true, width: '170px', value: f => f.created_at, format: v => formatWhen(v) },
    { id: 'error', header: 'Error', align: 'left', sortable: false, width: '220px', cellTruncate: true, value: f => f.error ?? '', cellClass: 'text-red-700' },
  ];

  constructor() {
    effect(() => this.breadcrumbs.actions.set(this.headerActions() ?? null));
    // The project's name as the crumb after "Projects" (the id until it loads).
    effect(() => this.breadcrumbs.set([{ label: this.project()?.name ?? this.id() }]));
    this.destroyRef.onDestroy(() => {
      // Only drop what's still ours: the next page may already have set its own.
      if (this.breadcrumbs.actions() === this.headerActions()) this.breadcrumbs.actions.set(null);
      this.breadcrumbs.set([]);
      this.filesSub?.unsubscribe();
      this.searchSub?.unsubscribe();
    });

    effect(() => {
      const id = this.id();
      this.project.set(null);
      this.searchResults.set(null);
      this.projectService
        .getProject(id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({ next: p => this.project.set(p), error: err => console.error('Failed to load project', err) });
      this.loadFiles();
    });
  }

  protected loadFiles(): void {
    const id = this.id();
    this.filesSub?.unsubscribe();
    this.filesLoading.set(true);
    this.filesSub = this.projectService
      .getProjectFiles(id)
      .pipe(finalize(() => this.filesLoading.set(false)))
      .subscribe({
        next: files => {
          this.files.set(files);
          this.filesError.set(null);
        },
        error: err => {
          console.error('Failed to load project files', err);
          this.filesError.set(errorText(err, 'Failed to load files.'));
        },
      });
  }

  /** Add the chosen files to the upload form (each needs a description) and make sure it's visible. */
  protected choose(input: HTMLInputElement): void {
    const chosen = [...(input.files ?? [])];
    input.value = ''; // so choosing the same files again still fires (change)
    if (!chosen.length) return;
    this.uploadError.set(null);
    this.pending.update(list => [...list, ...chosen.map(file => ({ key: this.nextKey++, file, description: '' }))]);
    this.layout()?.expandRight();
  }

  protected setDescription(key: number, description: string): void {
    this.pending.update(list => list.map(p => (p.key === key ? { ...p, description } : p)));
  }

  protected removePending(key: number): void {
    this.pending.update(list => list.filter(p => p.key !== key));
  }

  protected cancelUpload(): void {
    this.pending.set([]);
    this.uploadError.set(null);
  }

  /**
   * Upload the form's files one after another, each with its description, stopping at the first
   * failure. Uploaded files leave the form (the failed one and the rest stay, to fix and retry);
   * the list reloads if any went up.
   */
  protected uploadPending(): void {
    const batch = this.pending();
    if (!batch.length || !this.pendingReady()) return;
    const id = this.id();
    this.uploadError.set(null);
    let uploaded = 0;
    from(batch)
      .pipe(
        concatMap(p => {
          this.uploading.set({ done: uploaded, total: batch.length, name: p.file.name });
          return this.projectService.uploadProjectFile(id, p.file, p.description.trim()).pipe(
            tap(() => {
              uploaded++;
              this.removePending(p.key);
            }),
          );
        }),
        finalize(() => {
          this.uploading.set(null);
          // Only reload when something actually changed.
          if (uploaded > 0) this.loadFiles();
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        error: err => {
          console.error('Failed to upload project file', err);
          const name = batch[uploaded]?.file.name ?? 'a file';
          this.uploadError.set(`Couldn't upload ${name}: ${uploadErrorText(err)}`);
        },
      });
  }


  protected toggleResult(chunkId: string): void {
    const next = new Set(this.expanded());
    if (next.has(chunkId)) next.delete(chunkId);
    else next.add(chunkId);
    this.expanded.set(next);
  }

  protected search(): void {
    const q = this.query().trim();
    if (!q) return;
    const k = this.topK().trim();
    const topK = /^\d+$/.test(k) && Number(k) > 0 ? Number(k) : null;
    this.searchSub?.unsubscribe();
    this.searching.set(true);
    this.searchError.set(null);
    this.searchSub = this.projectService
      .searchProject(this.id(), q, topK)
      .pipe(finalize(() => this.searching.set(false)))
      .subscribe({
        next: results => {
          this.expanded.set(new Set());
          this.searchResults.set([...results].sort((a, b) => b.score - a.score));
        },
        error: err => {
          console.error('Project search failed', err);
          this.searchResults.set(null);
          this.searchError.set(errorText(err, 'Search failed.'));
        },
      });
  }
}
