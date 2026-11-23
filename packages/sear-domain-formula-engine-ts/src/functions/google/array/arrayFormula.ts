import { isFormulaError, type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { readArg } from '../../shared/helpers';
import { valueError } from '../runtime/googleRuntime';
/** ARRAYFORMULA exposes an expression's array result. Example: =ARRAYFORMULA({1,2}*2) returns {2,4}. */
export const ARRAYFORMULA: FormulaFunction = {
  name: 'ARRAYFORMULA',
  evaluate(args, context) {
    if (args.length !== 1) return valueError();
    const value = readArg(args[0]!, context);
    return isFormulaError(value) ? value : value;
  },
};
