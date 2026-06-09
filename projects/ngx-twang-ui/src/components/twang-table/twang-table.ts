import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, SimpleChanges, computed, effect, inject, signal } from '@angular/core';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { LucideAngularModule } from 'lucide-angular';

export type TwangTableSortDir = 'asc' | 'desc';
export type TwangTableAlign = 'left' | 'right';

/** Optional third segment (e.g. balance in parentheses) to the right of `secondary`. */
export interface TwangTableSplitCell {
  primary: string;
  secondary: string;
  primaryClass?: string;
  secondaryClass?: string;
  /** When `tertiaryClass` is set, a third segment is rendered (use empty string for a blank slot). */
  tertiary?: string;
  tertiaryClass?: string;
  /** `stack`: primary above secondary (e.g. symbol + name). Default is horizontal row. */
  layout?: 'row' | 'stack';
}

export interface TwangTableColumn<T> {
  id: string;
  header: string;
  sortable?: boolean;
  align?: TwangTableAlign;
  widthClass?: string;
  /**
   * With `fillContainerWidth` on the table: this column has no fixed width and absorbs the
   * remaining width after fixed columns (use with `table-layout: fixed` + `width: 100%` table).
   */
  fillRemaining?: boolean;
  /** When set, forces `width` on the header/body cells (used with `table-layout: fixed`). */
  width?: string;
  /**
   * Applied as inline `min-width` on col/th/td. With `fillRemaining`, sets a floor; columns
   * without `minWidth` get `.twang-col-fill-remaining-squeeze` so `min-width: 0` still applies for
   * flexible fill columns (e.g. screener industry).
   */
  minWidth?: string;
  maxWidth?: string;
  headerClass?: string;
  cellClass?: string | ((row: T) => string);
  sticky?: boolean;
  isAction?: boolean | ((row: T) => boolean);
  actionClass?: string | ((row: T) => string);
  value: (row: T) => string | number | null;
  sortValue?: (row: T) => string | number | null;
  format?: (value: string | number | null, row: T) => string;
  onCellClick?: (row: T, event: Event) => void;
  splitCell?: (row: T) => TwangTableSplitCell;
  emptyAsBlank?: boolean;
  /** Wrap plain cell text in a block `truncate` span (ellipsis in tight table layouts). */
  cellTruncate?: boolean;
}

export interface TwangTableFooterCell {
  text: string;
  colspan?: number;
  align?: TwangTableAlign;
  className?: string;
  widthClass?: string;
  sticky?: boolean;
  /** Align footer cell width with body columns (`table-layout: fixed`). */
  width?: string;
  minWidth?: string;
  maxWidth?: string;
}

@Component({
  selector: 'twang-table',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './twang-table.html',
  styleUrl: './twang-table.css',
})
export class TwangTableComponent<T extends object> implements OnChanges {
  private readonly rowsInput = signal<T[]>([]);
  private _initialSortKey: string | null = null;
  private _initialSortDir: TwangTableSortDir | null = null;

  @Input({ required: true })
  set rows(value: T[]) {
    this.rowsInput.set(value ?? []);
  }

  get rows(): T[] {
    return this.rowsInput();
  }

  @Input({ required: true }) columns: TwangTableColumn<T>[] = [];
  @Input() emptyMessage = 'No data.';
  private _footer: TwangTableFooterCell[] | null = null;
  @Input() set footer(value: TwangTableFooterCell[] | null) {
    this._footer = value ?? null;
  }
  get footer(): TwangTableFooterCell[] | null {
    return this._footer;
  }

  @Input() tableMinWidthClass = 'min-w-[980px]';
  /**
   * When true, the table stretches to the panel width (`width: 100%`) so columns with
   * `fillRemaining` expand to use leftover space after fixed-width columns.
   */
  @Input() fillContainerWidth = false;
  /** When set, caps panel height so `overflow: auto` scrolls inside the card (enables sticky thead/footer). */
  @Input() scrollPanelMaxHeight = '';
  /** Optional min-height for the scroll panel (e.g. to reserve space in a flex card). */
  @Input() scrollPanelMinHeight = '';
  /** When set, row clicks invoke this handler (ignored for clicks on `button` / `a`). */
  @Input() onRowClick?: (row: T, event: Event) => void;
  /** Extra classes per body row (e.g. selection border). */
  @Input() rowClass?: string | ((row: T) => string);
  /** Layout mode: 'scroll' (default) — internal scroll with max-height; 'paginated' — page controls;
   *  'auto' — paginated on handset, scroll on wider screens. */
  @Input() set mode(v: 'auto' | 'paginated' | 'scroll') { this._mode.set(v); }
  get mode(): 'auto' | 'paginated' | 'scroll' { return this._mode(); }
  /** Rows per page when mode is paginated or auto-on-handset. */
  @Input() pageSize = 8;

  private readonly breakpointObserver = inject(BreakpointObserver);
  private readonly isHandset = toSignal(
    this.breakpointObserver.observe(Breakpoints.Handset).pipe(map((s) => s.matches)),
    { initialValue: this.breakpointObserver.isMatched(Breakpoints.Handset) },
  );

  private readonly _mode = signal<'auto' | 'paginated' | 'scroll'>('scroll');

  protected readonly isPaginated = computed(() => {
    const m = this._mode();
    if (m === 'paginated') return true;
    if (m === 'scroll') return false;
    return this.isHandset() ?? false;
  });

