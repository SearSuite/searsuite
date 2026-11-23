import { type CellKey, type EvalContext, type FormulaMetadataCellReference } from '@searsuite/sear-domain-formula-engine';
import { type Transaction } from '@searsuite/sear-domain-transaction';
import { FormulaResultStore } from './FormulaResultStore';

/** Callback invoked when viewport-priority scheduling inputs may have changed. */
export type FormulaViewportChangeHandler = () => void;
export type FormulaExternalServiceInvalidationHandler = (functionNames: readonly string[]) => void;

/**
 * Narrow data-source contract used by RecalcScheduler.
 *
 * Implementations adapt host-owned sheet data, viewport state, and dimension
 * services into formula-engine concepts. The scheduler depends only on this
 * contract, not on render, scroll, or DataEngine packages.
 */
export interface FormulaSchedulerDataSource {
  /**
   * Builds the latest evaluation context for a recalculation batch.
   * @param resultStore - Per-client derived formula result store used when formula cells reference formula cells.
   * @returns EvalContext for the current committed sheet snapshot.
   */
  createEvalContext(resultStore: FormulaResultStore): EvalContext;

  /** Identifies host-owned changes that can block or unblock projected array results. */
  isSpillObstacleTransaction?(transaction: Transaction): boolean;

  /**
   * Selects formula keys that are currently visible and should be evaluated first.
   * @param formulaKeys - Formula AST keys known to the scheduler.
   * @returns Formula keys inside the current visible viewport.
   */
  getViewportFormulaKeys(formulaKeys: Iterable<CellKey>): Set<CellKey>;

  /**
   * Subscribes to viewport changes that should wake pending formula recalculation.
   * @param handler - Callback invoked after viewport-priority inputs change.
   * @returns Disposer for the subscription.
   */
  onViewportChanged(handler: FormulaViewportChangeHandler): () => void;

  /** Reads the first visible cell for formulas that depend on viewport position. */
  getVisibleOrigin?(): FormulaMetadataCellReference;

  /** Subscribes to host-service cache changes that require selected functions to be evaluated again. */
  onExternalServiceInvalidated?(handler: FormulaExternalServiceInvalidationHandler): () => void;
}

export namespace FormulaSchedulerDataSource {
  /** DI token for resolving FormulaSchedulerDataSource. */
  export const symbol = Symbol.for('FormulaSchedulerDataSource');
}
