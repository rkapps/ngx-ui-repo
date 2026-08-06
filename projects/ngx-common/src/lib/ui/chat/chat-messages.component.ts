import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, afterRenderEffect, input } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { ChatMessage } from './chat-message';
import { MessageRendererComponent } from '../message-renderer/message-renderer.component';

/** The message thread half of `ngx-chat`, independently placeable from `ngx-chat-prompt`. */
@Component({
  selector: 'ngx-chat-messages',
  standalone: true,
  imports: [LucideAngularModule, MessageRendererComponent],
  host: { class: 'flex h-full min-h-0 flex-col' },
  template: `
    <!-- Streaming status — slides open with content, always in DOM to avoid layout shift -->
    <div
      class="shrink-0 overflow-hidden transition-[max-height] duration-300 ease-in-out"
      [class]="status() ? 'max-h-32' : 'max-h-0'"
    >
      <div class="flex items-start gap-3 border-b border-border bg-primary-50/70 px-6 py-4">
        <lucide-icon name="loader-circle" [size]="15" class="mt-0.5 shrink-0 animate-spin text-primary-600" />
        <div class="flex-1 whitespace-pre-line text-sm text-primary-700">{{ status() }}</div>
      </div>
    </div>

    <!-- Messages -->
    <div #scrollArea class="min-h-0 flex-1 overflow-y-auto px-2 py-2 md:px-8 md:py-4">
      @if (loading()) {
        <div class="flex items-center justify-center py-12">
          <lucide-icon name="loader-circle" [size]="24" class="animate-spin text-text-muted" />
        </div>
      } @else if (messages().length === 0) {
        <div class="flex h-full flex-col items-center justify-center gap-3 text-center">
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

            <!-- Assistant response — only shown once content starts arriving -->
            @if (msg.assistantContent || !msg.streaming) {
              <div class="min-w-0">
                <app-message-renderer [content]="msg.assistantContent" />
              </div>
            }
          }
        </div>
      }
      <div #bottomSentinel></div>
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

  readonly messages = input<ChatMessage[]>([]);
  readonly loading = input(false);
  readonly status = input('');
  readonly errorMessage = input<string | null>(null);
  /** Scroll to the latest message the first time messages appear (e.g. on mount with existing history). */
  readonly autoScrollOnLoad = input(true);

  private prevMsgCount = 0;
  private isAutoScrolling = false;
  private resizeObserver?: ResizeObserver;

  constructor() {
    afterRenderEffect(() => {
      const msgs = this.messages();
      if (msgs.length === 0) { this.prevMsgCount = 0; this.isAutoScrolling = false; return; }
      const streaming = msgs.some(m => m.streaming);
      const isInitialLoad = this.prevMsgCount === 0;
      this.prevMsgCount = msgs.length;
      const shouldAutoScroll = streaming || (isInitialLoad && this.autoScrollOnLoad());
      this.isAutoScrolling = shouldAutoScroll;
      if (!shouldAutoScroll) return;
      const behavior = (streaming || isInitialLoad) ? 'instant' : 'smooth';
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.bottomSentinel?.nativeElement.scrollIntoView({ behavior, block: 'end' });
        });
      });
    });
  }

  ngAfterViewInit(): void {
    const el = this.scrollArea?.nativeElement;
    if (!el) return;
    this.resizeObserver = new ResizeObserver(() => {
      if (this.isAutoScrolling) {
        this.bottomSentinel?.nativeElement.scrollIntoView({ behavior: 'instant', block: 'end' });
      }
    });
    this.resizeObserver.observe(el);
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }
}
