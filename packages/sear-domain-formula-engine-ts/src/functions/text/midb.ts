import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { byteTextLocale } from './byteTextSupport';
import { integerArg, isFormulaErrorValue, textArg, valueError } from './textFormat/FormulaTextValues';

/** Returns text from a locale-defined DBCS byte position. Example: MIDB("abc", 2, 1) returns "b". */
export const MIDB: FormulaFunction = {
  name: 'MIDB',
  evaluate(args, context) {
    if (args.length < 3 || args[1]?.kind === 'missing' || args[2]?.kind === 'missing') return valueError();
    const text = textArg(args, 0, context);
    if (isFormulaErrorValue(text)) return text;
    const start = integerArg(args, 1, context, 1);
    if (isFormulaErrorValue(start)) return start;
    const count = integerArg(args, 2, context, 0);
    return isFormulaErrorValue(count)
      ? count
      : start < 1 || count < 0
      ? valueError()
      : byteTextLocale(context).sliceByBytes(text, start, count);
  },
};
