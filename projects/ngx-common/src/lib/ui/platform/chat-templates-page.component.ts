import { Component, computed, DestroyRef, effect, inject, signal, type TemplateRef, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LucideAngularModule } from 'lucide-angular';
import { TwangButtonComponent, TwangTableComponent, type TwangTableColumn } from 'ngx-twang-ui';
import { finalize } from 'rxjs';
import { AdminConfigService } from '../../services/admin-config.service';
import type { ChatTemplate } from '../../services/chat-template.service';
import { ADMIN_RIGHT_WIDTH } from '../admin-page/admin-layout';
import { PageBreadcrumbs } from '../breadcrumbs/page-breadcrumbs';
import { ThreePanelLayoutComponent } from '../three-panel-layout/three-panel-layout.component';

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Chat templates from an import file — the templates config's `{ "templates": [...] }`, a JSON
 * array, or a single template — or an error message.
 */
function parseTemplates(text: string): ChatTemplate[] | string {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return 'The file is not valid JSON.';
  }
  const wrapped = isObject(json) && Array.isArray(json['templates']) ? json['templates'] : json;
  const list = Array.isArray(wrapped) ? wrapped : [wrapped];
  if (!list.length) return 'The file has no templates.';
  for (const [i, t] of list.entries()) {
    const where = `Template ${i + 1}`;
    if (!isObject(t)) return `${where} is not an object.`;
    if (typeof t['id'] !== 'string' || !t['id']) return `${where} needs an "id".`;
    for (const key of ['category', 'title', 'description', 'recommended_llm', 'icon']) {
      if (typeof t[key] !== 'string') return `${where} (${t['id']}) needs "${key}".`;
    }
    if (t['system_prompt'] != null && typeof t['system_prompt'] !== 'string') return `${where} (${t['id']}): "system_prompt" must be a string or null.`;
    if (!Array.isArray(t['suggested_prompts']) || !t['suggested_prompts'].every(p => typeof p === 'string')) {
      return `${where} (${t['id']}) needs "suggested_prompts": a list of prompts.`;
    }
  }
  return list as ChatTemplate[];
}

/** Backend error text (axum returns plain strings), else a fallback. */
function errorText(err: unknown, fallback: string): string {
  const body = (err as { error?: unknown })?.error;
  return typeof body === 'string' && body.trim() ? body : fallback;
}

/**
 * Platform › Chat Templates: every chat template (`GET /platform/chat_templates`) in the middle,
 * the selected one in the right panel. Import (page header) loads the templates file and posts the
 * list to `/platform/chat_templates/import`.
 */
