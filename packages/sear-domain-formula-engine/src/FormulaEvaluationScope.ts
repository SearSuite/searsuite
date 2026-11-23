import { type FormulaValue } from './FormulaValue';

/** Lexical scope for formula-local names. */
export interface FormulaEvaluationScope {
  readonly parent?: FormulaEvaluationScope;
  get(name: string): FormulaValue | undefined;
  set(name: string, value: FormulaValue): void;
}
