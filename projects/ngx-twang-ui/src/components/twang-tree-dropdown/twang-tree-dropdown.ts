import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import {
  Component,
  Directive,
  ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  input,
  model,
  signal,
  viewChild,
} from '@angular/core';

import type { TwangTreeDropdownNode } from './twang-tree-dropdown.models';

export type TwangTreeDropdownVariant =
  | 'primary'
  | 'primarySoft'
  | 'secondary'
  | 'accent'
  | 'outline'
  | 'default'
  | 'muted';
export type TwangTreeDropdownSize = 'xs' | 'sm' | 'md' | 'lg';

export type TwangTreeCheckboxVisualState = 'checked' | 'unchecked' | 'indeterminate';

/** Keeps `checked` / `indeterminate` in sync with logical tri-state (Angular has no indeterminate binding). */
@Directive({
  selector: 'input[type=checkbox][twangTreeTriState]',
  standalone: true,
})
export class TwangTreeTriStateCheckboxDirective {
  readonly twangTreeTriState = input.required<TwangTreeCheckboxVisualState>();
  private readonly el = inject<ElementRef<HTMLInputElement>>(ElementRef);

  constructor() {
    effect(() => {
      const s = this.twangTreeTriState();
      const inputEl = this.el.nativeElement;
      queueMicrotask(() => {
        inputEl.checked = s === 'checked';
        inputEl.indeterminate = s === 'indeterminate';
      });
    });
  }
}

function collectLeafIds(node: TwangTreeDropdownNode): string[] {
  if (!node.children?.length) return [node.id];
  return node.children.flatMap(collectLeafIds);
}

function findNodeById(nodes: TwangTreeDropdownNode[], id: string): TwangTreeDropdownNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children?.length) {
      const f = findNodeById(n.children, id);
      if (f) return f;
    }
  }
  return null;
}

@Component({
  selector: 'twang-tree-dropdown',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, TwangTreeTriStateCheckboxDirective],
  templateUrl: './twang-tree-dropdown.html',
  styleUrl: './twang-tree-dropdown.css',
})
export class TwangTreeDropdownComponent {
  private readonly host = inject(ElementRef<HTMLElement>);

  /** Tree options (roots). */
  readonly nodes = input<TwangTreeDropdownNode[]>([]);
  /** Allow multiple selected values. */
  readonly multiselect = input(true);
  /** Show a checkbox per row; if false, row click toggles selection. */
  readonly checkbox = input(true);
  readonly placeholder = input('Select…');
  /** For `<label for="…">` association with the trigger button. */
  readonly fieldId = input<string | undefined>(undefined);
  readonly disabled = input(false);
  readonly variant = input<TwangTreeDropdownVariant>('muted');
  readonly size = input<TwangTreeDropdownSize>('md');
  /** Selected leaf (and branch, if stored) ids — branch ids are removed on write; use leaves for filter logic. */
  readonly selected = model<string[]>([]);

  private readonly triggerRef = viewChild<ElementRef<HTMLButtonElement>>('triggerBtn');

  protected readonly open = signal(false);
  protected readonly panelStyle = signal<{ top: string; left: string; width: string } | null>(null);
  protected readonly expanded = signal<Set<string>>(new Set());

  constructor() {
    effect(() => {
      const roots = this.nodes();
      const next = new Set<string>();
      const walk = (list: TwangTreeDropdownNode[]) => {
        for (const n of list) {
          if (n.children?.length) {
            next.add(n.id);
            walk(n.children);
          }
        }
      };
      walk(roots);
      this.expanded.set(next);
    });
  }

  protected readonly triggerClasses = computed(() => {
    const base =
      'twang-tree-dropdown-trigger flex w-full items-center justify-between gap-2 rounded-lg font-medium transition duration-200 focus:outline-none focus-visible:outline-none text-left';

    const variantMap: Record<TwangTreeDropdownVariant, string> = {
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

    const sizeMap: Record<TwangTreeDropdownSize, string> = {
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
    const m: Record<TwangTreeDropdownSize, number> = { xs: 14, sm: 16, md: 20, lg: 22 };
    return m[this.size()];
  });

  protected readonly summary = computed(() => {
    const n = this.selected().length;
    if (n === 0) return this.placeholder();
    if (n === 1) {
      const id = this.selected()[0]!;
      const node = findNodeById(this.nodes(), id);
      return node?.label ?? '1 selected';
    }
    return `${n} selected`;
  });

  protected readonly visibleRows = computed(() => {
    const roots = this.nodes();
    const exp = this.expanded();
    const out: { id: string; label: string; depth: number; hasChildren: boolean; node: TwangTreeDropdownNode }[] =
      [];
    const walk = (list: TwangTreeDropdownNode[], depth: number) => {
      for (const n of list) {
        const hasChildren = !!n.children?.length;
        out.push({ id: n.id, label: n.label, depth, hasChildren, node: n });
        if (hasChildren && exp.has(n.id)) {
          walk(n.children!, depth + 1);
        }
      }
    };
    walk(roots, 0);
    return out;
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
    this.open.update((v) => !v);
  }

  protected close(): void {
    this.open.set(false);
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(ev: MouseEvent): void {
    if (!this.open()) return;
    const t = ev.target as Node;
    if (this.host.nativeElement.contains(t)) return;
    this.close();
  }

  protected toggleExpand(id: string, ev: Event): void {
    ev.stopPropagation();
    this.expanded.update((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  protected isExpanded(id: string): boolean {
    return this.expanded().has(id);
  }

  protected rowState(node: TwangTreeDropdownNode): TwangTreeCheckboxVisualState {
    const sel = new Set(this.selected());
    const leaves = collectLeafIds(node);
    if (leaves.length === 0) return 'unchecked';
    const c = leaves.filter((id) => sel.has(id)).length;
    if (c === 0) return 'unchecked';
    if (c === leaves.length) return 'checked';
    return 'indeterminate';
  }

  protected isLeafSelected(id: string): boolean {
    return this.selected().includes(id);
  }

  protected onRowClick(node: TwangTreeDropdownNode, ev: Event): void {
    if (this.disabled()) return;
    ev.stopPropagation();
    this.toggleNode(node);
    if (!this.multiselect() && !this.checkbox()) this.close();
  }

  protected onCheckboxClick(node: TwangTreeDropdownNode, ev: MouseEvent): void {
    if (this.disabled()) return;
    ev.preventDefault();
    ev.stopPropagation();
    this.toggleNode(node);
  }

  private toggleNode(node: TwangTreeDropdownNode): void {
    const leaves = collectLeafIds(node);
    if (leaves.length === 0) return;
    const sel = new Set(this.selected());
    if (!this.multiselect()) {
      const pick = [...leaves].sort((a, b) => a.localeCompare(b))[0]!;
      const isOn = sel.size === 1 && sel.has(pick);
      this.selected.set(isOn ? [] : [pick]);
      this.close();
      return;
    }
    const allOn = leaves.every((id) => sel.has(id));
    if (allOn) {
      for (const id of leaves) sel.delete(id);
    } else {
      for (const id of leaves) sel.add(id);
    }
    this.selected.set([...sel]);
  }

  protected onPanelMouseDown(ev: Event): void {
    ev.stopPropagation();
  }
}
