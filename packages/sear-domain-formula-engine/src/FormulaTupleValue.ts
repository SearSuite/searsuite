import { type FormulaValue } from './FormulaValue';

/** Tuple expression preserving the identity of its items. */
export interface FormulaTupleValue {
  readonly kind: 'tuple';
  readonly items: readonly FormulaValue[];
}
