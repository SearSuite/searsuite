/**
 * Aggregation cache interface.
 *
 * Provides incremental computation support for aggregate functions such as
 * SUM and COUNT over large ranges.
 *
 * How it works:
 * - The first SUM(A1:Z100000) scan traverses the full range and caches the result.
 * - Later cell changes apply incremental updates: newSum = oldSum - oldVal + newVal.
 * - Complexity drops from O(N) to O(1).
 *
 * Default implementation: AggregationCache (sear-formula-engine-ts)
 * Replaceable implementation: WasmAggregationCache (future sear-formula-engine-wasm)
 */

import { type FormulaValue } from './FormulaValue';

/** Public contract for IAggregationCache. */
export interface IAggregationCache {
  /** Binds cache writes to the owning editor command dispatch after initialization. */
  enforceCommandBoundary(isCommandExecuting: () => boolean): void;
  /**
   * Gets the SUM for a range.
   *
   * Cache hit returns directly in O(1). Cache miss requires a full O(N) scan
   * on the first call.
   *
   * Called by FormulaEvaluator while evaluating SUM, not exposed directly to users.
   *
   * @param startRow Start row (0-based).
   * @param startCol Start column (0-based).
   * @param endRow End row (0-based).
   * @param endCol End column (0-based).
   */
  getSum(startRow: number, startCol: number, endRow: number, endCol: number): number;

  /** Stores a successfully calculated SUM for a rectangular range. */
  setSum(startRow: number, startCol: number, endRow: number, endCol: number, sum: number): void;

  /** Stores a successfully calculated COUNT for a rectangular range. */
  setCount(startRow: number, startCol: number, endRow: number, endCol: number, count: number): void;

  /**
   * Gets the COUNT for a range, meaning the number of numeric cells.
   *
   * Uses the same cache and incremental strategy as getSum.
   */
  getCount(startRow: number, startCol: number, endRow: number, endCol: number): number;

  /**
   * Notifies the cache that one cell value changed.
   *
   * Finds every cached range covering the cell and updates incrementally:
   * - newSum = oldSum - oldVal + newVal
   * - FormulaError oldVal/newVal values are treated as non-numeric and do not affect sum.
   *
   * @param row Changed row (0-based).
   * @param col Changed column (0-based).
   * @param oldVal Previous value.
   * @param newVal New value.
   */
  onCellChanged(row: number, col: number, oldVal: FormulaValue, newVal: FormulaValue): void;

  /**
   * Notifies the cache that rows or columns were inserted or deleted.
   *
   * Structural changes invalidate all range caches because range coordinates
   * have changed, so the cache must be cleared.
   */
  onStructureChanged(): void;

  /** Clears all caches. */
  clear(): void;
}

export namespace IAggregationCache {
  export const symbol = Symbol.for('IAggregationCache');
}
