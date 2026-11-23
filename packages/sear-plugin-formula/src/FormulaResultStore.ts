/**
 * Formula calculation result storage.
 *
 * Holds a derived CellKey -> FormulaValue cache. This derived data does not
 * participate in OT sync; each client maintains it independently, and the local
 * RecalcScheduler writes it.
 *
 * Extracted from SheetFormulaPlugin as an independently injectable class:
 * - RecalcScheduler writes after evaluation by calling set directly.
 * - SheetFormulaPlugin reads/deletes through getFormulaResult and apply cleanup.
 * - Both call cellToFormulaValue to convert cells into formula-readable values.
 *
 * This lets the scheduler write results and read cells without onResults /
 * getEvalContext callbacks, and the plugin no longer needs its own resultCache field.
 */

import { Injectable, Inject } from '@searsuite/sear-foundation-di';
import { FormulaErrorCode, type CellKey, type FormulaRichResult, type FormulaValue } from '@searsuite/sear-domain-formula-engine';
import { type CellMatrixElement } from '@searsuite/sear-assembly-core';
import { CellType } from '@searsuite/sear-domain-cell-types';
import { cellKey, fromCellKey } from '@searsuite/sear-domain-formula-engine-ts';
import { CellFormulaValueConverterRegistry } from './CellFormulaValueConverterRegistry';
import { SearError } from '@searsuite/sear-foundation-error';
import { lockFormulaResultValue } from './lockFormulaResultValue';

/** Stores calculated formula results independently from persisted formula source. */
@Injectable()
export class FormulaResultStore {
  /** DI token for resolving FormulaResultStore. */
  public static readonly symbol = Symbol.for('FormulaResultStore');

  readonly #cache = new Map<CellKey, FormulaValue>();
  readonly #richCache = new Map<CellKey, FormulaRichResult>();
  readonly #spillCache = new Map<CellKey, FormulaValue>();
  readonly #anchorSpills = new Map<CellKey, Set<CellKey>>();
  #isCommandExecuting: (() => boolean) | undefined;

  /** Closes direct result writes after the owning Sheet has started. */
  public enforceCommandBoundary(isCommandExecuting: () => boolean): void {
    if (this.#isCommandExecuting) throw new SearError('Formula result store is already bound to an editor.');
    this.#isCommandExecuting = isCommandExecuting;
    Object.preventExtensions(this);
  }

  #assertCommandWrite(): void {
    if (this.#isCommandExecuting && !this.#isCommandExecuting()) {
      throw new SearError('Formula results must change through editor.commands.run(...).');
    }
  }

  /** Creates a FormulaResultStore instance. */
  constructor(
    @Inject(CellFormulaValueConverterRegistry.symbol)
    private readonly valueConverters: CellFormulaValueConverterRegistry,
  ) {}

  /** Returns the value. */
  get(key: CellKey): FormulaValue | undefined {
    return this.#cache.get(key);
  }

  /** Reads an anchor or projected spill value at any sheet coordinate. */
  getAt(row: number, col: number): FormulaValue | undefined {
    const key = cellKey(row, col);
    return this.#cache.get(key) ?? this.#spillCache.get(key);
  }

  /** Distinguishes projected children from their persisted formula anchor. */
  isSpillCell(row: number, col: number): boolean {
    return this.#spillCache.has(cellKey(row, col));
  }

  /** Reads derived rich metadata for a formula anchor. */
  getRichAt(row: number, col: number): FormulaRichResult | undefined {
    return this.#richCache.get(cellKey(row, col));
  }

  /** Replaces rich metadata after a formula result is committed. */
  setRichResult(key: CellKey, result: FormulaRichResult | undefined): void {
    this.#assertCommandWrite();
    if (result) this.#richCache.set(key, Object.freeze({ ...result }));
    else this.#richCache.delete(key);
  }

  /** Visits projected spill coordinates in a range; formula anchors live in the Sheet data matrix. */
  forEachSpillInRange(
    startRow: number, startColumn: number, endRow: number, endColumn: number,
    visit: (row: number, column: number) => void,
  ): void {
    for (const key of this.#spillCache.keys()) {
      const [row, column] = fromCellKey(key);
      if (row >= startRow && row <= endRow && column >= startColumn && column <= endColumn) visit(row, column);
    }
  }

