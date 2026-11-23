/**
 * EVEN: Rounds a number away from zero to the nearest even integer.
 * Example: =EVEN(1.5) returns 2.
 */
import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { evaluateUnaryNumeric } from '../shared/mathUtils';

export const EVEN = evaluateUnaryNumeric(
  'EVEN',
  (value) => {
    const sign = value < 0 ? -1 : 1;
    const rounded = Math.ceil(Math.abs(value));
    return sign * (rounded % 2 === 0 ? rounded : rounded + 1);
  },
  1,
  1,
) satisfies FormulaFunction;
