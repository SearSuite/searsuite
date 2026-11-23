/**
 * LOG10: Returns the base-10 logarithm of a positive number.
 * Example: =LOG10(100) returns 2.
 */
import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { evaluateUnaryNumeric, numberError } from '../shared/mathUtils';

export const LOG10 = evaluateUnaryNumeric(
  'LOG10',
  (value) => (value > 0 ? Math.log10(value) : numberError()),
  1,
  1,
) satisfies FormulaFunction;
