import { FormulaFunctionArguments, isFormulaError, type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { valueError } from '../runtime/googleRuntime';
/** TO_DOLLARS converts a value to a dollar amount. Example: =TO_DOLLARS(12.5) returns 12.5. */
export const TO_DOLLARS: FormulaFunction = {
  name: 'TO_DOLLARS',
  defaultCellFormat: { kind: 'currency', currency: 'USD' },
  evaluate(args, context) {
    if (args.length !== 1) return valueError();
    const value = new FormulaFunctionArguments(args, context).number(0);
    return isFormulaError(value) ? value : value;
  },
};
