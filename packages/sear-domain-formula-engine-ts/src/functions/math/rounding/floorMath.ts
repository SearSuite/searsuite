/**
 * FLOOR.MATH: Rounds a number down to the nearest multiple.
 * Example: =FLOOR.MATH(-8.1,2) returns -10.
 */
import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { roundingMultipleFunction } from './roundingUtils';

export const FLOOR_MATH = roundingMultipleFunction(
  'FLOOR.MATH',
  (number, significance, mode) => {
    const magnitude = Math.abs(significance || 1);
    if (!Number.isFinite(number / magnitude)) return number;
    if (number >= 0) return Math.floor(number / magnitude) * magnitude;
    return (
      (mode === 0 ? -Math.ceil(Math.abs(number) / magnitude) : -Math.floor(Math.abs(number) / magnitude)) * magnitude
    );
  },
  true,
) satisfies FormulaFunction;
