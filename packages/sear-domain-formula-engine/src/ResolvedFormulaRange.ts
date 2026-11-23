import { type FormulaRangeSource } from './FormulaRangeSource';

/** Concrete finite range resolved against sheet bounds. */
export interface ResolvedFormulaRange {
  readonly source: FormulaRangeSource;
  readonly startRow: number;
  readonly startCol: number;
  readonly endRow: number;
  readonly endCol: number;
}
