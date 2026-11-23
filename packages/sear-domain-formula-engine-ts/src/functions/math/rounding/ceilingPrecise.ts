/**
 * CEILING.PRECISE: Rounds a number up to the nearest multiple, using an absolute direction.
 * Example: =CEILING.PRECISE(-4.3,2) returns -4.
 */
import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { roundingMultipleFunction } from './roundingUtils';

export const CEILING_PRECISE = roundingMultipleFunction(
  'CEILING.PRECISE',
  (number, significance) => Math.ceil(number / Math.abs(significance || 1)) * Math.abs(significance || 1),
  false,
) satisfies FormulaFunction;
