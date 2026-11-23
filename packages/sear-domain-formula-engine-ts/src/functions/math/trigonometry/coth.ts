/**
 * COTH: Returns the hyperbolic cotangent of a number.
 * Example: =COTH(1) returns approximately 1.313035285.
 */
import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { divisionError, evaluateUnaryNumeric, nameError } from '../shared/mathUtils';

export const COTH = evaluateUnaryNumeric(
  'COTH',
  (value) => (value === 0 ? divisionError() : 1 / Math.tanh(value)),
  1,
  1,
  nameError,
  false,
) satisfies FormulaFunction;
