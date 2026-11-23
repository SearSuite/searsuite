/**
 * ROUND: Rounds a number to a specified number of digits.
 * Example: =ROUND(-1.475,2) returns -1.48.
 */
import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { roundHalfAwayFromZero, roundingFunction } from './roundingUtils';

export const ROUND = roundingFunction('ROUND', roundHalfAwayFromZero) satisfies FormulaFunction;
