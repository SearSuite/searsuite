import { type FormulaCubeMemberValue } from './FormulaCubeMemberValue';
import { type FormulaCubeSetValue } from './FormulaCubeSetValue';
import { type FormulaError } from './FormulaError';
import { type FormulaReferenceValue } from './FormulaReferenceValue';
import { type FormulaText } from './FormulaText';
import { type FormulaTupleValue } from './FormulaTupleValue';

/** Scalar, collection, error, or reference result produced by formulas. */
export type FormulaValue =
  | null
  | number
  | string
  | boolean
  | FormulaText
  | FormulaError
  | FormulaReferenceValue
  | FormulaTupleValue
  | FormulaCubeMemberValue
  | FormulaCubeSetValue
  | FormulaValue[];
