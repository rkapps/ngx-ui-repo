import { formatDate } from '@angular/common';
import { Component, DestroyRef, effect, inject, signal, type TemplateRef, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { type Conversation, ConversationService, PageBreadcrumbs } from 'ngx-common';
import { TwangButtonComponent, TwangTableComponent, type TwangTableColumn } from 'ngx-twang-ui';
import { finalize } from 'rxjs';

const formatWhen = (iso: string | number | null) => (iso ? formatDate(iso, 'MMM d, y, HH:mm', 'en-US') : '—');

/** All conversations: the signed-in user's conversations, newest first; a row opens it. */
@Component({
  selector: 'app-conversations',
  standalone: true,
  imports: [TwangButtonComponent, TwangTableComponent],
  template: `
    <div class="flex flex-col overflow-hidden rounded-lg border border-border bg-white">
      <div class="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
        <span class="text-sm font-semibold text-primary-600">Conversations</span>
        <span class="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700">{{ conversations().length }}</span>
        <twang-button
          class="ml-auto"
          variant="default"
          size="sm"
          icon="refresh-cw"
          ariaLabel="Refresh conversations"
          title="Refresh conversations"
          [loading]="loading()"
          [disabled]="loading()"
          (buttonClick)="load()"
        />
      </div>
      @if (error()) {
        <div class="flex items-center justify-center p-8 text-sm text-red-600">{{ error() }}</div>
      } @else {
        <twang-table
          [rows]="conversations()"
          [columns]="columns"
          [loading]="loading()"
          [fillContainerWidth]="true"
          [onRowClick]="open"
          initialSortKey="updated"
          initialSortDir="desc"
          tableMinWidthClass="min-w-[1350px]"
          emptyMessage="No conversations yet — start one with New conversation."
        />
      }
    </div>

    <!-- Rendered in the page header (right side) via PageBreadcrumbs.actions. -->
    <ng-template #headerActions>
      <twang-button variant="primary" size="sm" icon="message-square-plus" label="New conversation" (buttonClick)="router.navigate(['/conversations', 'new'])" />
    </ng-template>
  `,
})
export default class ConversationsComponent {
  private readonly conversationService = inject(ConversationService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly router = inject(Router);
  private readonly headerActions = viewChild<TemplateRef<unknown>>('headerActions');

  /** Shared with the sidebar's recent list, so both stay in step. */
  protected readonly conversations = this.conversationService.conversations;
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly open = (row: Conversation) => this.router.navigate(['/conversations', row.id]);

  protected readonly columns: TwangTableColumn<Conversation>[] = [
    { id: 'title', header: 'Title', align: 'left', sortable: true, fillRemaining: true, minWidth: '240px', cellTruncate: true, value: c => c.title || 'Untitled' },
    { id: 'agent', header: 'Agent', align: 'left', sortable: true, width: '320px', cellTruncate: true, value: c => c.agent_id },
    { id: 'llm', header: 'Provider', align: 'left', sortable: true, width: '130px', cellTruncate: true, value: c => c.llm },
    { id: 'model', header: 'Model', align: 'left', sortable: true, width: '200px', cellTruncate: true, value: c => c.model },
    { id: 'strategy', header: 'Strategy', align: 'left', sortable: true, width: '120px', cellTruncate: true, value: c => c.strategy },
    { id: 'updated', header: 'Updated', align: 'left', sortable: true, width: '170px', value: c => c.last_updated_at, format: v => formatWhen(v) },
    {
      id: 'tokens',
      header: 'Tokens',
      align: 'right',
      sortable: true,
      width: '110px',
      value: c => c.usage?.total_tokens ?? null,
      format: v => (v == null ? '—' : Number(v).toLocaleString('en-US')),
    },
    { id: 'cost', header: 'Cost', align: 'right', sortable: true, width: '100px', value: c => c.total_tokens_cost, format: v => (v ? `$${Number(v).toFixed(4)}` : '—') },
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
    this.conversationService
      .getConversations()
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        error: err => {
          console.error('Failed to load conversations', err);
          this.error.set('Failed to load conversations.');
        },
      });
  }
}
