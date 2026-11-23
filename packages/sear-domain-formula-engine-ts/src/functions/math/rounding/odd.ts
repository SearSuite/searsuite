/**
 * ODD: Rounds a number away from zero to the nearest odd integer.
 * Example: =ODD(0) returns 1.
 */
import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { evaluateUnaryNumeric } from '../shared/mathUtils';

export const ODD = evaluateUnaryNumeric(
  'ODD',
  (value) => {
    if (value === 0) return 1;
    const sign = value < 0 ? -1 : 1;
    const rounded = Math.ceil(Math.abs(value));
    return sign * (rounded % 2 === 1 ? rounded : rounded + 1);
  },
  1,
  1,
) satisfies FormulaFunction;
