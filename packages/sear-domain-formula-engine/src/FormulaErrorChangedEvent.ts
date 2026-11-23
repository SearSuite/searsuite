import { type CellKey } from './CellKey';
import { type ErrorCode } from './ErrorCode';
import { type FormulaCalculationTraceEventBase } from './FormulaCalculationTraceEventBase';
import { FormulaErrorChangedEventType } from './FormulaErrorChangedEventType';

/** Event emitted when one formula cell's error code changes. */
export interface FormulaErrorChangedEvent extends FormulaCalculationTraceEventBase {
  readonly type: typeof FormulaErrorChangedEventType;
  readonly generation: number;
  readonly key: CellKey;
  readonly row: number;
  readonly col: number;
  readonly previousErrorCode: ErrorCode | undefined;
  readonly errorCode: ErrorCode | undefined;
}
