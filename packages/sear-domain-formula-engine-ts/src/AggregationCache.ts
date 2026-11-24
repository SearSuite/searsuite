/**
 * Aggregation cache: TS implementation of IAggregationCache.
 *
 * Provides incremental computation for aggregate functions such as SUM and COUNT
 * over large ranges.
 */

import { Injectable } from '@searsuite/sear-foundation-di';
import { SearError } from '@searsuite/sear-foundation-error';
import { type FormulaValue, IAggregationCache } from '@searsuite/sear-domain-formula-engine';
import { isFormulaError, isFormulaText, isNumber } from '@searsuite/sear-foundation-utils';

interface RangeAggregate {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
  sum?: number;
  count?: number;
  isSumDirty: boolean;
  isCountDirty: boolean;
}

/** Caches incremental aggregate results for large formula ranges. */
@Injectable()
export class AggregationCache implements IAggregationCache {
  public static readonly symbol = Symbol.for('AggregationCache');
  #isCommandExecuting: (() => boolean) | undefined;

  enforceCommandBoundary(isCommandExecuting: () => boolean): void {
    if (this.#isCommandExecuting) throw new SearError('Formula aggregation cache is already bound to an editor.');
    this.#isCommandExecuting = isCommandExecuting;
    Object.preventExtensions(this);
  }

  #assertCommandWrite(): void {
    if (this.#isCommandExecuting && !this.#isCommandExecuting()) {
      throw new SearError('Formula aggregation cache must change through editor.commands.run(...).');
    }
  }

  #cache: Map<number, RangeAggregate> = new Map();

  getSum(startRow: number, startCol: number, endRow: number, endCol: number): number {
    const entry = this.#cache.get(this.#computeRangeKey(startRow, startCol, endRow, endCol));
    if (entry && !entry.isSumDirty && entry.sum !== void 0) return entry.sum;
    return NaN;
  }

  getCount(startRow: number, startCol: number, endRow: number, endCol: number): number {
    const entry = this.#cache.get(this.#computeRangeKey(startRow, startCol, endRow, endCol));
    if (entry && !entry.isCountDirty && entry.count !== void 0) return entry.count;
    return NaN;
  }

  setSum(startRow: number, startCol: number, endRow: number, endCol: number, sum: number): void {
    this.#assertCommandWrite();
    const entry = this.#getOrCreateEntry(startRow, startCol, endRow, endCol);
    entry.sum = sum;
    entry.isSumDirty = false;
  }

  setCount(startRow: number, startCol: number, endRow: number, endCol: number, count: number): void {
    this.#assertCommandWrite();
    const entry = this.#getOrCreateEntry(startRow, startCol, endRow, endCol);
    entry.count = count;
    entry.isCountDirty = false;
  }

  onCellChanged(row: number, col: number, oldVal: FormulaValue, newVal: FormulaValue): void {
    this.#assertCommandWrite();
    for (const entry of this.#cache.values()) {
      if (row < entry.startRow || row > entry.endRow || col < entry.startCol || col > entry.endCol) continue;

      if (!entry.isSumDirty && entry.sum !== void 0) {
        if (
          isFormulaError(oldVal) ||
          isFormulaError(newVal) ||
          (isFormulaText(oldVal) && oldVal.numericCoercion === 'deny') ||
          (isFormulaText(newVal) && newVal.numericCoercion === 'deny')
        ) {
          entry.isSumDirty = true;
        } else {
          entry.sum += this.#toNumericValue(newVal) - this.#toNumericValue(oldVal);
        }
      }

      // Values alone cannot distinguish a blank cell (projected as zero) from
      // a numeric zero, so COUNT must read cell-source metadata again.
      entry.isCountDirty = true;
    }
  }

  onStructureChanged(): void {
    this.#assertCommandWrite();
    this.clear();
  }

  clear(): void {
    this.#assertCommandWrite();
    this.#cache.clear();
  }

  #getOrCreateEntry(startRow: number, startCol: number, endRow: number, endCol: number): RangeAggregate {
    const key = this.#computeRangeKey(startRow, startCol, endRow, endCol);
    let entry = this.#cache.get(key);
    if (!entry) {
      entry = {
        startRow,
        startCol,
        endRow,
        endCol,
        isSumDirty: true,
        isCountDirty: true,
      };
      this.#cache.set(key, entry);
    }
    return entry;
  }

  #computeRangeKey(startRow: number, startCol: number, endRow: number, endCol: number): number {
    return startRow * 281474976710656 + startCol * 4294967296 + endRow * 65536 + endCol;
  }

  #toNumericValue(v: FormulaValue): number {
    return isNumber(v) ? v : 0;
  }
}
