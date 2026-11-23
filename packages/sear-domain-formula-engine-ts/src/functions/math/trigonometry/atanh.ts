/**
 * ATANH: Returns the inverse hyperbolic tangent of a number.
 * Example: =ATANH(0) returns 0.
 */
import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { evaluateUnaryNumeric, numberError } from '../shared/mathUtils';

export const ATANH = evaluateUnaryNumeric(
  'ATANH',
  (value) => (Math.abs(value) < 1 ? Math.atanh(value) : numberError()),
  1,
  1,
) satisfies FormulaFunction;
