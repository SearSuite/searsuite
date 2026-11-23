/**
 * COMBINA: Returns the number of combinations for choosing items with repetition.
 * Example: =COMBINA(4,3) returns 20.
 */
import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { evaluateBinaryNumeric, numberError } from '../shared/mathUtils';
import { combination } from './combinatoricsUtils';

export const COMBINA = evaluateBinaryNumeric('COMBINA', (number, chosen) => {
  if (number < 0 || chosen < 0) return numberError();
  return combination(Math.trunc(number), Math.trunc(chosen), true);
}) satisfies FormulaFunction;
