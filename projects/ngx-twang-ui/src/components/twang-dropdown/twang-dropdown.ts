import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import {
  Component,
  ElementRef,
  HostListener,
  computed,
  inject,
  input,
  model,
  output,
  signal,
  viewChild,
} from '@angular/core';

import type { TwangDropdownOption } from './twang-dropdown.models';

export type TwangDropdownVariant =
  | 'primary'
  | 'primarySoft'
  | 'secondary'
  | 'accent'
  | 'outline'
  | 'default'
  | 'muted';
export type TwangDropdownSize = 'xs' | 'sm' | 'md' | 'lg';

@Component({
  selector: 'twang-dropdown',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './twang-dropdown.html',
  styleUrl: './twang-dropdown.css',
})
export class TwangDropdownComponent {
  private readonly host = inject(ElementRef<HTMLElement>);

  /** Accepts readonly arrays from callers (`ReadonlyArray`, `as const`, etc.). */
  readonly options = input<ReadonlyArray<TwangDropdownOption>>([]);
  readonly placeholder = input('Select…');
  /** Current value (controlled, single-select). */
  readonly value = input<string>('');
  readonly valueChange = output<string>();
  /** When true, shows checkboxes and allows multiple selections via `selectedValues`. */
  readonly multiselect = input(false);
  /** Selected values for multi-select mode (two-way bindable). */
  readonly selectedValues = model<string[]>([]);
  readonly label = input<string>('');
  readonly fieldId = input<string | undefined>(undefined);
  readonly disabled = input(false);
  readonly variant = input<TwangDropdownVariant>('muted');
  readonly size = input<TwangDropdownSize>('md');

  private readonly triggerRef = viewChild<ElementRef<HTMLButtonElement>>('triggerBtn');

  protected readonly open = signal(false);
  protected readonly panelStyle = signal<{ top: string; left: string; width: string } | null>(null);

  protected readonly currentLabel = computed(() => {
    if (this.multiselect()) {
      const sel = this.selectedValues();
      if (sel.length === 0) return this.placeholder();
      if (sel.length === 1) return this.options().find((o) => o.value === sel[0])?.label ?? sel[0]!;
      return `${sel.length} selected`;
    }
    const v = this.value();
    const opt = this.options().find((o) => o.value === v);
    return opt?.label ?? this.placeholder();
  });

  protected readonly triggerClasses = computed(() => {
    const base =
      'twang-dropdown-trigger flex w-full items-center justify-between gap-2 rounded-lg font-medium transition duration-200 focus:outline-none focus-visible:outline-none text-left';

    const variantMap: Record<TwangDropdownVariant, string> = {
      primary:
        'bg-primary-600 text-white shadow-sm hover:bg-primary-600/90 focus-visible:ring-2 focus-visible:ring-primary-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--app-surface,#fff)]',
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
      muted:
        'border border-border bg-white text-text hover:bg-gray-50/80 focus-visible:ring-2 focus-visible:ring-primary-500/30',
    };

    const sizeMap: Record<TwangDropdownSize, string> = {
      xs: 'min-h-6 px-1.5 py-0.5 text-[11px] leading-tight',
      sm: 'min-h-7 px-2 py-0.5 text-xs leading-tight',
      md: 'min-h-10 px-3 py-2 text-sm',
      lg: 'min-h-11 px-4 py-2.5 text-base',
    };

    const disabledClass = this.disabled() ? 'cursor-not-allowed opacity-60' : 'cursor-pointer';

    return [base, variantMap[this.variant()], sizeMap[this.size()], disabledClass]
      .filter(Boolean)
      .join(' ');
  });

  protected readonly chevronSize = computed(() => {
    const m: Record<TwangDropdownSize, number> = { xs: 14, sm: 16, md: 20, lg: 22 };
    return m[this.size()];
  });

  protected toggleOpen(): void {
    if (this.disabled()) return;
    if (!this.open()) {
      const el = this.triggerRef()?.nativeElement;
      if (el) {
        const r = el.getBoundingClientRect();
        this.panelStyle.set({ top: `${r.bottom + 4}px`, left: `${r.left}px`, width: `${r.width}px` });
      }
    }
    this.open.update((o) => !o);
  }

  protected close(): void {
    this.open.set(false);
  }

  protected select(opt: TwangDropdownOption, ev: Event): void {
    ev.stopPropagation();
    this.valueChange.emit(opt.value);
    this.close();
  }

  protected isOptionSelected(opt: TwangDropdownOption): boolean {
    return this.selectedValues().includes(opt.value);
  }

  protected toggleOption(opt: TwangDropdownOption, ev: Event): void {
    ev.stopPropagation();
    const current = this.selectedValues();
    if (current.includes(opt.value)) {
      this.selectedValues.set(current.filter((v) => v !== opt.value));
    } else {
      this.selectedValues.set([...current, opt.value]);
    }
  }

  protected clearSelection(ev: Event): void {
    ev.stopPropagation();
    this.selectedValues.set([]);
    this.close();
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(ev: MouseEvent): void {
    if (!this.open()) return;
    const t = ev.target as Node;
    if (this.host.nativeElement.contains(t)) return;
    this.close();
  }
}
