import { Component, computed, DestroyRef, effect, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { Location, TitleCasePipe } from '@angular/common';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map, startWith, timeout, TimeoutError } from 'rxjs';
import { LucideAngularModule } from 'lucide-angular';
import { TwangTreeDropdownComponent } from 'ngx-twang-ui';
import type { TwangTreeDropdownNode } from 'ngx-twang-ui';
import { PageLayoutComponent } from '../page-layout/page-layout.component';
import { ConversationService, type Conversation } from '../../services/conversation.service';

const SELECTED_KEY = 'agents.selectedId';
const FILTER_OPEN_KEY = 'agents.filtersOpen';
const FILTER_TITLES_KEY = 'agents.filterTitles';
const FILTER_LLMS_KEY = 'agents.filterLlms';

function readJson<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? '') as T; } catch { return fallback; }
}

@Component({
  selector: 'app-agents-page',
  standalone: true,
  imports: [LucideAngularModule, TwangTreeDropdownComponent, PageLayoutComponent, RouterOutlet, TitleCasePipe],
  host: { class: 'flex flex-1 flex-col min-h-0 overflow-hidden' },
  template: `
    <app-page-layout class="flex h-full flex-col" expandedWidth="w-96" storageKey="layout.chat" panelTitle="Conversations"
      [mobileShowContent]="hasChild() ? true : false"
      (mobileBack)="backToList()"
    >
      <button
        panel-action
        class="flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
        title="New conversation"
        (click)="newConversation()"
      >
        <lucide-icon name="square-pen" [size]="15" />
      </button>
      <button
        panel-action
        class="flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-muted hover:text-text disabled:opacity-40"
        title="Refresh"
        [disabled]="refreshing()"
        (click)="refresh()"
      >
        <lucide-icon name="refresh-cw" [size]="15" [class.animate-spin]="refreshing()" />
      </button>

      <div sidebar class="flex flex-col gap-1 p-2 md:p-3">
        <!-- Filter toggle -->
        <div class="mb-1 border-b border-border">
          <button
            type="button"
            class="flex w-full items-center gap-1.5 px-1 py-1.5 text-xs font-medium text-text-muted hover:text-text transition-colors"
            (click)="filtersOpen.set(!filtersOpen())"
          >
            <lucide-icon name="sliders-horizontal" [size]="13" class="shrink-0" />
            <span class="flex-1 text-left">Filters</span>
            @if (activeFilterCount() > 0) {
              <span class="rounded-full bg-primary-100 px-1.5 py-0.5 text-[10px] font-semibold text-primary-700">
                {{ activeFilterCount() }}
              </span>
            }
            <lucide-icon
              name="chevron-down"
              [size]="13"
              class="shrink-0 transition-transform duration-200"
              [class.rotate-180]="filtersOpen()"
            />
          </button>
          <!-- Collapsible body -->
          <div
            class="overflow-hidden transition-[max-height] duration-200 ease-in-out"
            [class]="filtersOpen() ? 'max-h-72' : 'max-h-0'"
          >
            <div class="flex flex-col gap-2 pb-2.5 pt-1">
              <div class="flex flex-col gap-1">
                <span class="px-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">Title</span>
                <twang-tree-dropdown
                  [nodes]="titleNodes()"
                  [multiselect]="true"
                  [checkbox]="true"
                  placeholder="All titles"
                  size="sm"
                  [(selected)]="filterTitles"
                />
              </div>
              <div class="flex flex-col gap-1">
                <span class="px-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">LLM</span>
                <twang-tree-dropdown
                  [nodes]="llmNodes()"
                  [multiselect]="true"
                  [checkbox]="true"
                  placeholder="All LLMs"
                  size="sm"
                  [(selected)]="filterLlms"
                />
              </div>
            </div>
          </div>
        </div>

        @if (loadingConvs()) {
          <div class="flex items-center justify-center py-8">
            <lucide-icon name="loader-circle" [size]="20" class="animate-spin text-text-muted" />
          </div>
        } @else if (error()) {
          <div class="px-2 py-4">
            <p class="text-xs text-danger-600">{{ error() }}</p>
            <button class="mt-2 text-xs text-primary-600 underline hover:text-primary-700" (click)="refresh()">Try again</button>
          </div>
        } @else {
          @for (conv of filteredConversations(); track conv.id) {
            <button
              class="flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
              [class.bg-primary-50]="activeId() === conv.id"
              [class.ring-1]="activeId() === conv.id"
              [class.ring-primary-200]="activeId() === conv.id"
              (click)="select(conv)"
            >
              <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-700">
                {{ initials(conv.title) }}
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5">
                  <lucide-icon name="bot" [size]="14" class="shrink-0 text-primary-600" />
                  <p class="truncate text-sm font-medium text-text">{{ conv.title }}</p>
                </div>
                <div class="mt-1">
                  <span class="text-xs font-medium text-text-muted">
                    {{ conv.llm }} / {{ conv.model }} ({{ conv.strategy | titlecase }})
                  </span>
                </div>
              </div>
            </button>
          }
        }
      </div>

      <div content class="flex flex-1 flex-col min-h-0">
        <router-outlet />
        @if (!hasChild()) {
          <div class="flex min-h-full flex-col items-center justify-center gap-4 p-8">
            <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-600 ring-1 ring-primary-200">
              <lucide-icon name="bot" [size]="28" />
            </div>
            <div class="text-center">
              <h2 class="mb-1 text-xl font-bold text-text">Select a conversation</h2>
              <p class="text-sm text-text-muted">Choose one from the list or start a new one.</p>
            </div>
          </div>
        }
      </div>
    </app-page-layout>
  `,
})
export class AgentsPageComponent implements OnInit {
  private readonly conversationService = inject(ConversationService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly filtersOpen = signal(readJson<boolean>(FILTER_OPEN_KEY, false));
  protected readonly filterTitles = signal<string[]>(readJson<string[]>(FILTER_TITLES_KEY, []));
  protected readonly filterLlms = signal<string[]>(readJson<string[]>(FILTER_LLMS_KEY, []));
  protected readonly activeFilterCount = computed(() =>
    this.filterTitles().length + this.filterLlms().length
  );

  private readonly agentConversations = computed(() =>
    this.conversationService.conversations()
      .filter(c => c.conversation_type === 'agent')
      .sort((a, b) => a.title.localeCompare(b.title))
  );

  protected readonly titleNodes = computed<TwangTreeDropdownNode[]>(() =>
    [...new Set(this.agentConversations().map(c => c.title))].sort()
      .map(t => ({ id: t, label: t }))
  );

  protected readonly llmNodes = computed<TwangTreeDropdownNode[]>(() =>
    [...new Set(this.agentConversations().map(c => c.llm))].sort()
      .map(l => ({ id: l, label: l }))
  );

  protected readonly filteredConversations = computed(() => {
    const titles = this.filterTitles();
    const llms = this.filterLlms();
    return this.agentConversations().filter(c =>
      (!titles.length || titles.includes(c.title)) &&
      (!llms.length || llms.includes(c.llm))
    );
  });

  protected readonly loadingConvs = signal(true);
  protected readonly refreshing = signal(false);
  protected readonly error = signal('');

  protected readonly activeId = toSignal(
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      map(() => this.route.firstChild?.snapshot?.params?.['id'] ?? null),
      startWith(this.route.firstChild?.snapshot?.params?.['id'] ?? null),
    ),
    { initialValue: this.route.firstChild?.snapshot?.params?.['id'] ?? null }
  );

