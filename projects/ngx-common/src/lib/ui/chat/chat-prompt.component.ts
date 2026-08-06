import { Component, ElementRef, OnDestroy, ViewChild, computed, effect, input, output, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';

/** The prompt-bar half of `ngx-chat`, independently placeable from `ngx-chat-messages`. */
@Component({
  selector: 'ngx-chat-prompt',
  standalone: true,
  imports: [LucideAngularModule],
  host: { '[class]': 'hostClasses()' },
  template: `
    @if (suggestedPrompts().length) {
      <div [class]="'mx-auto mb-2 flex flex-wrap gap-1.5 p-2 ' + widthClass()">
        @for (p of suggestedPrompts(); track p) {
          <button
            class="rounded-full border border-primary-200 bg-primary-50 px-2.5 py-0.5 text-xs text-primary-700 transition-colors hover:bg-primary-100 hover:border-primary-300"
            type="button"
            (click)="fillPrompt(p)"
          >{{ p }}</button>
        }
      </div>
    }
    <div [class]="'mx-auto flex items-end gap-2 rounded-2xl border border-border bg-white px-3 py-2 shadow-sm focus-within:border-primary-400 focus-within:ring-2 focus-within:ring-primary-400/20 transition-shadow ' + widthClass()">
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
  `,
})
export class ChatPromptComponent implements OnDestroy {
  @ViewChild('promptEl') private promptEl!: ElementRef<HTMLTextAreaElement>;

  readonly clearTrigger = input<number>(0);
  readonly suggestedPrompts = input<string[]>([]);
  readonly restorePrompt = input('');
  /** Tailwind background class for the prompt bar's own container (e.g. `bg-gray-50`). */
  readonly background = input('bg-white');
  /**
   * `half` (default) — prompt bar caps at `lg:w-1/2`, centered. Use when the prompt sits
   * docked at the bottom of a wide page (e.g. `ngx-chat`'s default layout).
   * `full` — no width cap, fills its container. Use when the prompt already lives in a
   * narrow dedicated panel (e.g. a side/right panel).
   */
  readonly widthMode = input<'half' | 'full'>('half');
  readonly send = output<string>();

  protected readonly hostClasses = computed(() =>
    `sticky bottom-0 z-10 block w-full shrink-0 border-t border-border px-4 pt-4 pb-8 ${this.background()}`
  );

  protected readonly widthClass = computed(() => (this.widthMode() === 'half' ? 'lg:w-1/2' : 'w-full'));

  protected readonly prompt = signal('');
  protected readonly recording = signal(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private recognition: any = null;

  constructor() {
    effect(() => {
      if (this.clearTrigger() > 0) {
        this.prompt.set('');
        if (this.promptEl) this.promptEl.nativeElement.style.height = 'auto';
      }
    });

    effect(() => {
      const text = this.restorePrompt();
      if (!text) return;
      this.prompt.set(text);
      const ta = this.promptEl?.nativeElement;
      if (ta) {
        ta.value = text;
        ta.style.height = 'auto';
        ta.style.height = `${ta.scrollHeight}px`;
        ta.focus();
      }
    });
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

  protected fillPrompt(text: string): void {
    this.prompt.set(text);
    const ta = this.promptEl?.nativeElement;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = `${ta.scrollHeight}px`;
      ta.focus();
    }
  }

  protected onSend(): void {
    const text = this.prompt().trim();
    if (!text) return;
    this.prompt.set('');
    const ta = this.promptEl?.nativeElement;
    if (ta) ta.style.height = 'auto';
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
  }
}
