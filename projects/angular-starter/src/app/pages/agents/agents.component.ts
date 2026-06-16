import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { Location } from '@angular/common';
import { ActivatedRoute, Router, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { LucideAngularModule } from 'lucide-angular';
import { PageLayoutComponent, ConversationService, type Conversation } from 'ngx-common';

const SELECTED_KEY = 'agents.selectedId';

@Component({
  selector: 'app-agents',
  standalone: true,
  imports: [LucideAngularModule, PageLayoutComponent, RouterOutlet],
  templateUrl: './agents.component.html',
  host: { class: 'flex flex-1 flex-col min-h-0 overflow-hidden' },
})
export class AgentsPageComponent implements OnInit {
  private readonly conversationService = inject(ConversationService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);

  protected readonly conversations = signal<Conversation[]>([]);
  protected readonly filteredConversations = computed(() =>
    this.conversations()
      .filter(c => c.conversation_type === 'agent')
      .sort((a, b) => a.title.localeCompare(b.title))
  );
  protected readonly loadingConvs = signal(true);
  protected readonly error = signal('');

  protected readonly activeId = toSignal(
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      map(() => this.route.firstChild?.snapshot.params['id'] ?? null),
      startWith(this.route.firstChild?.snapshot.params['id'] ?? null),
    ),
    { initialValue: this.route.firstChild?.snapshot.params['id'] ?? null }
  );

  protected readonly hasChild = toSignal(
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      map(() => !!this.route.firstChild),
      startWith(!!this.route.firstChild),
    ),
    { initialValue: !!this.route.firstChild }
  );

  protected newConversation(): void {
    this.location.replaceState('/agents');
    this.router.navigate(['/agents/new']);
  }

  ngOnInit(): void {
    this.conversationService.getConversations().subscribe({
      next: (data) => {
        this.conversations.set(data);
        this.loadingConvs.set(false);
        // Restore session selection
        const savedId = sessionStorage.getItem(SELECTED_KEY);
        if (savedId && data.find(c => c.id === savedId)) {
          this.router.navigate([savedId], { relativeTo: this.route, replaceUrl: true });
        }
      },
      error: () => {
        this.error.set('Failed to load conversations.');
        this.loadingConvs.set(false);
      },
    });
  }

  protected select(conv: Conversation): void {
    sessionStorage.setItem(SELECTED_KEY, conv.id);
    this.router.navigate([conv.id], { relativeTo: this.route });
  }

  protected initials(title: string): string {
    return title.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase() || '?';
  }
}