  protected readonly hasChild = toSignal(
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      map(() => !!this.route.firstChild),
      startWith(!!this.route.firstChild),
    ),
    { initialValue: !!this.route.firstChild }
  );

  constructor() {
    effect(() => localStorage.setItem(FILTER_OPEN_KEY, JSON.stringify(this.filtersOpen())));
    effect(() => localStorage.setItem(FILTER_TITLES_KEY, JSON.stringify(this.filterTitles())));
    effect(() => localStorage.setItem(FILTER_LLMS_KEY, JSON.stringify(this.filterLlms())));
  }

  protected backToList(): void {
    this.router.navigate(['/agents']);
  }

  protected newConversation(): void {
    this.location.replaceState('/agents');
    this.router.navigate(['/agents/new']);
  }

  protected refresh(): void {
    this.loadConversations(true);
  }

  ngOnInit(): void {
    const skipRestore = (history.state as { skipRestore?: boolean })?.skipRestore === true;

    this.conversationService.deleted$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.selectFirst());

    this.loadConversations(false, skipRestore);
  }

  private loadConversations(isRefresh: boolean, skipRestore = false): void {
    if (isRefresh) {
      this.refreshing.set(true);
    } else {
      this.loadingConvs.set(true);
    }

    this.conversationService.getConversations().pipe(
      timeout(15000),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: (data) => {
        this.loadingConvs.set(false);
        this.refreshing.set(false);
        if (isRefresh) {
          this.selectFirst();
        } else {
          const currentId = this.route.firstChild?.snapshot.params?.['id'];
          if (currentId) {
            sessionStorage.setItem(SELECTED_KEY, currentId);
          } else if (!skipRestore) {
            const savedId = sessionStorage.getItem(SELECTED_KEY);
            if (savedId && data.find(c => c.id === savedId)) {
              this.router.navigate([savedId], { relativeTo: this.route, replaceUrl: true });
            }
          }
        }
      },
      error: (err) => {
        this.error.set(err instanceof TimeoutError ? 'Request timed out. Please try again.' : 'Failed to load conversations.');
        this.loadingConvs.set(false);
        this.refreshing.set(false);
      },
    });
  }

  private selectFirst(): void {
    const first = this.filteredConversations()[0];
    if (first) this.select(first);
    else this.router.navigate(['/agents']);
  }

  protected select(conv: Conversation): void {
    sessionStorage.setItem(SELECTED_KEY, conv.id);
    this.router.navigate([conv.id], { relativeTo: this.route });
  }

  protected initials(title: string): string {
    return title.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase() || '?';
  }
}
