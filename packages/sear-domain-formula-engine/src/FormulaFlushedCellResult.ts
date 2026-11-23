import { type CellKey } from './CellKey';
import { type ErrorCode } from './ErrorCode';
import { type FormulaValue } from './FormulaValue';

/** One cell result written during a formula batch flush. */
export interface FormulaFlushedCellResult {
  readonly key: CellKey;
  readonly row: number;
  readonly col: number;
  readonly previousResult: FormulaValue | undefined;
  readonly result: FormulaValue;
  readonly errorCode: ErrorCode | undefined;
}
