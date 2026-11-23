/**
 * SUMX2MY2: Returns the sum of the differences between corresponding squares.
 * Example: =SUMX2MY2({1,2},{3,4}) returns -20.
 */
import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { pairedSumFunction } from './arrayUtils';

export const SUMX2MY2 = pairedSumFunction('SUMX2MY2', (x, y) =>
  Math.abs(x) === Math.abs(y) ? 0 : (x - y) * (x + y)) satisfies FormulaFunction;
