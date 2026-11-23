/**
 * MOD: Returns the remainder after division.
 * Example: =MOD(-3,2) returns 1.
 */
import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { divisionError, evaluateBinaryNumeric } from '../shared/mathUtils';

export const MOD = evaluateBinaryNumeric('MOD', (number, divisor) => {
  if (divisor === 0) return divisionError();
  const remainder = number % divisor;
  return remainder !== 0 && Math.sign(remainder) !== Math.sign(divisor)
    ? remainder + divisor : remainder;
}) satisfies FormulaFunction;
