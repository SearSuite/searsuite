import { type FormulaValue } from './FormulaValue';

/** One range cell with optional visibility and source metadata. */
export interface FormulaRangeCell {
  readonly row: number;
  readonly col: number;
  readonly value: FormulaValue;
  readonly hidden?: boolean;
  readonly filtered?: boolean;
  readonly source?: 'empty' | 'value' | 'formula';
  readonly formulaName?: string;
}
