import { type FormulaArg } from './FormulaArg';
import { type FormulaAST } from './FormulaAST';

type FormulaArgumentLike = FormulaArg | FormulaAST;

/** Narrows a formula argument to one or more discriminant kinds. */
export function isFormulaArgumentKind<K extends FormulaArgumentLike['kind']>(
  arg: FormulaArgumentLike | null | undefined,
  ...kinds: readonly K[]
): arg is Extract<FormulaArgumentLike, { readonly kind: K }> {
  return arg !== null && arg !== undefined && kinds.includes(arg.kind as K);
}
