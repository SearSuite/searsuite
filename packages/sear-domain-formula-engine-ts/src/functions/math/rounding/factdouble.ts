/**
 * FACTDOUBLE: Returns the double factorial for nonnegative values.
 * Example: =FACTDOUBLE(7) returns 105.
 */
import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { evaluateUnaryNumeric } from '../shared/mathUtils';
import { doubleFactorial } from './roundingUtils';

export const FACTDOUBLE = evaluateUnaryNumeric(
  'FACTDOUBLE',
  (value) => doubleFactorial(value),
  1,
  1,
) satisfies FormulaFunction;
