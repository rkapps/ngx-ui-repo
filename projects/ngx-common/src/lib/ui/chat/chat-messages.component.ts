import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, afterRenderEffect, computed, inject, input, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../auth/auth.service';
import { saveAttachment, type StreamAttachment } from '../../http/event-stream';
import { ChatMessage } from './chat-message';
import { MessageRendererComponent } from '../message-renderer/message-renderer.component';

/** The message thread half of `ngx-chat`, independently placeable from `ngx-chat-prompt`. */
@Component({
  selector: 'ngx-chat-messages',
  standalone: true,
  imports: [LucideAngularModule, MessageRendererComponent],
  host: { '[class]': 'hostClasses()' },
  template: `
    <!-- Streaming status — slides open with content, always in DOM to avoid layout shift -->
    <div
      class="shrink-0 overflow-hidden transition-[max-height] duration-300 ease-in-out"
      [class]="status() ? 'max-h-32' : 'max-h-0'"
    >
      <div class="flex items-start gap-3 border-b border-border bg-primary-50/70 px-6 py-4">
        @if (statusBusy()) {
          <lucide-icon name="loader-circle" [size]="15" class="mt-0.5 shrink-0 animate-spin text-primary-600" />
        } @else {
          <lucide-icon name="circle-check" [size]="15" class="mt-0.5 shrink-0 text-primary-600" />
        }
        <!-- flex-col-reverse: scrolls from the bottom, so the newest of several status lines shows. -->
        <div class="flex max-h-24 flex-1 flex-col-reverse overflow-y-auto">
          <div class="whitespace-pre-line text-sm text-primary-700">{{ status() }}</div>
        </div>
      </div>
    </div>

    <!-- Messages -->
    <div #scrollArea [class]="scrollAreaClasses()">
      <!-- Content wrapper: its size changes as messages, charts and files render, so it's what's watched. -->
      <div #content class="flex flex-1 flex-col">
      @if (loading()) {
        <div class="flex items-center justify-center py-12">
          <lucide-icon name="loader-circle" [size]="24" class="animate-spin text-text-muted" />
        </div>
      } @else if (messages().length === 0) {
        <div class="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <lucide-icon name="message-square" [size]="36" class="text-text-muted opacity-40" />
          <p class="text-sm text-text-muted">No messages yet. Start the conversation below.</p>
        </div>
      } @else {
        <div class="flex flex-col gap-6">
          @for (msg of messages(); track msg.id) {
            <!-- User bubble -->
            <div class="flex justify-end">
              <div class="max-w-[50%] rounded-2xl rounded-tr-sm bg-gray-200 px-4 py-2.5 text-sm leading-relaxed text-gray-800 shadow-sm">
                {{ msg.userContent }}
              </div>
            </div>

            <!-- Assistant response — only shown once content starts arriving — then its errors / file -->
            <div class="flex min-w-0 flex-col gap-3 empty:hidden">
            @if (msg.assistantContent || !msg.streaming) {
              <div class="min-w-0">
                <app-message-renderer [content]="msg.assistantContent" />
              </div>
            }

            <!-- Errors the server reported along the way (the stream kept going) -->
            @for (err of msg.errors ?? []; track $index) {
              <div class="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                <lucide-icon name="circle-alert" [size]="15" class="mt-0.5 shrink-0" />
                <span class="min-w-0 whitespace-pre-line">{{ err }}</span>
              </div>
            }

            <!-- File made for the response (e.g. the report PDF) -->
            @if (msg.attachment; as att) {
              <div class="flex max-w-md items-center gap-3 rounded-lg border border-border bg-white px-4 py-3 shadow-sm">
                <lucide-icon name="file-text" [size]="22" class="shrink-0 text-primary-600" />
                <div class="min-w-0 flex-1">
                  <div class="truncate text-sm font-medium text-text">{{ att.file_name }}</div>
                  <div class="text-xs text-text-muted">{{ fileSize(att.size) }}</div>
                  @if (downloadErrors()[msg.id]; as dlError) {
                    <div class="text-xs text-red-600">{{ dlError }}</div>
                  }
                </div>
                <button
                  type="button"
                  class="flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-50 disabled:opacity-50"
                  [disabled]="downloading() === msg.id"
                  (click)="download(msg.id, att)"
                >
                  <lucide-icon [name]="downloading() === msg.id ? 'loader-circle' : 'download'" [size]="14" [class.animate-spin]="downloading() === msg.id" />
                  Download
                </button>
              </div>
            }
            @if (msg.attachmentFailed) {
              <div class="flex items-start gap-2 text-xs text-amber-700">
                <lucide-icon name="circle-alert" [size]="14" class="mt-px shrink-0" />
                <span>{{ msg.attachmentFailed }}</span>
              </div>
            }
            </div>
          }
        </div>
      }
      </div>
      <!-- scroll-margin keeps the bottom padding in view when scrolling to it (page-scrolling mode) -->
      <div #bottomSentinel class="scroll-mb-2 md:scroll-mb-8"></div>
    </div>

    <!-- Stream error -->
    @if (errorMessage()) {
      <div class="mx-16 mb-2 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        <span class="shrink-0 font-bold">!</span>
        <span>{{ errorMessage() }}</span>
      </div>
    }
  `,
})
export class ChatMessagesComponent implements AfterViewInit, OnDestroy {
  @ViewChild('scrollArea') private scrollArea!: ElementRef<HTMLDivElement>;
  @ViewChild('bottomSentinel') private bottomSentinel!: ElementRef<HTMLDivElement>;
  @ViewChild('content') private content!: ElementRef<HTMLDivElement>;

