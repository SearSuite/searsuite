/**
 * Dependency graph interface.
 *
 * Manages dependencies between formula cells and supports:
 * 1. Range-level dependency registration without per-cell expansion.
 * 2. Column-grouped spatial indexes for O(log N) reverse lookups instead of O(N) scans.
 * 3. Dirty-flag lazy evaluation: edits only mark dirty formulas, evaluation computes on demand.
 *
 * Default implementation: DependencyGraph (sear-formula-engine-ts)
 * Replaceable implementation: WasmDependencyGraph (future sear-formula-engine-wasm)
 */

import { type CellKey } from './CellKey';
import { type StructureChange } from './StructureChange';
import { type Dependency } from './Dependency';

/** Public contract for IDependencyGraph. */
export interface IDependencyGraph {
  /** Binds mutations to the owning editor command dispatch after initialization. */
  enforceCommandBoundary(isCommandExecuting: () => boolean): void;
  /**
   * Registers or updates dependencies for one formula cell.
   *
   * deps is a range-level Dependency list and is not expanded per cell.
   * Existing formula-cell dependencies are removed before the new set is registered.
   *
   * @param formulaKey CellKey for the formula cell.
   * @param deps Range-level Dependency list used by the formula.
   */
  updateCell(formulaKey: CellKey, deps: Dependency[]): void;

  /**
   * Removes one formula cell.
   *
   * Clears the formula's:
   * - forward dependencies (deps Map)
   * - reverse indexes (cellRevDeps + columnRanges + overflowRanges)
   * - dirty state (dirtySet + dirtyDepCount)
   */
  removeCell(formulaKey: CellKey): void;

  /**
   * Gets every formula that depends on one cell.
   *
   * Uses three reverse-lookup indexes:
   * 1. Per-cell reverse dependencies (cellRevDeps) — O(1)
   * 2. Column-grouped interval lookup (columnRanges) — O(log N + K)
   * 3. Overflow-list linear scan (overflowRanges) — O(M)
   *
   * @param key CellKey for the referenced cell.
   * @returns CellKeys for all formulas that depend on that cell.
   */
  getDependents(key: CellKey): CellKey[];

  /**
   * Gets the range-level dependencies owned by one formula cell.
   *
   * Returned dependencies are defensive copies and must not expose mutable
   * graph internals. Non-formula cells return an empty array.
   *
   * @param formulaKey CellKey for the formula cell.
   * @returns Range-level Dependency list used by the formula.
   */
  getDependencies(formulaKey: CellKey): readonly Dependency[];

  /**
   * Gets formula cells currently registered in the graph.
   *
   * The returned array is a stable snapshot for diagnostics and host status
   * views. Mutating it must not affect graph internals.
   *
   * @returns CellKeys for every formula cell with registered dependencies.
   */
  getFormulaKeys(): readonly CellKey[];

  // ─── Dirty-Flag Lazy Evaluation API ─────────────────────
  //
  // Replaces full topological sorting. Excel's core strategy:
  // mark on edit (O(affected formulas)), then compute on demand (O(visible formulas)).
  //
  // Complete flow:
  // 1. markDirty(changedKeys) — propagate dirty marks by BFS without sorting.
  // 2. getNextReadyBatch(viewport, N) — take N ready formulas, prioritizing the viewport.
  // 3. markClean(key) after evaluation — unlock downstream dependencies.
  // 4. Repeat steps 2-3 until pendingCount === 0.

  /**
   * Marks all affected formulas dirty.
   *
   * Starts from changedKeys and propagates dirty marks along reverse-dependency
   * edges using BFS. Complexity is O(affected formulas + edges), with no
   * topological sort.
   *
   * Cycle detection records nodes inside the cycle in lastCycleKeys, which can
   * be read through getLastCycleKeys().
   *
   * @param changedKeys CellKeys for cells whose values changed.
   */
  markDirty(changedKeys: CellKey[]): void;

  /**
   * Gets currently dirty formulas that can be evaluated immediately.
   *
   * "Ready" means all dependencies for the formula are clean and there are no
   * dirty dependencies. Viewport formulas are returned first so visible results
   * update before off-screen ones.
   *
   * @param viewport CellKeys currently inside the viewport.
   * @param maxCount Maximum number of formulas to return.
   * @returns CellKeys for formulas that can be evaluated immediately.
   */
  getNextReadyBatch(viewport: Set<CellKey>, maxCount: number): CellKey[];

  /**
   * Marks one formula clean after evaluation completes.
   *
   * Unlocks downstream dependencies by decrementing dirtyDepCount for each
   * dirty formula that depends on key. When dirtyDepCount reaches 0, that
   * formula becomes ready and can be returned by getNextReadyBatch.
   *
   * @param key CellKey for the formula that has finished evaluating.
   */
  markClean(key: CellKey): void;

  /**
   * Reports whether one formula cell is currently dirty.
   *
   * Non-formula cells and clean formula cells return false.
   *
   * @param key CellKey for the formula to inspect.
   * @returns True when the formula is waiting for recalculation.
   */
  isDirty(key: CellKey): boolean;

  /** Number of dirty formulas still waiting for evaluation. */
  readonly pendingCount: number;

  /**
   * Cycle nodes detected by the last markDirty call.
   *
   * Formulas in a cycle should display the #REF! error. markDirty detects
   * cycles by topological elimination: repeatedly remove ready nodes; the
   * remaining nodes are part of cycles.
   */
  getLastCycleKeys(): CellKey[];

  /**
   * Notifies the graph about structural changes.
   *
   * Called for row/column insertions and deletions, and updates range
   * coordinates in spatial indexes. Large change sets may choose lazy rebuilds
   * by clearing indexes and rebuilding on the next query.
   *
   * @param changes Structural change list.
   */
  onStructureChanged(changes: StructureChange[]): void;

  /** Total number of formula cells currently in the graph. */
  readonly size: number;

  /** Clears all graph data. */
  clear(): void;
}

export namespace IDependencyGraph {
  export const symbol = Symbol.for('IDependencyGraph');
}
