import { Component, DestroyRef, inject, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LucideAngularModule } from 'lucide-angular';
import { TwangButtonComponent } from 'ngx-twang-ui';
import { finalize } from 'rxjs';
import { AdminConfigService } from '../../services/admin-config.service';

/**
 * "Refresh cache" header button: makes the backend refresh its in-memory config cache from storage
 * (`POST /admin/config/refresh`), then emits `refreshed` so the page can refetch. Shows the outcome
 * next to the button; MCP servers that failed to rebuild (if reported) are listed in the tooltip.
 */
@Component({
  selector: 'app-refresh-cache-button',
  standalone: true,
  imports: [LucideAngularModule, TwangButtonComponent],
  host: { class: 'flex items-center gap-2' },
  template: `
    @switch (outcome()?.kind) {
      @case ('ok') {
        <span class="flex items-center gap-1 text-xs text-green-700">
          <lucide-icon name="circle-check" [size]="14" /> Refreshed
        </span>
      }
      @case ('partial') {
        <span class="flex items-center gap-1 text-xs text-amber-700" [title]="outcome()!.detail">
          <lucide-icon name="circle-alert" [size]="14" /> {{ outcome()!.message }}
        </span>
      }
      @case ('error') {
        <span class="flex items-center gap-1 text-xs text-red-600" [title]="outcome()!.detail">
          <lucide-icon name="circle-alert" [size]="14" /> {{ outcome()!.message }}
        </span>
      }
    }
    <twang-button
      variant="default"
      size="sm"
      icon="database-zap"
      label="Refresh cache"
      title="Refresh the backend's config cache (agents, providers, MCP servers) from storage"
      [loading]="busy()"
      [disabled]="busy()"
      (buttonClick)="refresh()"
    />
  `,
})
export class RefreshCacheButtonComponent {
  private readonly configService = inject(AdminConfigService);
  private readonly destroyRef = inject(DestroyRef);

  /** Emitted after a successful refresh (even with MCP failures), so the page can refetch. */
  readonly refreshed = output<void>();

  protected readonly busy = signal(false);
  protected readonly outcome = signal<{ kind: 'ok' | 'partial' | 'error'; message: string; detail: string } | null>(null);
  private clearTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    this.destroyRef.onDestroy(() => clearTimeout(this.clearTimer));
  }

  protected refresh(): void {
    clearTimeout(this.clearTimer);
    this.outcome.set(null);
    this.busy.set(true);
    this.configService
      .refreshCache()
      .pipe(
        finalize(() => this.busy.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: res => {
          const failures = res?.mcp_failures ?? [];
          if (failures.length) {
            this.outcome.set({
              kind: 'partial',
              message: `${failures.length} MCP server${failures.length > 1 ? 's' : ''} failed`,
              detail: failures.map(f => `${f.server}: ${f.error}`).join('\n'),
            });
          } else {
            this.outcome.set({ kind: 'ok', message: 'Refreshed', detail: '' });
            this.clearTimer = setTimeout(() => this.outcome.set(null), 3000);
          }
          this.refreshed.emit();
        },
        error: err => {
          console.error('Cache refresh failed', err);
          const detail = typeof err?.error === 'string' ? err.error : (err?.message ?? '');
          this.outcome.set({ kind: 'error', message: 'Refresh failed', detail });
        },
      });
  }
}
