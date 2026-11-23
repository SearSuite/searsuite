import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { integerArg, isFormulaErrorValue, textArg, valueError } from './textFormat/FormulaTextValues';

/** Finds case-sensitive text and returns a one-based position. Example: FIND("b","abc") returns 2. */
export const FIND: FormulaFunction = {
  name: 'FIND',
  evaluate(args, context) {
    const needle = textArg(args, 0, context);
    if (isFormulaErrorValue(needle)) return needle;
    const text = textArg(args, 1, context);
    if (isFormulaErrorValue(text)) return text;
    const start = integerArg(args, 2, context, 1);
    if (isFormulaErrorValue(start)) return start;
    const characters = [...text];
    if (start < 1 || start > characters.length + 1) return valueError();
    const index = text.indexOf(needle, characters.slice(0, start - 1).join('').length);
    return index < 0 ? valueError() : [...text.slice(0, index)].length + 1;
  },
};
