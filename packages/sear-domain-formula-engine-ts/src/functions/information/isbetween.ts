import { type FormulaFunction, isFormulaError } from '@searsuite/sear-domain-formula-engine';
import { booleanArg, numberArg, lookupValueError } from '../lookup/lookupHelpers';

/** ISBETWEEN tests whether a value lies between bounds. Example: =ISBETWEEN(5,1,10) returns TRUE. */
export const ISBETWEEN: FormulaFunction = {
  name: 'ISBETWEEN',
  evaluate(args, context) {
    if (args.length < 3 || args.length > 5) return lookupValueError();
    const value = numberArg(args[0], context);
    const lower = numberArg(args[1], context);
    const upper = numberArg(args[2], context);
    const lowerInclusive = booleanArg(args[3], context, true);
    const upperInclusive = booleanArg(args[4], context, true);
    for (const item of [value, lower, upper, lowerInclusive, upperInclusive]) if (isFormulaError(item)) return item;
    return (lowerInclusive ? value >= lower : value > lower) && (upperInclusive ? value <= upper : value < upper);
  },
};
