import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { byteTextLocale } from './byteTextSupport';
import { integerArg, isFormulaErrorValue, textArg, valueError } from './textFormat/FormulaTextValues';

/** Replaces text at a locale-defined DBCS byte position. Example: REPLACEB("abc", 2, 1, "x") returns "axc". */
export const REPLACEB: FormulaFunction = {
  name: 'REPLACEB',
  evaluate(args, context) {
    if (args.length < 4 || args[1]?.kind === 'missing' || args[2]?.kind === 'missing') return valueError();
    const text = textArg(args, 0, context);
    if (isFormulaErrorValue(text)) return text;
    const start = integerArg(args, 1, context, 1);
    if (isFormulaErrorValue(start)) return start;
    const count = integerArg(args, 2, context, 0);
    if (isFormulaErrorValue(count)) return count;
    const replacement = textArg(args, 3, context);
    return isFormulaErrorValue(replacement)
      ? replacement
      : start < 1 || count < 0 || count > 32767
      ? valueError()
      : byteTextLocale(context).replaceByBytes(text, start, count, replacement);
  },
};
