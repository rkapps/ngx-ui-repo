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
        [class]="fillViewport() ? '' : 'min-h-0 flex-1'"
        [messages]="messages()"
        [loading]="loading()"
        [status]="status()"
        [errorMessage]="errorMessage()"
        [autoScrollOnLoad]="autoScrollOnLoad()"
        [fillViewport]="fillViewport()"
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
   * `true` — grows to its natural content height instead of `h-full`, so an ancestor's own
   * `overflow-y-auto` wrapper scrolls it (and the sticky prompt binds to that ancestor).
   * Use when this sits inside a scrollable wrapper with no bounded height of its own — but
   * note that's rarely the *browser viewport* itself (most app shells fix a header/footer
   * and scroll an inner pane instead), so despite the name this should NOT use a
   * viewport-relative unit like `min-h-screen`: that forces the thread to be at least a full
   * screen tall even when the actual scrollable ancestor is shorter than the viewport (e.g.
   * a shell with its own header/footer), leaving a stretch of empty space below the prompt.
   */
  readonly fillViewport = input(false);
  readonly send = output<string>();

  protected readonly rootClasses = computed(() =>
    this.fillViewport() ? 'flex flex-col' : 'flex h-full flex-col'
  );
}
