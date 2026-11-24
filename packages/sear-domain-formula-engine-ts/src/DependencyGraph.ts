/**
 * Dependency graph: TS implementation of IDependencyGraph.
 *
 * This is the core formula-engine data structure. It manages:
 * 1. Forward dependencies: which cells/ranges each formula depends on.
 * 2. Reverse indexes: which formulas depend on each cell.
 * 3. Dirty-flag system: edits mark formulas dirty, evaluation computes on demand.
 *
 * Key optimizations:
 * - Range-level dependencies: SUM(A1:Z100000) stores one range dependency, not 2.6M cell edges.
 * - Column-grouped spatial index: getDependents drops from O(N) to O(log N + K).
 * - Dirty-flag lazy evaluation: edits mark O(V) formulas instead of fully sorting O(V+E).
 */

import { Injectable } from '@searsuite/sear-foundation-di';
import { SearError } from '@searsuite/sear-foundation-error';
import {
  type CellKey,
  type StructureChange,
  IDependencyGraph,
  type Dependency,
  FormulaNodeKind,
  StructureChangeAxis,
  shiftStructureCoordinate,
} from '@searsuite/sear-domain-formula-engine';
import { cellKey } from './cellKey';
import { fromCellKey } from './fromCellKey';

/**
 * Sorted interval entry for the column-grouped index.
 *
 * Used by the columnRanges spatial index. Each entry represents the row
 * interval covered by one range in one column.
 */
interface SortedInterval {
  /** Interval start row (0-based). */
  startRow: number;
  /** Interval end row (0-based). */
  endRow: number;
  /** CellKey for the formula that owns this range. */
  formulaKey: CellKey;
}

/** Threshold for expanding large ranges into columns. */
const COLUMN_EXPAND_LIMIT = 1000;
/** Cell-count threshold for expanding a small range into per-cell cellRevDeps. */
const SMALL_RANGE_LIMIT = 100;

/** Tracks formula dependencies, dirty propagation, evaluation readiness, and cycles. */
@Injectable()
export class DependencyGraph implements IDependencyGraph {
  /** DI token for resolving DependencyGraph. */
  public static readonly symbol = Symbol.for('DependencyGraph');
  #isCommandExecuting: (() => boolean) | undefined;

  enforceCommandBoundary(isCommandExecuting: () => boolean): void {
    if (this.#isCommandExecuting) throw new SearError('Formula dependency graph is already bound to an editor.');
    this.#isCommandExecuting = isCommandExecuting;
    Object.preventExtensions(this);
  }

  #assertCommandWrite(): void {
    if (this.#isCommandExecuting && !this.#isCommandExecuting()) {
      throw new SearError('Formula dependencies must change through editor.commands.run(...).');
    }
  }

  // ─── Forward Dependencies ───────────────────────────────
  // Formula CellKey -> Dependency[] it depends on, at range level without expansion.
  // Example: SUM(A1:C100) -> [{ kind: FormulaNodeKind.Range, start: [0,0], end: [99,2] }]
  #deps: Map<CellKey, Dependency[]> = new Map();

  // ─── Reverse Index: Column Groups + Sorted Intervals ────
  //
  // Core idea: reduce the 2D problem to 1D.
  // - Each range expands by covered column into that column's interval list.
  // - Intervals in the same column are sorted by startRow.
  // - Queries only binary-search the relevant column.
  //
  // Example: range A1:C100 (col 0-2, row 0-99)
  //   → columnRanges[0].push({ startRow:0, endRow:99, formulaKey })
  //   → columnRanges[1].push({ startRow:0, endRow:99, formulaKey })
  //   → columnRanges[2].push({ startRow:0, endRow:99, formulaKey })
  //
  // Query getDependents(row=50, col=1):
  //   -> inspect only columnRanges[1], binary-search intervals with startRow <= 50.
  //   -> check endRow >= 50 -> hit.
  //   -> complexity: O(log N + K).
  #columnRanges: Map<number, SortedInterval[]> = new Map();

  // Maximum range length per column, used as the getDependents back-scan stop condition.
  #maxRangeLength: Map<number, number> = new Map();

