import { type FormulaCalculationTraceEventBase } from './FormulaCalculationTraceEventBase';
import { FormulaRecalculationCompletedEventType } from './FormulaRecalculationCompletedEventType';

/** Event emitted when one recalculation generation completes. */
export interface FormulaRecalculationCompletedEvent extends FormulaCalculationTraceEventBase {
  readonly type: typeof FormulaRecalculationCompletedEventType;
  readonly generation: number;
  readonly batchCount: number;
  readonly flushedCellCount: number;
  readonly pendingCount: 0;
}
