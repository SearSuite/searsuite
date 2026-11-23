/**
 * ROUNDUP: Rounds a number away from zero to a specified number of digits.
 * Example: =ROUNDUP(-3.1,0) returns -4.
 */
import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { roundAwayFromZero, roundingFunction } from './roundingUtils';

export const ROUNDUP = roundingFunction('ROUNDUP', roundAwayFromZero) satisfies FormulaFunction;
