/**
 * ACOSH: Returns the inverse hyperbolic cosine of a number.
 * Example: =ACOSH(2) returns approximately 1.316957897.
 */
import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { evaluateUnaryNumeric, numberError } from '../shared/mathUtils';

export const ACOSH = evaluateUnaryNumeric(
  'ACOSH',
  (value) => (value >= 1 ? Math.acosh(value) : numberError()),
  1,
  1,
) satisfies FormulaFunction;
