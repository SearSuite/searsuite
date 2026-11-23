/**
 * RANDBETWEEN: Returns a random integer between two inclusive bounds.
 * Example: =RANDBETWEEN(7,7) returns 7.
 */
import { type FormulaFunction, type FormulaValue } from '@searsuite/sear-domain-formula-engine';
import { isFormulaErrorValue, numberError, readScalar, valueError } from '../shared/mathUtils';
import { randomValue } from './randomUtils';

export const RANDBETWEEN: FormulaFunction = {
  name: 'RANDBETWEEN',
  volatile: true,
  evaluate(args, context): FormulaValue {
    if (args.length !== 2) return valueError();
    const bottom = readScalar(args, 0, context);
    if (isFormulaErrorValue(bottom)) return bottom;
    const top = readScalar(args, 1, context);
    if (isFormulaErrorValue(top)) return top;

    const lower = Math.ceil(bottom);
    const upper = Math.floor(top);
    if (lower > upper) return numberError();
    const width = upper - lower + 1;
    if (!Number.isFinite(width)) return numberError();
    return Math.floor(randomValue(context) * width) + lower;
  },
};
