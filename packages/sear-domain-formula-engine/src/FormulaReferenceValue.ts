import { type ResolvedFormulaRange } from './ResolvedFormulaRange';

/** Reference identity returned by reference-preserving functions. */
export interface FormulaReferenceValue {
  readonly kind: 'reference';
  readonly reference: ResolvedFormulaRange;
}