  /** Updates the value. */
  set(key: CellKey, value: FormulaValue): void {
    this.#assertCommandWrite();
    this.#richCache.delete(key);
    if (this.#isCommandExecuting) lockFormulaResultValue(value);
    const previous = this.#anchorSpills.get(key);
    previous?.forEach((spillKey) => this.#spillCache.delete(spillKey));
    this.#anchorSpills.delete(key);
    this.#cache.set(key, value);
  }

  /** Stores a formula result and projects a rectangular array into derived spill cells. */
  setFormulaResult(
    key: CellKey,
    value: FormulaValue,
    context: { isCellInBounds(row: number, col: number): boolean; isCellOccupied?(row: number, col: number): boolean },
  ): CellKey[] {
    this.#assertCommandWrite();
    this.#richCache.delete(key);
    if (this.#isCommandExecuting) lockFormulaResultValue(value);
    const changed = new Set<CellKey>([key]);
    const previous = this.#anchorSpills.get(key);
    if (previous) {
      previous.forEach((spillKey) => {
        this.#spillCache.delete(spillKey);
        changed.add(spillKey);
      });
      this.#anchorSpills.delete(key);
    }

    if (Array.isArray(value)) {
      const rows = value as FormulaValue[][];
      const height = rows.length;
      const width = rows.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 1), 0);
      const [anchorRow, anchorCol] = fromCellKey(key);
      let conflict = height === 0 || width === 0;
      if (!conflict) {
        for (let r = 0; r < height && !conflict; r++) {
          for (let c = 0; c < width; c++) {
            if (r === 0 && c === 0) continue;
            const targetRow = anchorRow + r;
            const targetCol = anchorCol + c;
            if (!context.isCellInBounds(targetRow, targetCol) || context.isCellOccupied?.(targetRow, targetCol)) {
              conflict = true;
              break;
            }
          }
        }
      }
      if (!conflict) {
        const spillKeys = new Set<CellKey>();
        for (let r = 0; r < height; r++) {
          for (let c = 0; c < width; c++) {
            if (r === 0 && c === 0) continue;
            const spillKey = cellKey(anchorRow + r, anchorCol + c);
            const row = rows[r];
            this.#spillCache.set(spillKey, Array.isArray(row) ? row[c] ?? 0 : row);
            spillKeys.add(spillKey);
            changed.add(spillKey);
          }
        }
        this.#anchorSpills.set(key, spillKeys);
      } else {
        value = { kind: 'error', code: FormulaErrorCode.Value };
        if (this.#isCommandExecuting) lockFormulaResultValue(value);
      }
    }
    this.#cache.set(key, value);
    return [...changed];
  }

  /** Removes the calculated result for one formula cell. */
  delete(key: CellKey): void {
    this.#assertCommandWrite();
    this.#cache.delete(key);
    this.#richCache.delete(key);
    const previous = this.#anchorSpills.get(key);
    previous?.forEach((spillKey) => this.#spillCache.delete(spillKey));
    this.#anchorSpills.delete(key);
  }

  /** Returns whether value exists. */
  has(key: CellKey): boolean {
    return this.#cache.has(key);
  }

  /** Clears state owned by FormulaResultStore. */
  clear(): void {
    this.#assertCommandWrite();
    this.#cache.clear();
    this.#richCache.clear();
    this.#spillCache.clear();
    this.#anchorSpills.clear();
  }

  /**
   * Converts a CellMatrixElement to a FormulaValue.
   *
   * Used when evaluators read cell data:
   * - formula cells: read the local calculated result from this store; derived and unsynced.
   * - richtext/string cells: return text values, converting numeric strings to numbers.
   * - null/undefined: return 0 for empty cells.
   *
   * Called by both SheetFormulaPlugin.apply for aggCache delta calculation and
   * RecalcScheduler.createEvalContext, so it lives on the store to avoid
   * duplicated logic or callback plumbing.
   */
  cellToFormulaValue(row: number, col: number, cell: CellMatrixElement | null | undefined): FormulaValue {
    if (!cell) return this.#spillCache.get(cellKey(row, col)) ?? 0;

    if (cell.type === CellType.Formula) {
      // Formula cell: read the local calculated result from this store.
      const cached = this.get(cellKey(row, col));
      if (cached === void 0) return 0; // Not calculated yet -> treated as 0.
      if (Array.isArray(cached)) {
        const first = cached[0];
        return (Array.isArray(first) ? first[0] : first) ?? 0;
      }
      return cached;
    }

    return this.valueConverters.toFormulaValue(cell);
  }
}
