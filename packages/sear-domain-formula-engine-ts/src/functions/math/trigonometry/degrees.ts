/**
 * DEGREES: Converts an angle from radians to degrees.
 * Example: =DEGREES(PI()) returns 180.
 */
import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { evaluateUnaryNumeric } from '../shared/mathUtils';

export const DEGREES = evaluateUnaryNumeric(
  'DEGREES',
  (value) => value * (180 / Math.PI),
  1,
  1,
) satisfies FormulaFunction;
