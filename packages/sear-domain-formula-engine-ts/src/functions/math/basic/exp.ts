/**
 * EXP: Returns e raised to the specified power.
 * Example: =EXP(0) returns 1.
 */
import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { evaluateUnaryNumeric, numberError } from '../shared/mathUtils';

export const EXP = evaluateUnaryNumeric(
  'EXP',
  (value) => {
    const result = Math.exp(value);
    return Number.isFinite(result) ? result : numberError();
  },
  1,
  1,
) satisfies FormulaFunction;
