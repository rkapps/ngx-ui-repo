import { Component, computed, input, output } from '@angular/core';
import { ChatMessage } from './chat-message';
import { ChatMessagesComponent } from './chat-messages.component';
import { ChatPromptComponent } from './chat-prompt.component';

/**
 * Self-contained chat widget: message thread docked above a bottom prompt bar.
 * For layouts that need the thread and prompt bar in separate places (e.g. a
 * dedicated panel), use `ngx-chat-messages` and `ngx-chat-prompt` directly instead.
 */
@Component({
  selector: 'ngx-chat',
  standalone: true,
  imports: [ChatMessagesComponent, ChatPromptComponent],
  template: `
    <div [class]="rootClasses()">
      <ngx-chat-messages
        class="min-h-0 flex-1"
        [messages]="messages()"
        [loading]="loading()"
        [status]="status()"
        [errorMessage]="errorMessage()"
        [autoScrollOnLoad]="autoScrollOnLoad()"
      />
      <ngx-chat-prompt
        [clearTrigger]="clearTrigger()"
        [suggestedPrompts]="suggestedPrompts()"
        [restorePrompt]="restorePrompt()"
        [background]="promptBackground()"
        (send)="send.emit($event)"
      />
    </div>
  `,
})
export class ChatComponent {
  readonly messages = input<ChatMessage[]>([]);
  readonly loading = input(false);
  readonly status = input('');
  readonly errorMessage = input<string | null>(null);
  readonly autoScrollOnLoad = input(true);
  readonly clearTrigger = input<number>(0);
  readonly suggestedPrompts = input<string[]>([]);
  readonly restorePrompt = input('');
  /** Tailwind background class for the prompt bar's own container (e.g. `bg-gray-50`). */
  readonly promptBackground = input('bg-white');
  /**
   * `false` (default) — bounded to the parent's height (`h-full`); the message thread
   * scrolls internally. Use in a fixed-height container (e.g. an app shell content pane).
   * `true` — `min-h-screen` instead, so the sticky prompt bar has room to bind to the
   * real page-level scrolling ancestor. Use when this sits in a naturally-flowing,
   * page-scrolling layout (e.g. inside a scrollable wrapper with no bounded height).
   */
  readonly fillViewport = input(false);
  readonly send = output<string>();

  protected readonly rootClasses = computed(() =>
    this.fillViewport() ? 'flex min-h-screen flex-col' : 'flex h-full flex-col'
  );
}
