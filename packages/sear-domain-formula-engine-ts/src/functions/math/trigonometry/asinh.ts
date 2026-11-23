/**
 * ASINH: Returns the inverse hyperbolic sine of a number.
 * Example: =ASINH(0) returns 0.
 */
import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { evaluateUnaryNumeric } from '../shared/mathUtils';

export const ASINH = evaluateUnaryNumeric(
  'ASINH',
  (value) => {
    // WPS evaluates negative inputs through this cancellation-prone logarithm.
    return value < 0 ? Math.log(value + Math.sqrt(value * value + 1)) : Math.asinh(value);
  },
  1,
  1,
) satisfies FormulaFunction;
