/**
 * FLOOR.PRECISE: Rounds a number down to the nearest multiple using an absolute direction.
 * Example: =FLOOR.PRECISE(-3.2,1) returns -4.
 */
import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { roundingMultipleFunction } from './roundingUtils';

export const FLOOR_PRECISE = roundingMultipleFunction(
  'FLOOR.PRECISE',
  (number, significance) => Math.floor(number / Math.abs(significance || 1)) * Math.abs(significance || 1),
  false,
) satisfies FormulaFunction;
