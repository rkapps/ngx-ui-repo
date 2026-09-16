import { Component, ElementRef, OnDestroy, ViewChild, computed, effect, input, output, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';

const SUGGESTED_COLLAPSED_KEY = 'ngx-chat-prompt.suggestedCollapsed';
const ACTIVE_TAB_KEY = 'ngx-chat-prompt.activeTab';
const LAST_PROMPTS_KEY = 'ngx-chat-prompt.lastPrompts';
const LAST_PROMPTS_LIMIT = 8;
const MOBILE_QUERY = '(max-width: 639.98px)';

type PromptTabId = 'default' | 'last' | 'suggested';

const TAB_CONFIG: { id: PromptTabId; icon: string; label: string }[] = [
  { id: 'default', icon: 'list', label: 'Default prompts' },
  { id: 'last', icon: 'history', label: 'Last prompts' },
  { id: 'suggested', icon: 'sparkles', label: 'Suggested prompts' },
];

// No saved preference yet — default collapsed on narrow (mobile) screens, where the chip row
// otherwise eats a large share of the limited vertical space above the keyboard.
function defaultSuggestedCollapsed(): boolean {
  const saved = localStorage.getItem(SUGGESTED_COLLAPSED_KEY);
  if (saved !== null) return saved === 'true';
  return window.matchMedia(MOBILE_QUERY).matches;
}

function readActiveTab(): PromptTabId {
  const saved = localStorage.getItem(ACTIVE_TAB_KEY);
  return saved === 'last' || saved === 'suggested' ? saved : 'default';
}

function readLastPrompts(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(LAST_PROMPTS_KEY) ?? '');
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === 'string') : [];
  } catch {
    return [];
  }
}

/** The prompt-bar half of `ngx-chat`, independently placeable from `ngx-chat-messages`. */
@Component({
  selector: 'ngx-chat-prompt',
  standalone: true,
  imports: [LucideAngularModule],
  host: { '[class]': 'hostClasses()' },
  template: `
    @if (tabs().length) {
      <div [class]="'mx-auto mb-4 ' + widthClass()">
        <div class="flex items-center gap-1 px-1 pb-[2px]">
          @for (tab of tabs(); track tab.id) {
            <button
              type="button"
              class="flex items-center justify-center rounded p-1 transition-colors"
              [class]="activeTab() === tab.id && !suggestedCollapsed() ? 'bg-primary-50 text-primary-600' : 'text-text-muted hover:bg-surface-muted hover:text-text'"
              [attr.title]="tab.label"
              [attr.aria-pressed]="activeTab() === tab.id && !suggestedCollapsed()"
              (click)="selectTab(tab.id)"
            >
              <lucide-icon [name]="tab.icon" [size]="14" />
            </button>
          }
        </div>
        @if (!suggestedCollapsed()) {
          <div class="flex flex-wrap gap-1.5 px-1 pt-1">
            @for (p of activePrompts(); track p) {
              <button
                class="rounded-full px-2.5 py-0.5 text-xs text-primary-700 transition-colors hover:bg-primary-100"
                type="button"
                (click)="fillPrompt(p)"
              >{{ p }}</button>
            }
          </div>
        }
      </div>
    }
    <div [class]="'mx-auto flex flex-wrap items-end gap-2 rounded-2xl border border-border bg-white px-3 py-2 shadow-sm focus-within:border-primary-400 focus-within:ring-2 focus-within:ring-primary-400/20 transition-shadow ' + widthClass()">
      <textarea
        #promptEl
        class="max-h-80 min-w-[10rem] flex-1 resize-none bg-transparent text-sm text-text outline-none placeholder:text-text-muted"
        [class]="textareaMinHeightClass()"
        placeholder="Type a message…"
        rows="1"
        [value]="prompt()"
        (input)="onInput($event)"
        (keydown)="onKeydown($event)"
      ></textarea>

      <div class="ml-auto flex shrink-0 items-center gap-1 pb-0.5">
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

        @if (generating()) {
          <button
            class="flex h-8 w-8 items-center justify-center rounded-full bg-danger-600 text-white transition-colors hover:bg-danger-700"
            title="Stop"
            type="button"
            (click)="onStop()"
          >
            <lucide-icon name="square" [size]="14" />
          </button>
        } @else {
          <button
            class="flex h-8 w-8 items-center justify-center rounded-full bg-primary-600 text-white transition-colors hover:bg-primary-700 disabled:opacity-40"
            [disabled]="!prompt().trim()"
            title="Send"
            type="button"
            (click)="onSend()"
          >
            <lucide-icon name="arrow-up" [size]="16" />
          </button>
        }
      </div>
    </div>
  `,
})
export class ChatPromptComponent implements OnDestroy {
  @ViewChild('promptEl') private promptEl!: ElementRef<HTMLTextAreaElement>;

