/**
 * ACOT: Returns the arccotangent of a number in radians.
 * Example: =ACOT(1) returns pi/4.
 */
import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { evaluateUnaryNumeric, nameError } from '../shared/mathUtils';

export const ACOT = evaluateUnaryNumeric(
  'ACOT',
  (value) => (value === 0 ? Math.PI / 2 : value > 0 ? Math.atan(1 / value) : Math.atan(1 / value) + Math.PI),
  1,
  1,
  nameError,
  false,
) satisfies FormulaFunction;
