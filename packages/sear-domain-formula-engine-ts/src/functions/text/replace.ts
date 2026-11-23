import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { integerArg, isFormulaErrorValue, textArg, valueError } from './textFormat/FormulaTextValues';

/** Replaces characters at a one-based position. Example: REPLACE("abc",2,1,"X") returns "aXc". */
export const REPLACE: FormulaFunction = {
  name: 'REPLACE',
  evaluate(args, context) {
    if (args.length < 4 || args[1]?.kind === 'missing' || args[2]?.kind === 'missing') return valueError();
    const text = textArg(args, 0, context);
    if (isFormulaErrorValue(text)) return text;
    const start = integerArg(args, 1, context, 1);
    if (isFormulaErrorValue(start)) return start;
    const count = integerArg(args, 2, context, 0);
    if (isFormulaErrorValue(count)) return count;
    const replacement = textArg(args, 3, context);
    if (isFormulaErrorValue(replacement)) return replacement;
    if (start < 1 || count < 0) return valueError();
    return text.slice(0, start - 1) + replacement + text.slice(start - 1 + count);
  },
};
