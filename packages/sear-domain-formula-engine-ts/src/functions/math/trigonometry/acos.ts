/**
 * ACOS: Returns the arccosine of a number in radians.
 * Example: =ACOS(1) returns 0.
 */
import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { evaluateUnaryNumeric, numberError } from '../shared/mathUtils';

export const ACOS = evaluateUnaryNumeric(
  'ACOS',
  (value) => (value >= -1 && value <= 1 ? Math.acos(value) : numberError()),
  1,
  1,
) satisfies FormulaFunction;