  // Overflow list: very wide ranges where column count > COLUMN_EXPAND_LIMIT.
  // These are not expanded per column; queries scan them linearly.
  #overflowRanges: Array<{
    startRow: number;
    endRow: number;
    startCol: number;
    endCol: number;
    formulaKey: CellKey;
  }> = [];

  #columnRangeDeps: Array<{
    startCol: number;
    endCol: number;
    formulaKey: CellKey;
  }> = [];
  #rowRangeDeps: Array<{
    startRow: number;
    endRow: number;
    formulaKey: CellKey;
  }> = [];

  // Reverse dependencies for single cells, including cell dependencies and small-range expansion.
  // cellKey → Set<formulaKey>
  #cellRevDeps: Map<CellKey, Set<CellKey>> = new Map();

  // ─── Dirty-Flag System ──────────────────────────────────
  // All currently dirty formulas.
  #dirtySet: Set<CellKey> = new Set();
  // Number of dirty dependencies remaining for each dirty formula; 0 means ready.
  #dirtyDepCount: Map<CellKey, number> = new Map();
  // Cycle-reference nodes detected by the last markDirty call.
  #lastCycleKeys: CellKey[] = [];

  /**
   * Registers or updates dependencies for one formula cell.
   */
  updateCell(formulaKey: CellKey, depsList: Dependency[]): void {
    this.#assertCommandWrite();
    // Remove old dependencies first.
    this.removeCell(formulaKey);
    // Register new dependencies.
    this.#deps.set(formulaKey, depsList.map((dependency) => this.#cloneDependency(dependency)));

    for (const dep of depsList) {
      if (dep.kind === FormulaNodeKind.Cell) {
        // Cell dependency: add directly to cellRevDeps.
        const key = cellKey(dep.row, dep.col);
        this.#addCellRevDep(key, formulaKey);
      } else if (dep.kind === FormulaNodeKind.Range) {
        // Range dependency: choose storage strategy by size.
        const [startRow, startCol] = dep.start;
        const [endRow, endCol] = dep.end;
        const cellCount = (endRow - startRow + 1) * (endCol - startCol + 1);

        if (cellCount < SMALL_RANGE_LIMIT) {
          // Small range: expand to per-cell cellRevDeps.
          // Queries are O(1), at the cost of more memory.
          for (let r = startRow; r <= endRow; r++) {
            for (let c = startCol; c <= endCol; c++) {
              this.#addCellRevDep(cellKey(r, c), formulaKey);
            }
          }
        } else {
          // Large range: insert sorted intervals by column group.
          const colSpan = endCol - startCol + 1;
          if (colSpan <= COLUMN_EXPAND_LIMIT) {
            // Manageable column count: insert into columnRanges per column.
            for (let c = startCol; c <= endCol; c++) {
              this.#insertColumnRange(c, startRow, endRow, formulaKey);
            }
          } else {
            // Very wide range, such as SUM(A1:XFD1048576):
            // do not expand per column; store in overflow list for linear scan.
            this.#overflowRanges.push({
              startRow,
              endRow,
              startCol,
              endCol,
              formulaKey,
            });
          }
        }
      } else if (dep.kind === FormulaNodeKind.ColumnRange) {
        this.#columnRangeDeps.push({
          startCol: dep.startCol,
          endCol: dep.endCol,
          formulaKey,
        });
      } else if (dep.kind === FormulaNodeKind.RowRange) {
        this.#rowRangeDeps.push({
          startRow: dep.startRow,
          endRow: dep.endRow,
          formulaKey,
        });
      }
    }
  }

  /**
   * Removes one formula cell.
   */
  removeCell(formulaKey: CellKey): void {
    this.#assertCommandWrite();
    const oldDeps = this.#deps.get(formulaKey);
    if (!oldDeps) return;

    // Remove forward dependencies.
    this.#deps.delete(formulaKey);

    // Remove entries from reverse indexes.
    for (const dep of oldDeps) {
      if (dep.kind === FormulaNodeKind.Cell) {
        const key = cellKey(dep.row, dep.col);
        this.#removeCellRevDep(key, formulaKey);
      } else if (dep.kind === FormulaNodeKind.Range) {
        const [startRow, startCol] = dep.start;
        const [endRow, endCol] = dep.end;
        const cellCount = (endRow - startRow + 1) * (endCol - startCol + 1);

        if (cellCount < SMALL_RANGE_LIMIT) {
          // Remove per-cell expansion for a small range.
          for (let r = startRow; r <= endRow; r++) {
            for (let c = startCol; c <= endCol; c++) {
              this.#removeCellRevDep(cellKey(r, c), formulaKey);
            }
          }
        } else {
          const colSpan = endCol - startCol + 1;
          if (colSpan <= COLUMN_EXPAND_LIMIT) {
            // Remove column-grouped intervals.
            for (let c = startCol; c <= endCol; c++) {
              this.#removeColumnRange(c, startRow, endRow, formulaKey);
            }
          } else {
            // Remove overflow-list entries.
            this.#overflowRanges = this.#overflowRanges.filter((o) => o.formulaKey !== formulaKey);
          }
        }
      } else if (dep.kind === FormulaNodeKind.ColumnRange) {
        this.#columnRangeDeps = this.#columnRangeDeps.filter((o) => o.formulaKey !== formulaKey);
      } else if (dep.kind === FormulaNodeKind.RowRange) {
        this.#rowRangeDeps = this.#rowRangeDeps.filter((o) => o.formulaKey !== formulaKey);
      }
    }

    // Remove dirty state.
    this.#dirtySet.delete(formulaKey);
    this.#dirtyDepCount.delete(formulaKey);
  }

  /**
   * Gets every formula that depends on one cell.
   *
   * Merges results from three lookup paths:
   * 1. cellRevDeps (cell + small-range expansion) — O(1)
   * 2. columnRanges (column-grouped intervals) — O(log N + K)
   * 3. overflowRanges (very wide ranges) — O(M)
   */
  getDependents(key: CellKey): CellKey[] {
    const [row, col] = fromCellKey(key);
    const result = new Set<CellKey>();

    // 1. Per-cell reverse dependencies — O(1).
    const cellRev = this.#cellRevDeps.get(key);
    if (cellRev) {
      cellRev.forEach((k) => result.add(k));
    }

    // 2. Column-grouped interval lookup — O(log N + K).
    const intervals = this.#columnRanges.get(col);
    if (intervals && intervals.length > 0) {
      // Binary search: find the position after the last interval with startRow <= row.
      let lo = 0;
      let hi = intervals.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (intervals[mid].startRow <= row) lo = mid + 1;
        else hi = mid;
      }

      // Scan backward from the binary-search result.
      // Stop when startRow + maxRangeLen < row, because coverage is impossible.
      const maxLen = this.#maxRangeLength.get(col) ?? 0;
      const scanStart = Math.max(0, lo - 1);
      for (let i = scanStart; i >= 0; i--) {
        const iv = intervals[i];
        // If this interval's start row plus the maximum range length is still
        // below row, earlier intervals cannot cover row either, so stop.
        if (iv.startRow + maxLen < row) break;
        // Check whether row is inside the interval.
        if (row >= iv.startRow && row <= iv.endRow) {
          result.add(iv.formulaKey);
        }
      }
    }

    // 3. Overflow-list linear scan — O(M).
    for (const o of this.#overflowRanges) {
      if (row >= o.startRow && row <= o.endRow && col >= o.startCol && col <= o.endCol) {
        result.add(o.formulaKey);
      }
    }

    for (const o of this.#columnRangeDeps) {
      if (col >= o.startCol && col <= o.endCol) result.add(o.formulaKey);
    }

    for (const o of this.#rowRangeDeps) {
      if (row >= o.startRow && row <= o.endRow) result.add(o.formulaKey);
    }

    return [...result];
  }

  /**
   * Gets the range-level dependencies owned by one formula cell.
   *
   * Returns defensive copies so callers can inspect dependency edges without
   * mutating the graph's internal forward-dependency store.
   */
  getDependencies(formulaKey: CellKey): readonly Dependency[] {
    return (this.#deps.get(formulaKey) ?? []).map((dependency) => this.#cloneDependency(dependency));
  }

  /**
   * Gets a defensive snapshot of formula cells currently registered in the graph.
   */
  getFormulaKeys(): readonly CellKey[] {
    return [...this.#deps.keys()];
  }

  // ─── Dirty-Flag Lazy Evaluation ─────────────────────────

  /**
   * Marks all affected formulas dirty.
   *
   * Propagates by BFS from changedKeys along reverse-dependency edges.
   * Only marks; does not sort or calculate.
   */
  markDirty(changedKeys: CellKey[]): void {
    this.#assertCommandWrite();
    this.#lastCycleKeys = [];

    // BFS queue.
    const queue: CellKey[] = [...changedKeys];
    // Visited set to avoid duplicate processing.
    const visited = new Set<CellKey>(changedKeys);

    while (queue.length > 0) {
      const key = queue.shift()!;

      // If key itself is a formula in the deps Map, mark it dirty.
      if (this.#deps.has(key)) {
        this.#dirtySet.add(key);
      }

      // Propagate along reverse-dependency edges to downstream formulas.
      for (const dep of this.getDependents(key)) {
        if (!visited.has(dep)) {
          visited.add(dep);
          queue.push(dep);
        }
      }
    }

    // Rebuild after propagation so counts are independent of changedKeys/BFS
    // order and match markClean's one-decrement-per-dirty-predecessor path.
    this.#rebuildDirtyDepCounts();

    // Cycle detection.
    this.#detectCycles();
  }

  /**
   * Gets currently dirty formulas that can be evaluated immediately.
   *
   * Two-pass scan: viewport first, then off-screen formulas. Viewport priority
   * ensures visible formulas update first.
   */
  getNextReadyBatch(viewport: Set<CellKey>, maxCount: number): CellKey[] {
    const result: CellKey[] = [];

    // First pass: ready formulas inside the viewport.
    for (const key of this.#dirtySet) {
      if (result.length >= maxCount) break;
      if (viewport.has(key) && this.#isReady(key)) {
        result.push(key);
      }
    }

    // Second pass: ready formulas outside the viewport.
    for (const key of this.#dirtySet) {
      if (result.length >= maxCount) break;
      if (!viewport.has(key) && this.#isReady(key)) {
        result.push(key);
      }
    }

    return result;
  }

  /**
   * Marks one formula clean.
   *
   * Unlocks downstream dependencies by decrementing dirtyDepCount for every
   * dirty formula that depends on key.
   */
  markClean(key: CellKey): void {
    this.#assertCommandWrite();
    this.#dirtySet.delete(key);
    this.#dirtyDepCount.delete(key);

    // Visit formulas that depend on key and decrement their dirty dependency count.
    for (const dep of this.getDependents(key)) {
      if (this.#dirtySet.has(dep)) {
        const count = (this.#dirtyDepCount.get(dep) ?? 1) - 1;
        this.#dirtyDepCount.set(dep, Math.max(0, count));
      }
    }
  }

  /** Reports whether one formula cell is currently dirty. */
  isDirty(key: CellKey): boolean {
    return this.#dirtySet.has(key);
  }

  /** Number of dirty formulas still awaiting evaluation. */
  get pendingCount(): number {
    return this.#dirtySet.size;
  }

  /** Returns the last cycle keys. */
  getLastCycleKeys(): CellKey[] {
    return [...this.#lastCycleKeys];
  }

  /**
   * Notifies the graph about structural changes.
   *
   * For row/column insertions and deletions, updates range/cell coordinates in
   * every formula's deps and rebuilds reverse indexes.
   */
  onStructureChanged(changes: StructureChange[]): void {
    this.#assertCommandWrite();
    // Iterate every formula's deps and shift coordinates.
    const allFormulaKeys = [...this.#deps.keys()];

    for (const formulaKey of allFormulaKeys) {
      const oldDeps = this.#deps.get(formulaKey)!;
      const newDeps = this.#shiftDeps(oldDeps, changes);
      if (newDeps !== oldDeps) {
        // Changed: register again.
        this.updateCell(formulaKey, newDeps);
      }
    }
  }

  /** Number of formula nodes currently registered in the graph. */
  get size(): number {
    return this.#deps.size;
  }

  /**
   * Clears all data.
   */
  clear(): void {
    this.#assertCommandWrite();
    this.#deps.clear();
    this.#columnRanges.clear();
    this.#maxRangeLength.clear();
    this.#overflowRanges = [];
    this.#cellRevDeps.clear();
    this.#dirtySet.clear();
    this.#dirtyDepCount.clear();
    this.#lastCycleKeys = [];
  }

  // ─── Internal Helpers ───────────────────────────────────

  /**
   * Adds one cell reverse dependency.
   */
  #addCellRevDep(key: CellKey, formulaKey: CellKey): void {
    let set = this.#cellRevDeps.get(key);
    if (!set) {
      set = new Set();
      this.#cellRevDeps.set(key, set);
    }
    set.add(formulaKey);
  }

  #cloneDependency(dependency: Dependency): Dependency {
    if (dependency.kind === FormulaNodeKind.Range) {
      return {
        kind: FormulaNodeKind.Range,
        start: [dependency.start[0], dependency.start[1]],
        end: [dependency.end[0], dependency.end[1]],
      };
    }
    return { ...dependency };
  }

  /**
   * Removes one cell reverse dependency.
   */
  #removeCellRevDep(key: CellKey, formulaKey: CellKey): void {
    const set = this.#cellRevDeps.get(key);
    if (set) {
      set.delete(formulaKey);
      if (set.size === 0) this.#cellRevDeps.delete(key);
    }
  }

  /**
   * Inserts one interval into the column-grouped index.
   *
   * Intervals stay sorted by startRow using binary insertion.
   */
  #insertColumnRange(col: number, startRow: number, endRow: number, formulaKey: CellKey): void {
    let intervals = this.#columnRanges.get(col);
    if (!intervals) {
      intervals = [];
      this.#columnRanges.set(col, intervals);
    }

    // Binary insertion: find where startRow should be inserted.
    const entry: SortedInterval = { startRow, endRow, formulaKey };
    const idx = this.#binarySearchInsert(intervals, startRow);
    intervals.splice(idx, 0, entry);

    // Update this column's maximum range length.
    const len = endRow - startRow;
    const cur = this.#maxRangeLength.get(col) ?? 0;
    if (len > cur) this.#maxRangeLength.set(col, len);
  }

  /**
   * Removes one interval from the column-grouped index.
   */
  #removeColumnRange(col: number, startRow: number, endRow: number, formulaKey: CellKey): void {
    const intervals = this.#columnRanges.get(col);
    if (!intervals) return;

    const idx = intervals.findIndex(
      (iv) => iv.startRow === startRow && iv.endRow === endRow && iv.formulaKey === formulaKey,
    );
    if (idx >= 0) {
      intervals.splice(idx, 1);
      if (intervals.length === 0) this.#columnRanges.delete(col);
    }
  }

  /**
   * Binary-searches the insertion position.
   *
   * Finds where startRow should be inserted in intervals already sorted by startRow.
   */
  #binarySearchInsert(intervals: SortedInterval[], startRow: number): number {
    let lo = 0;
    let hi = intervals.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (intervals[mid].startRow <= startRow) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /**
   * Checks whether a dirty formula is ready, meaning all dependencies are clean.
   */
  #isReady(key: CellKey): boolean {
    return (this.#dirtyDepCount.get(key) ?? 0) === 0;
  }

  /** Rebuilds exact dirty-predecessor counts from the reverse dependency indexes. */
  #rebuildDirtyDepCounts(): void {
    this.#dirtyDepCount.clear();
    for (const key of this.#dirtySet) this.#dirtyDepCount.set(key, 0);

    for (const dirtyDependency of this.#dirtySet) {
      // getDependents() deduplicates formulas reached through overlapping cell,
      // rectangular, whole-column, and whole-row dependency declarations.
      for (const dependent of this.getDependents(dirtyDependency)) {
        if (!this.#dirtySet.has(dependent)) continue;
        this.#dirtyDepCount.set(dependent, (this.#dirtyDepCount.get(dependent) ?? 0) + 1);
      }
    }
  }

  /**
   * Detects cycles.
   *
   * Topological elimination: repeatedly remove ready nodes from dirtySet.
   * The final remaining nodes are part of cycles.
   */
  #detectCycles(): void {
    const remaining = new Set(this.#dirtySet);
    let changed = true;

    while (changed) {
      changed = false;
      for (const key of remaining) {
        if (this.#isReadyInSubgraph(key, remaining)) {
          remaining.delete(key);
          changed = true;
        }
      }
    }

    if (remaining.size === 0) return;

    // Topological elimination also leaves formulas downstream of a cycle.
    // Only strongly connected components are themselves circular.
    const dependents = new Map<CellKey, CellKey[]>();
    const dependencies = new Map<CellKey, CellKey[]>();
    for (const key of remaining) dependencies.set(key, []);
    for (const key of remaining) {
      const next = this.getDependents(key).filter((dependent) => remaining.has(dependent));
      dependents.set(key, next);
      for (const dependent of next) dependencies.get(dependent)!.push(key);
    }

    const visited = new Set<CellKey>();
    const finishOrder: CellKey[] = [];
    for (const start of remaining) {
      if (visited.has(start)) continue;
      visited.add(start);
      const stack: Array<{ key: CellKey; index: number }> = [{ key: start, index: 0 }];
      while (stack.length > 0) {
        const current = stack[stack.length - 1]!;
        const next = dependents.get(current.key)!;
        if (current.index === next.length) {
          finishOrder.push(current.key);
          stack.pop();
          continue;
        }
        const neighbor = next[current.index++]!;
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        stack.push({ key: neighbor, index: 0 });
      }
    }

    visited.clear();
    for (let index = finishOrder.length - 1; index >= 0; index--) {
      const start = finishOrder[index]!;
      if (visited.has(start)) continue;
      const component: CellKey[] = [];
      const stack = [start];
      visited.add(start);
      while (stack.length > 0) {
        const key = stack.pop()!;
        component.push(key);
        for (const neighbor of dependencies.get(key)!) {
          if (visited.has(neighbor)) continue;
          visited.add(neighbor);
          stack.push(neighbor);
        }
      }
      if (component.length > 1 || dependents.get(start)!.includes(start)) this.#lastCycleKeys.push(...component);
    }
  }

  /**
   * Checks whether one node is ready inside a subgraph.
   *
   * Similar to isReady, but checks dependencies only inside the remaining subgraph.
   */
  #isReadyInSubgraph(key: CellKey, subgraph: Set<CellKey>): boolean {
    const formulaDeps = this.#deps.get(key);
    if (!formulaDeps) return true;

    for (const dep of formulaDeps) {
      if (dep.kind === FormulaNodeKind.Cell) {
        const depKey = cellKey(dep.row, dep.col);
        // If the dependency key is in the subgraph and is a formula, it is not ready yet.
        if (subgraph.has(depKey) && this.#deps.has(depKey)) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Shifts coordinates in a Dependency list.
   *
   * Updates all references in deps according to structural changes such as
   * row/column insertions and deletions.
   */
  #shiftDeps(depsList: Dependency[], changes: StructureChange[]): Dependency[] {
    let anyChanged = false;
    const newDeps: Dependency[] = depsList.map((dep) => {
      if (dep.kind === FormulaNodeKind.Cell) {
        const shifted = this.#shiftCoord(dep.row, dep.col, changes);
        if (shifted.row !== dep.row || shifted.col !== dep.col) {
          anyChanged = true;
          return {
            kind: FormulaNodeKind.Cell,
            row: shifted.row,
            col: shifted.col,
          };
        }
        return dep;
      } else if (dep.kind === FormulaNodeKind.Range) {
        const startShifted = this.#shiftCoord(dep.start[0], dep.start[1], changes);
        const endShifted = this.#shiftCoord(dep.end[0], dep.end[1], changes);
        if (
          startShifted.row !== dep.start[0] ||
          startShifted.col !== dep.start[1] ||
          endShifted.row !== dep.end[0] ||
          endShifted.col !== dep.end[1]
        ) {
          anyChanged = true;
          return {
            kind: FormulaNodeKind.Range,
            start: [Math.min(startShifted.row, endShifted.row), Math.min(startShifted.col, endShifted.col)] as [
              number,
              number,
            ],
            end: [Math.max(startShifted.row, endShifted.row), Math.max(startShifted.col, endShifted.col)] as [
              number,
              number,
            ],
          };
        }
        return dep;
      } else if (dep.kind === FormulaNodeKind.ColumnRange) {
        const startCol = this.#shiftColumn(dep.startCol, changes);
        const endCol = this.#shiftColumn(dep.endCol, changes);
        if (startCol !== dep.startCol || endCol !== dep.endCol) {
          anyChanged = true;
          return { ...dep, startCol: Math.min(startCol, endCol), endCol: Math.max(startCol, endCol) };
        }
        return dep;
      } else if (dep.kind === FormulaNodeKind.RowRange) {
        const startRow = this.#shiftRow(dep.startRow, changes);
        const endRow = this.#shiftRow(dep.endRow, changes);
        if (startRow !== dep.startRow || endRow !== dep.endRow) {
          anyChanged = true;
          return { ...dep, startRow: Math.min(startRow, endRow), endRow: Math.max(startRow, endRow) };
        }
        return dep;
      }
      return dep;
    });

    return anyChanged ? newDeps : depsList;
  }

  /**
   * Shifts one coordinate.
   */
  #shiftCoord(row: number, col: number, changes: StructureChange[]): { row: number; col: number } {
    return {
      row: shiftStructureCoordinate({ coordinate: row, axis: StructureChangeAxis.Row, changes }).value,
      col: shiftStructureCoordinate({ coordinate: col, axis: StructureChangeAxis.Col, changes }).value,
    };
  }

  #shiftColumn(col: number, changes: StructureChange[]): number {
    return shiftStructureCoordinate({ coordinate: col, axis: StructureChangeAxis.Col, changes }).value;
  }

  #shiftRow(row: number, changes: StructureChange[]): number {
    return shiftStructureCoordinate({ coordinate: row, axis: StructureChangeAxis.Row, changes }).value;
  }
}
