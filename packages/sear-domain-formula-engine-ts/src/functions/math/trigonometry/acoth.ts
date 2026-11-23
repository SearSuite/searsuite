/**
 * ACOTH: Returns the inverse hyperbolic cotangent of a number.
 * Example: =ACOTH(2) returns approximately 0.549306144.
 */
import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { evaluateUnaryNumeric, nameError, numberError } from '../shared/mathUtils';

export const ACOTH = evaluateUnaryNumeric(
  'ACOTH',
  (value) => (Math.abs(value) > 1 ? 0.5 * Math.log1p(2 / (value - 1)) : numberError()),
  1,
  1,
  nameError,
  false,
) satisfies FormulaFunction;
