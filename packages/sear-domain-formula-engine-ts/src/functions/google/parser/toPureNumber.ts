import { FormulaFunctionArguments, isFormulaError, type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { valueError } from '../runtime/googleRuntime';
/** TO_PURE_NUMBER strips display formatting and returns a number. Example: =TO_PURE_NUMBER("42") returns 42. */
export const TO_PURE_NUMBER: FormulaFunction = {
  name: 'TO_PURE_NUMBER',
  evaluate(args, context) {
    if (args.length !== 1) return valueError();
    const value = new FormulaFunctionArguments(args, context).number(0);
    return isFormulaError(value) ? value : value;
  },
};
