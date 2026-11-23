import { FormulaFunctionArguments, isFormulaError, type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { valueError } from '../runtime/googleRuntime';
/** SPLIT divides text into a spilling row. Example: =SPLIT("a,b,c",",") returns {"a","b","c"}. */
export const SPLIT: FormulaFunction = {
  name: 'SPLIT',
  evaluate(args, context) {
    if (args.length < 2 || args.length > 4) return valueError();
    const reader = new FormulaFunctionArguments(args, context);
    const text = reader.text(0);
    if (isFormulaError(text)) return text;
    const delimiter = reader.text(1);
    if (isFormulaError(delimiter) || delimiter === '') return isFormulaError(delimiter) ? delimiter : valueError();
    const splitByEach = reader.boolean(2, true);
    if (isFormulaError(splitByEach)) return splitByEach;
    const removeEmpty = reader.boolean(3, true);
    if (isFormulaError(removeEmpty)) return removeEmpty;
    const pattern = splitByEach ? new RegExp(Array.from(delimiter).map(escape).join('|')) : delimiter;
    const parts = text.split(pattern);
    return [removeEmpty ? parts.filter(Boolean) : parts];
  },
};
function escape(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}
