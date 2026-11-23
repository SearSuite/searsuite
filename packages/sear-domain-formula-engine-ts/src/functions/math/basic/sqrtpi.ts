/**
 * SQRTPI: Returns the square root of a number multiplied by pi.
 * Example: =SQRTPI(0) returns 0.
 */
import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { evaluateUnaryNumeric, numberError } from '../shared/mathUtils';

export const SQRTPI = evaluateUnaryNumeric(
  'SQRTPI',
  (value) => (value >= 0 ? Math.sqrt(value) * Math.sqrt(Math.PI) : numberError()),
  1,
  1,
) satisfies FormulaFunction;
