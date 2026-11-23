import { isFormulaError, type FormulaFunction, type FormulaValue } from '@searsuite/sear-domain-formula-engine';
import { readArg } from '../../shared/helpers';
import { isBlankScalarInput } from '../../shared/blankScalarInput';
import { matrixArg } from '../../lookup/lookupHelpers';
import { valueError } from '../runtime/googleRuntime';
/** JOIN concatenates values with a delimiter. Example: =JOIN("-",{1,2,3}) returns "1-2-3". */
export const JOIN: FormulaFunction = {
  name: 'JOIN',
  evaluate(args, context) {
    if (args.length < 2) return valueError();
    const delimiter = args[0]?.kind === 'missing' || isBlankScalarInput(args[0]!, context)
      ? ''
      : readArg(args[0]!, context);
    if (isFormulaError(delimiter) || Array.isArray(delimiter) || typeof delimiter === 'object')
      return isFormulaError(delimiter) ? delimiter : valueError();
    const values: FormulaValue[] = [];
    for (const arg of args.slice(1)) {
      const value = matrixArg(arg, context);
      if (isFormulaError(value)) return value;
      for (const item of value.flat()) {
        if (isFormulaError(item)) return item;
        values.push(item);
      }
    }
    return values.map(display).join(String(delimiter));
  },
};
function display(value: FormulaValue): string {
  if (value === null) return '';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return typeof value === 'object' && value !== null && 'value' in value ? String(value.value) : String(value);
}
