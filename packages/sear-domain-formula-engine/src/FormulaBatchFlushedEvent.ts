import { FormulaBatchFlushedEventType } from './FormulaBatchFlushedEventType';
import { type FormulaCalculationTraceEventBase } from './FormulaCalculationTraceEventBase';
import { type FormulaFlushedCellResult } from './FormulaFlushedCellResult';

/** Event emitted when one batch of derived results is flushed. */
export interface FormulaBatchFlushedEvent extends FormulaCalculationTraceEventBase {
  readonly type: typeof FormulaBatchFlushedEventType;
  readonly generation: number;
  readonly results: readonly FormulaFlushedCellResult[];
  readonly pendingCount: number;
}
