import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { byteTextLocale } from './byteTextSupport';
import { integerArg, isFormulaErrorValue, textArg, valueError } from './textFormat/FormulaTextValues';

/** Finds case-sensitive text using locale-defined DBCS byte positions. Example: FINDB("b", "abc") returns 2. */
export const FINDB: FormulaFunction = {
  name: 'FINDB',
  evaluate(args, context) {
    const needle = textArg(args, 0, context);
    if (isFormulaErrorValue(needle)) return needle;
    const text = textArg(args, 1, context);
    if (isFormulaErrorValue(text)) return text;
    const start = integerArg(args, 2, context, 1);
    if (isFormulaErrorValue(start)) return start;
    const locale = byteTextLocale(context);
    if (start < 1 || start > locale.byteLength(text) + 1) return valueError();
    const position = locale.findByBytes(text, needle, start, true);
    return position || valueError();
  },
};
