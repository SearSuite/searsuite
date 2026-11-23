/**
 * SQRT: Returns the positive square root of a number.
 * Example: =SQRT(0) returns 0.
 */
import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { evaluateUnaryNumeric, numberError } from '../shared/mathUtils';

export const SQRT = evaluateUnaryNumeric(
  'SQRT',
  (value) => (value >= 0 ? Math.sqrt(value) : numberError()),
  1,
  1,
) satisfies FormulaFunction;