  protected readonly page = signal(0);

  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.rowsInput().length / this.pageSize)),
  );

  protected readonly displayedRows = computed(() => {
    const sorted = this.sortedRows();
    if (!this.isPaginated()) return sorted;
    const p = this.page();
    return sorted.slice(p * this.pageSize, (p + 1) * this.pageSize);
  });

  constructor() {
    effect(() => {
      this.rowsInput();
      this.page.set(0);
    });
  }

  protected prevPage(): void {
    this.page.update((p) => Math.max(0, p - 1));
  }

  protected nextPage(): void {
    this.page.update((p) => Math.min(this.totalPages() - 1, p + 1));
  }

  @Input() set initialSortKey(value: string | null) {
    this._initialSortKey = value ?? null;
    if (!value) return;
    if (this.sortKey() !== null) return;
    this.sortKey.set(value);
  }
  @Input() set initialSortDir(value: TwangTableSortDir | null) {
    this._initialSortDir = value ?? null;
    if (!value) return;
    if (this.sortKey() !== null) return;
    this.sortDir.set(value);
  }

  private readonly sortKey = signal<string | null>(null);
  private readonly sortDir = signal<TwangTableSortDir>('desc');

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['initialSortKey'] && !changes['initialSortKey'].firstChange) {
      const v = changes['initialSortKey'].currentValue as string | null;
      if (v) {
        this.sortKey.set(v);
        const d = this._initialSortDir;
        if (d) this.sortDir.set(d);
      }
    }
    if (changes['columns'] && !changes['columns'].firstChange) {
      const sk = this.sortKey();
      const cols = this.columns;
      if (sk && cols?.length && !cols.some((c) => c.id === sk)) {
        const fallback =
          (this._initialSortKey && cols.some((c) => c.id === this._initialSortKey)
            ? this._initialSortKey
            : null) ?? cols.find((c) => c.sortable)?.id ?? null;
        if (fallback) this.sortKey.set(fallback);
      }
    }
  }

  /** Stable identity for @for rows — avoids DOM reuse-by-index flicker when row data replaces (e.g. screener). */
  protected bodyRowTrackId(row: T): unknown {
    const r = row as unknown as Record<string, unknown>;
    const sym = r['symbol'];
    if (typeof sym !== 'string' || !sym) return row;
    // Same symbol can appear across multiple accounts (positions); compose a unique key.
    const acct = r['accountId'] ?? r['accountName'];
    if (acct != null) return `${String(acct)}::${sym}`;
    return sym;
  }

  protected readonly sortedRows = computed(() => {
    const key = this.sortKey();
    const rows = this.rowsInput();
    if (!key) return rows;
    const col = this.columns.find((c) => c.id === key);
    if (!col) return rows;
    const dir = this.sortDir() === 'asc' ? 1 : -1;
    const accessor = col.sortValue ?? col.value;
    return [...rows].sort((a, b) => {
      const av = accessor(a);
      const bv = accessor(b);
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av ?? '').localeCompare(String(bv ?? '')) * dir;
    });
  });

  protected toggleSort(col: TwangTableColumn<T>): void {
    if (!col.sortable) return;
    if (this.sortKey() === col.id) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
      return;
    }
    this.sortKey.set(col.id);
    this.sortDir.set(col.align === 'left' ? 'asc' : 'desc');
  }

  protected sortIndicator(col: TwangTableColumn<T>): string {
    if (!col.sortable) return '';
    if (this.sortKey() !== col.id) return 'chevrons-up-down';
    return this.sortDir() === 'asc' ? 'chevron-up' : 'chevron-down';
  }

  protected getCellClass(col: TwangTableColumn<T>, row: T): string {
    const c = col.cellClass;
    return typeof c === 'function' ? c(row) : (c ?? '');
  }

  protected isActionCell(col: TwangTableColumn<T>, row: T): boolean {
    if (typeof col.isAction === 'function') {
      return col.isAction(row);
    }
    return Boolean(col.isAction);
  }

  protected getActionClass(col: TwangTableColumn<T>, row: T): string {
    const c = col.actionClass;
    if (typeof c === 'function') return c(row);
    return c ?? '';
  }

  protected displayValue(col: TwangTableColumn<T>, row: T): string {
    const v = col.value(row);
    if (col.format) return col.format(v, row);
    if (col.emptyAsBlank && (v == null || String(v).trim() === '')) return '';
    return String(v ?? '');
  }

  protected splitCellValue(col: TwangTableColumn<T>, row: T): TwangTableSplitCell | null {
    return col.splitCell ? col.splitCell(row) : null;
  }

  protected getTrClass(row: T): string {
    const parts = ['transition-colors', 'hover:bg-gray-50/60'];
    if (this.onRowClick) parts.push('cursor-pointer');
    const c = this.rowClass;
    if (c) {
      const extra = typeof c === 'function' ? c(row) : c;
      if (extra?.trim()) parts.push(...extra.trim().split(/\s+/).filter(Boolean));
    }
    return parts.join(' ');
  }

  protected handleRowClick(row: T, event: Event): void {
    if (!this.onRowClick) return;
    const el = event.target as HTMLElement | null;
    if (el?.closest('button, a')) return;
    this.onRowClick(row, event);
  }

  /**
   * Keep table viewports from collapsing too far on short windows.
   * If a max-height is provided and no explicit min-height is set by the caller,
   * apply a sensible default floor so page-level detail scroll remains the main fallback.
   */
  protected effectiveScrollPanelMinHeight(): string | null {
    if (this.isPaginated()) return null;
    const explicit = this.scrollPanelMinHeight?.trim();
    if (explicit) return explicit;
    return this.scrollPanelMaxHeight?.trim() ? '14rem' : null;
  }
}
