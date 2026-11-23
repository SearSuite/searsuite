import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { integerArg, isFormulaErrorValue, textArg, valueError } from './textFormat/FormulaTextValues';
import { excelWildcardSearch } from './textFunctionHelpers';

/** Finds text case-insensitively with Excel wildcards. Example: SEARCH("b*","abc") returns 2. */
export const SEARCH: FormulaFunction = {
  name: 'SEARCH',
  evaluate(args, context) {
    const needle = textArg(args, 0, context);
    if (isFormulaErrorValue(needle)) return needle;
    const text = textArg(args, 1, context);
    if (isFormulaErrorValue(text)) return text;
    const start = integerArg(args, 2, context, 1);
    if (isFormulaErrorValue(start)) return start;
    const characters = [...text];
    if (start < 1 || start > characters.length + 1) return valueError();
    const from = characters.slice(0, start - 1).join('').length;
    const position = excelWildcardSearch(needle, text, from);
    return position === undefined ? valueError() : [...text.slice(0, position)].length + 1;
  },
};
