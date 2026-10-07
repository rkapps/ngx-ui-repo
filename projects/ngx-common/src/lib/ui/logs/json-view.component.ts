import { Component, computed, input, signal } from '@angular/core';
import { TwangButtonComponent } from 'ngx-twang-ui';
import { parseJsonContent } from '../../models/turn-execution';

/**
 * Titled, scrollable block for a JSON value or a text payload. Text that is itself JSON (bare or
 * in a ```json fence, as agent `content` usually is) is pretty-printed; anything else is shown as
 * wrapped text. Has a copy button for the raw value.
 */
@Component({
  selector: 'app-json-view',
  standalone: true,
  imports: [TwangButtonComponent],
  // With `fill`, the block grows to the space left in a flex-column parent and scrolls inside.
  host: { '[class]': "fill() ? 'flex min-h-0 flex-1 flex-col' : 'block'" },
  template: `
    <section class="flex flex-col gap-2" [class.min-h-0]="fill()" [class.flex-1]="fill()">
      <div class="flex items-center gap-2">
        <span class="text-xs font-semibold uppercase tracking-wider text-primary-600">{{ title() }}</span>
        @if (isJson()) {
          <span class="rounded bg-surface-muted px-1.5 py-0.5 text-[10px] uppercase text-text-muted">json</span>
        }
        @if (!empty()) {
          <twang-button
            class="ml-auto"
            variant="default"
            size="xs"
            [icon]="copied() ? 'check' : 'copy'"
            [ariaLabel]="'Copy ' + title()"
            [title]="'Copy ' + title()"
            (buttonClick)="copy()"
          />
        }
      </div>
      @if (empty()) {
        <p class="text-sm text-text-muted">{{ emptyText() }}</p>
      } @else {
        <pre
          class="overflow-auto rounded-md border border-border bg-surface-muted p-3 font-mono text-xs leading-relaxed"
          [class]="fill() ? 'min-h-40 flex-1' : maxHeightClass()"
          [class.whitespace-pre-wrap]="!isJson()"
        >{{ display() }}</pre>
      }
    </section>
  `,
})
export class JsonViewComponent {
  readonly title = input.required<string>();
  /** A structured value (tool input/output) — rendered as JSON. */
  readonly value = input<unknown>(undefined);
  /** A text payload (prompt/content) — pretty-printed when it parses as JSON. */
  readonly text = input<string | null | undefined>(undefined);
  readonly emptyText = input('None.');
  /** Height cap when not filling — a Tailwind `max-h-*` class (keep it a literal so Tailwind sees it). */
  readonly maxHeightClass = input('max-h-[28rem]');
  /** Grow to fill the parent's remaining height (parent must be a flex column). */
  readonly fill = input(false);

  protected readonly copied = signal(false);

  private readonly parsed = computed(() => {
    const value = this.value();
    if (value !== undefined) return { json: true, data: value };
    const text = this.text();
    const fromText = parseJsonContent(text);
    return fromText !== undefined ? { json: true, data: fromText } : { json: false, data: text ?? '' };
  });

  protected readonly isJson = computed(() => this.parsed().json);
  protected readonly empty = computed(() => {
    const { json, data } = this.parsed();
    return json ? data === null || data === undefined : !String(data).trim();
  });
  protected readonly display = computed(() => {
    const { json, data } = this.parsed();
    return json ? JSON.stringify(data, null, 2) : String(data);
  });

  protected copy(): void {
    const raw = this.text() ?? this.display();
    navigator.clipboard?.writeText(raw).then(
      () => {
        this.copied.set(true);
        setTimeout(() => this.copied.set(false), 1500);
      },
      () => {},
    );
  }
}
