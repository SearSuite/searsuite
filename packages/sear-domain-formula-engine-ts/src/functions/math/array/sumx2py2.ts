/**
 * SUMX2PY2: Returns the sum of the sums of corresponding squares.
 * Example: =SUMX2PY2({1,2},{3,4}) returns 30.
 */
import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { pairedSumFunction } from './arrayUtils';

export const SUMX2PY2 = pairedSumFunction('SUMX2PY2', (x, y) => x * x + y * y) satisfies FormulaFunction;