@Component({
  selector: 'app-chat-templates-page',
  standalone: true,
  imports: [LucideAngularModule, ThreePanelLayoutComponent, TwangButtonComponent, TwangTableComponent],
  template: `
    <app-three-panel-layout
      [showLeft]="false"
      [rightTitle]="selected()?.title ?? 'Details'"
      storageKey="platform.chat-templates.layout"
      [rightWidth]="rightWidth"
      panelMinHeight="min-h-[70vh]"
    >
      <div middle class="flex flex-1 flex-col overflow-hidden rounded-lg border border-border bg-white">
        <div class="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
          <span class="text-sm font-semibold text-primary-600">Chat Templates</span>
          <span class="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700">{{ templates().length }}</span>
          <twang-button
            class="ml-auto"
            variant="default"
            size="sm"
            icon="refresh-cw"
            ariaLabel="Refresh chat templates"
            title="Refresh chat templates"
            [loading]="loading()"
            [disabled]="loading()"
            (buttonClick)="load()"
          />
        </div>
        @if (importError()) {
          <div class="flex shrink-0 items-start gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
            <lucide-icon name="circle-alert" [size]="14" class="mt-0.5 shrink-0" />
            <span class="min-w-0 flex-1 break-words">{{ importError() }}</span>
            <button type="button" class="shrink-0 opacity-70 hover:opacity-100" aria-label="Dismiss" (click)="importError.set(null)">
              <lucide-icon name="x" [size]="14" />
            </button>
          </div>
        }
        <div class="flex min-h-0 flex-1 flex-col">
          @if (error()) {
            <div class="flex flex-1 items-center justify-center p-8 text-sm text-red-600">{{ error() }}</div>
          } @else {
            <twang-table
              [rows]="templates()"
              [columns]="columns"
              [loading]="loading()"
              [fillContainerWidth]="true"
              [onRowClick]="onRowClick"
              [rowClass]="rowClass"
              initialSortKey="category"
              initialSortDir="asc"
              tableMinWidthClass="min-w-[880px]"
              emptyMessage="No chat templates yet — use Import to load the templates file."
            />
          }
        </div>
      </div>

      <div right class="flex flex-col gap-4 p-4 text-sm">
        @if (selected(); as t) {
          <dl class="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2">
            <dt class="text-xs text-text-muted">ID</dt>
            <dd class="break-all font-mono text-xs">{{ t.id }}</dd>
            <dt class="text-xs text-text-muted">Category</dt>
            <dd>{{ t.category }}</dd>
            <dt class="text-xs text-text-muted">Recommended LLM</dt>
            <dd class="break-all">{{ t.recommended_llm || '—' }}</dd>
            <dt class="text-xs text-text-muted">Icon</dt>
            <dd class="flex items-center gap-1.5 font-mono text-xs">
              <lucide-icon [name]="t.icon" [size]="14" class="shrink-0 text-primary-600" />
              {{ t.icon }}
            </dd>
          </dl>
          <section class="flex flex-col gap-2 border-t border-border pt-4">
            <span class="text-xs font-semibold uppercase tracking-wider text-primary-600">Description</span>
            <p class="whitespace-pre-wrap">{{ t.description || 'None.' }}</p>
          </section>
          <section class="flex flex-col gap-2 border-t border-border pt-4">
            <span class="text-xs font-semibold uppercase tracking-wider text-primary-600">Suggested prompts · {{ t.suggested_prompts.length }}</span>
            @if (t.suggested_prompts.length) {
              <ul class="flex flex-col gap-1.5">
                @for (prompt of t.suggested_prompts; track $index) {
                  <li class="rounded-md bg-surface-muted px-2.5 py-1.5 text-xs">{{ prompt }}</li>
                }
              </ul>
            } @else {
              <p class="text-text-muted">None.</p>
            }
          </section>
          <section class="flex flex-col gap-2 border-t border-border pt-4">
            <span class="text-xs font-semibold uppercase tracking-wider text-primary-600">System prompt</span>
            @if (t.system_prompt) {
              <pre class="max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-surface-muted p-3 text-xs">{{ t.system_prompt }}</pre>
            } @else {
              <p class="text-text-muted">None.</p>
            }
          </section>
        } @else {
          <p class="text-text-muted">Select a template to see its details.</p>
        }
      </div>
    </app-three-panel-layout>

    <!-- Rendered in the page header (right side) via PageBreadcrumbs.actions. -->
    <ng-template #headerActions>
      <input #importFile type="file" accept=".json,application/json" class="hidden" (change)="importFrom(importFile)" />
      <twang-button
        variant="primary"
        size="sm"
        icon="upload"
        label="Import"
        title="Import chat templates from the templates file ({ &quot;templates&quot;: [...] }, an array, or one template)"
        [loading]="importing()"
        [disabled]="importing()"
        (buttonClick)="importFile.click()"
      />
    </ng-template>
  `,
})
export class ChatTemplatesPageComponent {
  private readonly configService = inject(AdminConfigService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly headerActions = viewChild<TemplateRef<unknown>>('headerActions');

  protected readonly rightWidth = ADMIN_RIGHT_WIDTH;

  protected readonly templates = signal<ChatTemplate[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly importing = signal(false);
  protected readonly importError = signal<string | null>(null);

  protected readonly selectedId = signal<string | null>(null);
  protected readonly selected = computed(() => this.templates().find(t => t.id === this.selectedId()) ?? null);

  protected readonly onRowClick = (row: ChatTemplate) => this.selectedId.set(row.id);
  protected readonly rowClass = (row: ChatTemplate) => (row.id === this.selectedId() ? 'bg-primary-50' : '');

  protected readonly columns: TwangTableColumn<ChatTemplate>[] = [
    { id: 'title', header: 'Title', align: 'left', sortable: true, fillRemaining: true, minWidth: '220px', cellTruncate: true, value: t => t.title },
    { id: 'category', header: 'Category', align: 'left', sortable: true, width: '160px', cellTruncate: true, value: t => t.category },
    { id: 'recommended_llm', header: 'Recommended LLM', align: 'left', sortable: true, width: '180px', cellTruncate: true, value: t => t.recommended_llm },
    { id: 'prompts', header: 'Prompts', align: 'right', sortable: true, width: '100px', value: t => t.suggested_prompts.length },
    { id: 'id', header: 'ID', align: 'left', sortable: true, width: '180px', cellTruncate: true, value: t => t.id },
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
    this.configService
      .getChatTemplates()
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: templates => {
          this.templates.set(templates);
          // Keep the selection if it's still there; otherwise select the first (category, then title).
          if (this.selected()) return;
          const first = [...templates].sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title))[0];
          this.selectedId.set(first?.id ?? null);
        },
        error: err => {
          console.error('Failed to load chat templates', err);
          this.error.set(errorText(err, 'Failed to load chat templates.'));
        },
      });
  }

  /** Import the chosen JSON file (`POST /platform/chat_templates/import`), then reload. */
  protected importFrom(input: HTMLInputElement): void {
    const file = input.files?.[0];
    input.value = ''; // so choosing the same file again still fires (change)
    if (!file) return;
    this.importError.set(null);
    file.text().then(text => {
      const parsed = parseTemplates(text);
      if (typeof parsed === 'string') {
        this.importError.set(`Couldn't import ${file.name}: ${parsed}`);
        return;
      }
      this.importing.set(true);
      this.configService
        .importChatTemplates(parsed)
        .pipe(
          finalize(() => this.importing.set(false)),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe({
          next: () => this.load(),
          error: err => {
            console.error('Failed to import chat templates', err);
            this.importError.set(errorText(err, 'Failed to import chat templates.'));
          },
        });
    });
  }
}
