/**
 * LOG: Returns the logarithm of a number for a specified base.
 * Example: =LOG(8,2) returns 3.
 */
import { type FormulaFunction, type FormulaValue } from '@searsuite/sear-domain-formula-engine';
import { isFormulaErrorValue, readScalar, divisionError, numberError, valueError } from '../shared/mathUtils';

export const LOG: FormulaFunction = {
  name: 'LOG',
  evaluate(args, context): FormulaValue {
    if (args.length < 1 || args.length > 2) return valueError();
    const number = readScalar(args, 0, context);
    if (isFormulaErrorValue(number)) return number;
    const base = readScalar(args, 1, context, 10);
    if (isFormulaErrorValue(base)) return base;
    if (base === 1 && number > 0) return divisionError();
    return number > 0 && base > 0 && base !== 1 ? Math.log(number) / Math.log(base) : numberError();
  },
};
