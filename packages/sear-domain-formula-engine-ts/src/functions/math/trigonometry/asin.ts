/**
 * ASIN: Returns the arcsine of a number in radians.
 * Example: =ASIN(0) returns 0.
 */
import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { evaluateUnaryNumeric, numberError } from '../shared/mathUtils';

export const ASIN = evaluateUnaryNumeric(
  'ASIN',
  (value) => (value >= -1 && value <= 1 ? Math.asin(value) : numberError()),
  1,
  1,
) satisfies FormulaFunction;
