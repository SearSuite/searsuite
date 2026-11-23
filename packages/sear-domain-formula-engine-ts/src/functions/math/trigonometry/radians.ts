/**
 * RADIANS: Converts an angle from degrees to radians.
 * Example: =RADIANS(180) returns pi.
 */
import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { evaluateUnaryNumeric } from '../shared/mathUtils';

export const RADIANS = evaluateUnaryNumeric(
  'RADIANS',
  (value) => value * (Math.PI / 180),
  1,
  1,
) satisfies FormulaFunction;
