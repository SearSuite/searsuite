/**
 * ISO.CEILING: Rounds a number up to the nearest multiple.
 * Example: =ISO.CEILING(-4.3,2) returns -4.
 */
import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { roundingMultipleFunction } from './roundingUtils';

export const ISO_CEILING = roundingMultipleFunction(
  'ISO.CEILING',
  (number, significance) => Math.ceil(number / Math.abs(significance || 1)) * Math.abs(significance || 1),
  false,
) satisfies FormulaFunction;
