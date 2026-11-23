import { type CellKey } from './CellKey';
import { type FormulaValue } from './FormulaValue';
import { type FormulaRichResult } from './FormulaRichResult';

/** One result produced during formula batch evaluation. */
export interface EvalResult {
  key: CellKey;
  value: FormulaValue;
  richResult?: FormulaRichResult;
}
