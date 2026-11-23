/**
 * SUMSQ: Returns the sum of the squares of numeric values.
 * Example: =SUMSQ(0,3) returns 9.
 */
import { type FormulaFunction, type FormulaValue } from '@searsuite/sear-domain-formula-engine';
import { collectNumbers, isFormulaErrorValue, numberError, valueError } from '../shared/mathUtils';

export const SUMSQ: FormulaFunction = {
  name: 'SUMSQ',
  evaluate(args, context): FormulaValue {
    if (args.length < 1) return valueError();
    const values = collectNumbers(args, context, { referenceNumericOnly: true });
    if (isFormulaErrorValue(values)) return values;
    const result = values.reduce((sum, value) => sum + value * value, 0);
    return Number.isFinite(result) ? result : numberError();
  },
};
