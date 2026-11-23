import { type FormulaCellPosition } from './FormulaCellPosition';
import { type FormulaReferenceStyle } from './FormulaReferenceStyle';

/** Options used when resolving text, names, or dynamic references. */
export interface FormulaReferenceResolutionOptions {
  readonly style?: FormulaReferenceStyle;
  readonly currentCell?: FormulaCellPosition;
}
