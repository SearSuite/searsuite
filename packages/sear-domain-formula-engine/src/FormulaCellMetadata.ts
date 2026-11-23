import { type FormulaCellSource } from './FormulaCellSource';
import { type FormulaMetadataCellReference } from './FormulaMetadataCellReference';
import { type FormulaValue } from './FormulaValue';

/** Read-only cell facts consumed by information formulas. */
export interface FormulaCellMetadata {
  readonly reference: FormulaMetadataCellReference;
  readonly source: FormulaCellSource;
  readonly value: FormulaValue;
  readonly formula?: string;
  readonly numberFormat?: string;
  readonly labelPrefix?: string;
  readonly locked?: boolean;
  readonly width?: number;
}
