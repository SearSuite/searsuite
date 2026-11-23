import { FormulaFunctionArguments, isFormulaError, type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { valueError } from '../runtime/googleRuntime';
/** TO_PERCENT converts a decimal to its percentage value. Example: =TO_PERCENT(0.25) returns 0.25 for percentage formatting. */
export const TO_PERCENT: FormulaFunction = {
  name: 'TO_PERCENT',
  defaultCellFormat: { kind: 'percent' },
  evaluate(args, context) {
    if (args.length !== 1) return valueError();
    const value = new FormulaFunctionArguments(args, context).number(0);
    return isFormulaError(value) ? value : value;
  },
};
