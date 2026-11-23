/**
 * SUMXMY2: Returns the sum of the squares of corresponding differences.
 * Example: =SUMXMY2({1,2},{3,4}) returns 8.
 */
import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { pairedSumFunction } from './arrayUtils';

export const SUMXMY2 = pairedSumFunction('SUMXMY2', (x, y) => (x - y) * (x - y)) satisfies FormulaFunction;
