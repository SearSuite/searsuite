import { type FormulaError } from './FormulaError';
import { type FormulaReferenceResolutionOptions } from './FormulaReferenceResolutionOptions';
import { type ResolvedFormulaRange } from './ResolvedFormulaRange';

/** Host-owned resolver for names and text references. */
export interface FormulaReferenceResolver {
  resolve(referenceText: string, options?: FormulaReferenceResolutionOptions): ResolvedFormulaRange | FormulaError;
}
