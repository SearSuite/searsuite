import { type ResolvedFormulaRange } from './ResolvedFormulaRange';

/** A function argument that intentionally retains reference identity. */
export interface FormulaReferenceArgument {
  readonly kind: 'reference';
  readonly reference: ResolvedFormulaRange;
}
