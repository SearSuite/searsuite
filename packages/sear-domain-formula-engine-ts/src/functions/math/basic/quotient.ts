/**
 * QUOTIENT: Returns the integer portion of a division.
 * Example: =QUOTIENT(-10,3) returns -3.
 */
import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { divisionError, evaluateBinaryNumeric, numberError } from '../shared/mathUtils';

export const QUOTIENT = evaluateBinaryNumeric('QUOTIENT', (numerator, denominator) => {
  if (denominator === 0) return divisionError();
  const result = Math.trunc(numerator / denominator);
  return Number.isFinite(result) ? result : numberError();
}) satisfies FormulaFunction;
