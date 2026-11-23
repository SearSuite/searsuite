/**
 * COT: Returns the cotangent of an angle in radians.
 * Example: =COT(RADIANS(45)) returns 1.
 */
import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { divisionError, evaluateUnaryNumeric, nameError } from '../shared/mathUtils';

export const COT = evaluateUnaryNumeric(
  'COT',
  (value) => (value === 0 ? divisionError() : 1 / Math.tan(value)),
  1,
  1,
  nameError,
  false,
) satisfies FormulaFunction;
