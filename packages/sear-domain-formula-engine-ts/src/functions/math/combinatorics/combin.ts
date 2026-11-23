/**
 * COMBIN: Returns the number of combinations for choosing items without repetition.
 * Example: =COMBIN(8,2) returns 28.
 */
import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { evaluateBinaryNumeric, numberError } from '../shared/mathUtils';
import { combination } from './combinatoricsUtils';

export const COMBIN = evaluateBinaryNumeric('COMBIN', (number, chosen) => {
  if (number < 0 || number > Number.MAX_SAFE_INTEGER || chosen < 0) return numberError();
  return combination(Math.min(Math.trunc(number), 2_147_483_647), Math.trunc(chosen), false);
}) satisfies FormulaFunction;
