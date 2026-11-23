/**
 * SIGN: Returns -1, 0, or 1 according to the sign of a number.
 * Example: =SIGN(0) returns 0.
 */
import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { evaluateUnaryNumeric } from '../shared/mathUtils';

export const SIGN = evaluateUnaryNumeric(
  'SIGN',
  (value) => (value > 0 ? 1 : value < 0 ? -1 : 0),
  1,
  1,
) satisfies FormulaFunction;
