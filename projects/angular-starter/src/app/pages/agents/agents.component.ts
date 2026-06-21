import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Location, TitleCasePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd } from '@angular/router';
import { filter, map, startWith, timeout, TimeoutError } from 'rxjs';
import { LucideAngularModule } from 'lucide-angular';
import { PageLayoutComponent, ConversationService, type Conversation } from 'ngx-common';

const SELECTED_KEY = 'agents.selectedId';

@Component({
  selector: 'app-agents',
  standalone: true,
  imports: [LucideAngularModule, PageLayoutComponent, RouterOutlet, TitleCasePipe],
  templateUrl: './agents.component.html',
  host: { class: 'flex flex-1 flex-col min-h-0 overflow-hidden' },
})
export class AgentsPageComponent implements OnInit {
  private readonly conversationService = inject(ConversationService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly filteredConversations = computed(() =>
    this.conversationService.conversations()
      .filter(c => c.conversation_type === 'agent')
      .sort((a, b) => a.title.localeCompare(b.title))
  );
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
    this.conversationService.deleted$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.selectFirst());

    this.loadConversations(false);
  }

  private loadConversations(isRefresh: boolean): void {
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
          } else {
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
