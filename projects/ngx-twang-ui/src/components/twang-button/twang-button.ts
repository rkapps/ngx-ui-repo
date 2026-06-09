import { CommonModule } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';

export type TwangButtonVariant =
  | 'primary'
  | 'primarySoft'
  | 'secondary'
  | 'accent'
  | 'outline'
  | 'default'
  | 'muted'
  | 'destructive';
export type TwangButtonSize = 'xs' | 'sm' | 'md' | 'lg';

/**
 * Themed action button: variant + size + optional Material Symbol icon and loading state.
 * Use `label` for text, or project content instead of `label` (not both).
 */
@Component({
  selector: 'twang-button',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './twang-button.html',
})
export class TwangButtonComponent {
  readonly variant = input<TwangButtonVariant>('primary');
  readonly size = input<TwangButtonSize>('sm');
  /** Full width of the parent (e.g. form submit). */
  readonly fluid = input(false);
  readonly type = input<'button' | 'submit' | 'reset'>('button');
  /** Ignored when the default slot has projected content. */
  readonly label = input('');
  readonly disabled = input(false);
  /** Material Symbols Outlined ligature name (e.g. `add`, `save`). */
  readonly icon = input('');
  readonly loading = input(false);
  /** Use for icon-only buttons (`label` empty); avoids silent buttons for assistive tech. */
  readonly ariaLabel = input('');
  /** When set (e.g. disclosure toggle), forwarded to the native button. */
  readonly ariaExpanded = input<boolean | undefined>(undefined);
  /** e.g. panel `id` for `aria-controls`. */
  readonly ariaControls = input('');
  /** Native tooltip; optional. */
  readonly title = input('');
  /**
   * When `'radio'`, sets `role="radio"` and `aria-checked` (e.g. chip row inside `role="radiogroup"`).
   * Omit extra `aria-label` when `label` is set — visible text is enough.
   */
  readonly semanticRole = input<'button' | 'radio'>('button');
  readonly ariaChecked = input<boolean | undefined>(undefined);

  readonly buttonClick = output<MouseEvent>();

  /** Merges variant, size, fluid, disabled, and loading styles. */
  protected readonly buttonClasses = computed(() => {
    const base =
      'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition duration-200 focus-visible:outline-none';

    const variantMap: Record<TwangButtonVariant, string> = {
      primary:
        'bg-primary-600 text-white shadow-sm hover:bg-primary-600/90 focus-visible:ring-2 focus-visible:ring-primary-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--app-surface,#fff)]',
      /** Filled primary look without heavy solid (e.g. selected filter chips). */
      primarySoft:
        'border border-primary-500 bg-primary-50 text-primary-900 shadow-none hover:bg-primary-100 focus-visible:ring-2 focus-visible:ring-primary-500/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--app-surface,#fff)]',
      secondary:
        'bg-secondary-600 text-white shadow-sm hover:bg-secondary-600/90 focus-visible:ring-2 focus-visible:ring-secondary-500/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--app-surface,#fff)]',
      accent:
        'bg-accent-600 text-white shadow-sm hover:bg-accent-600/90 focus-visible:ring-2 focus-visible:ring-accent-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--app-surface,#fff)]',
      outline:
        'border border-primary-500 bg-transparent text-primary-600 shadow-none hover:bg-primary-50 focus-visible:ring-2 focus-visible:ring-primary-500/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--app-surface,#fff)]',
      default:
        'border-0 bg-transparent text-primary-700 shadow-none hover:bg-primary-50/80 focus-visible:ring-2 focus-visible:ring-primary-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--app-surface,#fff)]',
      /** Quiet outline for unselected chips / secondary actions on neutral chrome. */
      muted:
        'border border-border bg-white text-text-muted shadow-none hover:bg-gray-50 hover:text-text focus-visible:ring-2 focus-visible:ring-border focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--app-surface,#fff)]',
      destructive:
        'border border-danger-600 bg-transparent text-danger-600 shadow-none hover:bg-danger-50 focus-visible:ring-2 focus-visible:ring-danger-600/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--app-surface,#fff)]',
    };

    const sizeMap: Record<TwangButtonSize, string> = {
      xs: 'min-h-6 px-1.5 py-0.5 text-[11px] leading-tight',
      /** Compact chip / toolbar — visibly smaller than `md`. */
      sm: 'min-h-7 px-2 py-0.5 text-xs leading-tight',
      md: 'min-h-10 px-4 py-2 text-base',
      lg: 'min-h-11 px-5 py-2.5 text-lg',
    };

    const fluidClass = this.fluid() ? 'w-full' : '';
    const off = this.disabled() || this.loading();
    const stateClass = off
      ? 'cursor-not-allowed opacity-50 shadow-none grayscale-[0.35]'
      : 'cursor-pointer';

    const loadingClass = this.loading() ? 'pointer-events-none' : '';

    return [
      base,
      variantMap[this.variant()],
      sizeMap[this.size()],
      fluidClass,
      stateClass,
      loadingClass,
    ]
      .filter(Boolean)
      .join(' ');
  });

  protected readonly iconSize = computed(() => {
    const m: Record<TwangButtonSize, number> = { xs: 14, sm: 16, md: 20, lg: 24 };
    return m[this.size()];
  });

  protected onClick(ev: MouseEvent): void {
    if (this.disabled() || this.loading()) {
      ev.preventDefault();
      ev.stopPropagation();
      return;
    }
    this.buttonClick.emit(ev);
  }
}
