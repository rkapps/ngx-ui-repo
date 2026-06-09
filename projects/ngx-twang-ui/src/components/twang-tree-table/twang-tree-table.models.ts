import type { TwangTableColumn, TwangTableFooterCell, TwangTableSplitCell } from '../twang-table/twang-table';

// Re-export so callers only need one import.
export type { TwangTableFooterCell, TwangTableSplitCell };

/**
 * Column definition for `TwangTreeTable`. Identical to `TwangTableColumn` with one addition:
 * mark exactly one column as `isLabelColumn` — it receives the expand/collapse chevron and
 * depth indent. For leaf rows it renders `splitCell` (if provided) or `col.value`; for
 * summary rows it renders `node.label` and ignores `col.value`.
 */
export interface TwangTreeTableColumn<T> extends TwangTableColumn<T> {
  isLabelColumn?: boolean;
}

/**
 * A node in the tree passed to `TwangTreeTable`.
 *
 * - **Summary nodes** (group / category / account): set `summary: T` with rollup values.
 *   `data` is null / absent. `children` is a non-empty array.
 * - **Leaf nodes** (individual tickers / positions): set `data: T`. `children` is empty / absent.
 *
 * The component passes `summary` to column value functions for summary rows and `data` for
 * leaf rows, so both shapes must satisfy the column's `value` accessor.
 */
export interface TwangTreeTableNode<T> {
  /** Unique identifier — used for expand/collapse state and `@for` tracking. */
  id: string;
  /** Text rendered in the label column for summary rows. */
  label: string;
  /** 0-based depth: 0 = group, 1 = category, 2 = parent account, 3+ = leaf. */
  depth: number;
  /** Leaf row data (present for ticker/position rows, absent for summary rows). */
  data?: T | null;
  /** Rollup data (present for group/category/account rows, absent for leaf rows). */
  summary?: T | null;
  children?: TwangTreeTableNode<T>[];
}
