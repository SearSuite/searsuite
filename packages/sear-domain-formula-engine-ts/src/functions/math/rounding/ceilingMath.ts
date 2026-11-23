/**
 * CEILING.MATH: Rounds a number up to the nearest multiple.
 * Example: =CEILING.MATH(24.3,5) returns 25.
 */
import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { roundingMultipleFunction } from './roundingUtils';

export const CEILING_MATH = roundingMultipleFunction(
  'CEILING.MATH',
  (number, significance, mode) => {
    const magnitude = Math.abs(significance || 1);
    if (!Number.isFinite(number / magnitude)) return number;
    if (number >= 0) return Math.ceil(number / magnitude) * magnitude;
    return (
      (mode === 0 ? -Math.floor(Math.abs(number) / magnitude) : -Math.ceil(Math.abs(number) / magnitude)) * magnitude
    );
  },
  true,
) satisfies FormulaFunction;
