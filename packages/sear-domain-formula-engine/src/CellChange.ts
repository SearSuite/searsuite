import { type CellKey } from './CellKey';
import { type FormulaValue } from './FormulaValue';

/** Value transition for one formula-visible cell. */
export interface CellChange {
  key: CellKey;
  row: number;
  col: number;
  oldVal: FormulaValue;
  newVal: FormulaValue;
}
