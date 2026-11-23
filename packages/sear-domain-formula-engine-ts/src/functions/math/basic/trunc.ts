/**
 * TRUNC: Truncates a number toward zero to a specified number of digits.
 * Example: =TRUNC(-3.9) returns -3.
 */
import { type FormulaFunction, type FormulaValue } from '@searsuite/sear-domain-formula-engine';
import { isFormulaErrorValue, readScalar, valueError } from '../shared/mathUtils';
import { truncate } from '../shared/numberUtils';

export const TRUNC: FormulaFunction = {
  name: 'TRUNC',
  evaluate(args, context): FormulaValue {
    if (args.length < 1 || args.length > 2) return valueError();
    const value = readScalar(args, 0, context);
    if (isFormulaErrorValue(value)) return value;
    const digits = readScalar(args, 1, context, 0);
    if (isFormulaErrorValue(digits)) return digits;
    return truncate(value, Math.trunc(digits));
  },
};
