/**
 * ATAN2: Returns the angle from an X and Y coordinate pair in radians.
 * Example: =ATAN2(1,0) returns 0.
 */
import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { divisionError, evaluateBinaryNumeric } from '../shared/mathUtils';

export const ATAN2 = evaluateBinaryNumeric('ATAN2', (x, y) =>
  x === 0 && y === 0 ? divisionError() : Math.atan2(y, x),
) satisfies FormulaFunction;
