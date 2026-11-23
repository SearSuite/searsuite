/**
 * SEC: Returns the secant of an angle in radians.
 * Example: =SEC(0) returns 1.
 */
import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { divisionError, evaluateUnaryNumeric, nameError } from '../shared/mathUtils';

export const SEC = evaluateUnaryNumeric(
  'SEC',
  (value) => {
    const cosine = Math.cos(value);
    return cosine === 0 ? divisionError() : 1 / cosine;
  },
  1,
  1,
  nameError,
  false,
) satisfies FormulaFunction;