  readonly messages = input<ChatMessage[]>([]);
  readonly loading = input(false);
  readonly status = input('');
  /** Spinner beside the status while true; a check mark once the work is done (status kept on screen). */
  readonly statusBusy = input(true);
  readonly errorMessage = input<string | null>(null);
  /** Scroll to the latest message the first time messages appear (e.g. on mount with existing history). */
  readonly autoScrollOnLoad = input(true);
  /**
   * `false` (default) — bounded to the parent's height; this component scrolls its own
   * message thread internally (`overflow-y-auto`). `true` — grows naturally with content
   * instead, so the real page-level scrolling ancestor handles it. Must match the `ngx-chat`/
   * `fillViewport` mode it's paired with — mixing an internally-scrolling thread with a
   * page-scrolling sticky prompt is what causes the prompt to overlap/cover the tail of the
   * thread, since the two would be scrolling two different boxes at once.
   */
  readonly fillViewport = input(false);

  protected readonly hostClasses = computed(() =>
    this.fillViewport() ? 'flex flex-col' : 'flex h-full min-h-0 flex-col'
  );

  protected readonly scrollAreaClasses = computed(() =>
    this.fillViewport()
      ? 'flex flex-col px-2 pt-2 pb-2 md:px-8 md:pt-4 md:pb-8'
      : 'flex min-h-0 flex-1 flex-col overflow-y-auto px-2 pt-2 pb-2 md:px-8 md:pt-4 md:pb-8'
  );

  private readonly auth = inject(AuthService);
  /** Message whose attachment is downloading, and per-message download failures. */
  protected readonly downloading = signal<string | null>(null);
  protected readonly downloadErrors = signal<Record<string, string>>({});

  protected async download(messageId: string, attachment: StreamAttachment): Promise<void> {
    this.downloading.set(messageId);
    this.downloadErrors.update(({ [messageId]: _, ...rest }) => rest);
    try {
      await saveAttachment(attachment, () => this.auth.getIdToken());
    } catch (err) {
      this.downloadErrors.update(e => ({ ...e, [messageId]: (err as Error)?.message || 'Download failed.' }));
    } finally {
      this.downloading.set(null);
    }
  }

  protected fileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  private prevMsgCount = 0;
  private isAutoScrolling = false;
  /**
   * Whether the thread is scrolled to (near) the bottom — kept up to date by scroll events, so
   * content arriving after streaming ends (e.g. the PDF card) is followed only if the reader
   * hasn't scrolled up. Internal-scroll mode only; page-scrolling mode never sees our scrolls.
   */
  private atBottom = true;
  private resizeObserver?: ResizeObserver;
  private readonly onScroll = () => {
    const el = this.scrollArea.nativeElement;
    this.atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  };

  constructor() {
    afterRenderEffect(() => {
      const msgs = this.messages();
      if (msgs.length === 0) { this.prevMsgCount = 0; this.isAutoScrolling = false; return; }
      const streaming = msgs.some(m => m.streaming);
      const isInitialLoad = this.prevMsgCount === 0;
      this.prevMsgCount = msgs.length;
      const shouldAutoScroll = streaming || (isInitialLoad && this.autoScrollOnLoad()) || this.followsBottom();
      this.isAutoScrolling = streaming || (isInitialLoad && this.autoScrollOnLoad());
      if (!shouldAutoScroll) return;
      const behavior = (streaming || isInitialLoad) ? 'instant' : 'smooth';
      requestAnimationFrame(() => {
        requestAnimationFrame(() => this.scrollToBottom(behavior));
      });
    });
  }

  ngAfterViewInit(): void {
    this.scrollArea?.nativeElement.addEventListener('scroll', this.onScroll, { passive: true });
    const content = this.content?.nativeElement;
    if (!content) return;
    // Watch the content (not the fixed-height scroll box) so late growth — charts rendering, a
    // file card arriving after the final chunk — keeps the latest message in view.
    this.resizeObserver = new ResizeObserver(() => {
      if (this.isAutoScrolling || this.followsBottom()) this.scrollToBottom('instant');
    });
    this.resizeObserver.observe(content);
  }

  ngOnDestroy(): void {
    this.scrollArea?.nativeElement.removeEventListener('scroll', this.onScroll);
    this.resizeObserver?.disconnect();
  }

  private followsBottom(): boolean {
    return !this.fillViewport() && this.atBottom;
  }

  /** To the very bottom, bottom padding included. */
  private scrollToBottom(behavior: ScrollBehavior): void {
    const el = this.scrollArea?.nativeElement;
    if (!el) return;
    if (this.fillViewport()) this.bottomSentinel?.nativeElement.scrollIntoView({ behavior, block: 'end' });
    else el.scrollTo({ top: el.scrollHeight, behavior });
  }
}
