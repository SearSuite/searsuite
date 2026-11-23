/**
 * ROUNDDOWN: Rounds a number toward zero to a specified number of digits.
 * Example: =ROUNDDOWN(-3.9,0) returns -3.
 */
import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { roundingFunction } from './roundingUtils';

export const ROUNDDOWN = roundingFunction('ROUNDDOWN', (value, digits) => {
  const factor = 10 ** digits;
  if (factor === 0) return 0;
  if (!Number.isFinite(factor)) return value;
  if (!Number.isFinite(value * factor)) return value;
  return (Math.sign(value) * Math.floor(Math.abs(value) * factor)) / factor;
}) satisfies FormulaFunction;
