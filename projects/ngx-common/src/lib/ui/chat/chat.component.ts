import { Component, AfterViewInit, effect, ElementRef, input, OnDestroy, output, signal, ViewChild, afterRenderEffect } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { ChatMessage } from './chat-message';
import { MarkdownPipe } from './markdown.pipe';
import { MessageRendererComponent } from '../message-renderer/message-renderer.component';

@Component({
  selector: 'ngx-chat',
  standalone: true,
  imports: [LucideAngularModule, MarkdownPipe, MessageRendererComponent],
  template: `
    <div class="flex h-full flex-col">
      <!-- Streaming status — slides open with content, always in DOM to avoid layout shift -->
      <div
        class="shrink-0 overflow-hidden transition-[max-height] duration-300 ease-in-out"
        [class]="status() ? 'max-h-32' : 'max-h-0'"
      >
        <div class="flex items-start gap-3 border-b border-border bg-primary-50/70 px-6 py-4">
          <lucide-icon name="loader-circle" [size]="15" class="mt-0.5 shrink-0 animate-spin text-primary-600" />
          <div
            class="prose prose-sm flex-1 text-primary-700"
            [innerHTML]="status() | markdown"
          ></div>
        </div>
      </div>

      <!-- Messages -->
      <div #scrollArea class="min-h-0 flex-1 overflow-y-auto px-2 py-2 md:px-16 md:py-10">
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
                <div class="max-w-[75%] rounded-2xl rounded-tr-sm bg-gray-200 px-4 py-2.5 text-sm leading-relaxed text-gray-800 shadow-sm">
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
      </div>

      <!-- Stream error -->
      @if (errorMessage()) {
        <div class="mx-16 mb-2 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span class="shrink-0 font-bold">!</span>
          <span>{{ errorMessage() }}</span>
        </div>
      }

      <!-- Prompt bar -->
      <div class="shrink-0 border-t border-border bg-white px-4 pt-4 pb-8">
        <div class="mx-auto flex w-3/4 items-end gap-2 rounded-2xl border border-border bg-white px-3 py-2 shadow-sm focus-within:border-primary-400 focus-within:ring-2 focus-within:ring-primary-400/20 transition-shadow">
          <textarea
            #promptEl
            class="max-h-40 min-h-[72px] flex-1 resize-none bg-transparent text-sm text-text outline-none placeholder:text-text-muted"
            placeholder="Type a message…"
            rows="1"
            [value]="prompt()"
            (input)="onInput($event)"
            (keydown)="onKeydown($event)"
          ></textarea>

          <div class="flex shrink-0 items-center gap-1 pb-0.5">
            <button
              class="flex h-8 w-8 items-center justify-center rounded-full transition-colors"
              [class]="recording()
                ? 'bg-danger-600 text-white animate-pulse'
                : 'text-text-muted hover:bg-surface-muted hover:text-text'"
              [attr.title]="recording() ? 'Stop recording' : 'Voice input'"
              type="button"
              (click)="toggleMic()"
            >
              <lucide-icon [name]="recording() ? 'mic-off' : 'mic'" [size]="16" />
            </button>

            <button
              class="flex h-8 w-8 items-center justify-center rounded-full bg-primary-600 text-white transition-colors hover:bg-primary-700 disabled:opacity-40"
              [disabled]="!prompt().trim()"
              title="Send"
              type="button"
              (click)="onSend()"
            >
              <lucide-icon name="arrow-up" [size]="16" />
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class ChatComponent implements AfterViewInit, OnDestroy {
  @ViewChild('scrollArea') private scrollArea!: ElementRef<HTMLDivElement>;
  @ViewChild('promptEl') private promptEl!: ElementRef<HTMLTextAreaElement>;

  readonly messages = input<ChatMessage[]>([]);
  readonly loading = input(false);
  readonly status = input('');
  readonly errorMessage = input<string | null>(null);
  readonly clearTrigger = input<number>(0);
  readonly send = output<string>();

  protected readonly prompt = signal('');
  protected readonly recording = signal(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private recognition: any = null;
  private prevMsgCount = 0;
  private isAutoScrolling = false;
  private resizeObserver?: ResizeObserver;

  constructor() {
    effect(() => {
      if (this.clearTrigger() > 0) {
        this.prompt.set('');
        if (this.promptEl) this.promptEl.nativeElement.style.height = 'auto';
      }
    });

    afterRenderEffect(() => {
      const msgs = this.messages();
      if (msgs.length === 0) { this.prevMsgCount = 0; this.isAutoScrolling = false; return; }
      const streaming = msgs.some(m => m.streaming);
      const isInitialLoad = this.prevMsgCount === 0;
      this.prevMsgCount = msgs.length;
      this.isAutoScrolling = streaming || isInitialLoad;
      const behavior = (streaming || isInitialLoad) ? 'instant' : 'smooth';
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el = this.scrollArea?.nativeElement;
          if (!el) return;
          el.scrollTo({ top: el.scrollHeight, behavior });
        });
      });
    });

  }

  ngAfterViewInit(): void {
    const el = this.scrollArea?.nativeElement;
    if (!el) return;
    this.resizeObserver = new ResizeObserver(() => {
      if (this.isAutoScrolling) {
        el.scrollTo({ top: el.scrollHeight, behavior: 'instant' });
      }
    });
    this.resizeObserver.observe(el);
  }

  protected onInput(e: Event): void {
    const ta = e.target as HTMLTextAreaElement;
    this.prompt.set(ta.value);
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }

  protected onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && e.altKey) {
      e.preventDefault();
      const ta = e.target as HTMLTextAreaElement;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const val = this.prompt();
      const next = `${val.slice(0, start)}\n${val.slice(end)}`;
      this.prompt.set(next);
      // restore cursor after Angular updates the value
      setTimeout(() => {
        ta.selectionStart = ta.selectionEnd = start + 1;
        ta.style.height = 'auto';
        ta.style.height = `${ta.scrollHeight}px`;
      }, 0);
      return;
    }
    if (e.key === 'Enter' && !e.altKey) {
      e.preventDefault();
      this.onSend();
    }
  }

  protected onSend(): void {
    const text = this.prompt().trim();
    if (!text) return;
    this.send.emit(text);
  }

  protected toggleMic(): void {
    if (!this.recognition) {
      this.recognition = this.buildRecognition();
    }
    if (!this.recognition) return;

    if (this.recording()) {
      this.recognition.stop();
    } else {
      this.recognition.start();
      this.recording.set(true);
    }
  }

  private buildRecognition() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r: any = new SR();
    r.continuous = false;
    r.interimResults = false;
    r.lang = 'en-US';

    r.onresult = (e: any) => {
      const transcript = Array.from(e.results as ArrayLike<any>)
        .map((res: any) => res[0].transcript as string)
        .join('');
      this.prompt.update(p => (p ? `${p} ${transcript}` : transcript));
      this.recording.set(false);
    };

    r.onerror = () => this.recording.set(false);
    r.onend = () => this.recording.set(false);

    return r;
  }

  ngOnDestroy(): void {
    if (this.recording()) this.recognition?.stop();
    this.resizeObserver?.disconnect();
  }
}
