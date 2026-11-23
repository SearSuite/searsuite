/**
 * LN: Returns the natural logarithm of a positive number.
 * Example: =LN(1) returns 0.
 */
import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { evaluateUnaryNumeric, numberError } from '../shared/mathUtils';

export const LN = evaluateUnaryNumeric(
  'LN',
  (value) => (value > 0 ? Math.log(value) : numberError()),
  1,
  1,
) satisfies FormulaFunction;
