import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { isFormulaErrorValue, valueError } from './textFormat/FormulaTextValues';
import { flattenTextArg } from './textFunctionHelpers';

/** Joins text and ranges without a delimiter. Example: CONCAT("A",1) returns "A1". */
export const CONCAT: FormulaFunction = {
  name: 'CONCAT',
  evaluate(args, context) {
    if (args.length > 253) return valueError();
    let result = '';
    for (const arg of args) {
      const values = flattenTextArg(arg, context);
      if (isFormulaErrorValue(values)) return values;
      result += values.join('');
      if (result.length > 32767) return valueError();
    }
    return result;
  },
};