  readonly clearTrigger = input<number>(0);
  readonly defaultPrompts = input<string[]>([]);
  readonly suggestedPrompts = input<string[]>([]);
  /** Whether the conversation already has messages (restored or sent this session) — used to
   * auto-collapse the prompt chips on mobile once a conversation is underway, freeing up
   * vertical space above the keyboard. The tab icons themselves stay visible either way, so
   * the prompts are still one tap away. */
  readonly hasHistory = input(false);
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
  /** Shows a stop button in place of send while an assistant response is still streaming in. */
  readonly generating = input(false);
  readonly send = output<string>();
  readonly stop = output<void>();

  protected readonly hostClasses = computed(() =>
    `sticky bottom-0 z-10 block w-full shrink-0 border-t border-border p-2 xl:px-4 xl:pt-4 xl:pb-4 ${this.background()}`
  );

  protected readonly widthClass = computed(() => (this.widthMode() === 'half' ? 'lg:w-1/2' : 'w-full'));
  // 'full' width mode is used for a docked side panel (e.g. markets' right aside) — default it
  // open to ~6 lines instead of growing from a single line, since that panel has the vertical
  // room and starting cramped just means immediately resizing on the first real message.
  protected readonly textareaMinHeightClass = computed(() => (this.widthMode() === 'full' ? 'min-h-36' : 'min-h-16 xl:min-h-[72px]'));

  protected readonly prompt = signal('');
  protected readonly recording = signal(false);
  protected readonly suggestedCollapsed = signal(defaultSuggestedCollapsed());
  protected readonly activeTab = signal<PromptTabId>(readActiveTab());
  protected readonly lastPrompts = signal<string[]>(readLastPrompts());
  protected readonly isMobile = signal(typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches);
  // Set the moment the user submits (before any backend response) — combined with `hasHistory`
  // (which covers a conversation restored from a previous session) to auto-collapse on mobile.
  protected readonly submitted = signal(false);

  protected readonly tabs = computed(() => {
    const promptsByTab: Record<PromptTabId, string[]> = {
      default: this.defaultPrompts(),
      last: this.lastPrompts(),
      suggested: this.suggestedPrompts(),
    };
    return TAB_CONFIG.map(tab => ({ ...tab, prompts: promptsByTab[tab.id] })).filter(tab => tab.prompts.length > 0);
  });

  protected readonly activePrompts = computed(() => {
    const tabs = this.tabs();
    return tabs.find(t => t.id === this.activeTab())?.prompts ?? tabs[0]?.prompts ?? [];
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private recognition: any = null;
  private readonly mobileMql = typeof window !== 'undefined' ? window.matchMedia(MOBILE_QUERY) : null;
  private readonly onMobileChange = (e: MediaQueryListEvent) => this.isMobile.set(e.matches);

  constructor() {
    this.mobileMql?.addEventListener('change', this.onMobileChange);

    effect(() => localStorage.setItem(SUGGESTED_COLLAPSED_KEY, String(this.suggestedCollapsed())));
    effect(() => localStorage.setItem(ACTIVE_TAB_KEY, this.activeTab()));
    effect(() => localStorage.setItem(LAST_PROMPTS_KEY, JSON.stringify(this.lastPrompts())));

    // Auto-collapse (not hide — the tab icons stay tappable) once a conversation is underway on
    // mobile, to free up vertical space above the keyboard. Only fires on the false->true edge, so
    // it won't fight a user who re-expands afterward.
    effect(() => {
      if (this.isMobile() && (this.hasHistory() || this.submitted())) {
        this.suggestedCollapsed.set(true);
      }
    });

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

  // Clicking the already-active tab toggles the prompts open/closed; clicking a different
  // tab switches to it and opens it — there's no separate expand/collapse control.
  protected selectTab(id: PromptTabId): void {
    if (this.activeTab() === id) {
      this.suggestedCollapsed.update(v => !v);
    } else {
      this.activeTab.set(id);
      this.suggestedCollapsed.set(false);
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

  // Doesn't clear the prompt itself — the caller owns that via `clearTrigger`, once
  // it actually has a response back, so the typed text stays visible while streaming.
  protected onSend(): void {
    const text = this.prompt().trim();
    if (!text) return;
    this.submitted.set(true);
    this.lastPrompts.update(list => [text, ...list.filter(p => p !== text)].slice(0, LAST_PROMPTS_LIMIT));
    this.send.emit(text);
  }

  protected onStop(): void {
    this.stop.emit();
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
    this.mobileMql?.removeEventListener('change', this.onMobileChange);
  }
}
