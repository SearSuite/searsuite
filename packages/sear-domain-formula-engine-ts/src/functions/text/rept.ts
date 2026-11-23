import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { integerArg, isFormulaErrorValue, textArg, valueError } from './textFormat/FormulaTextValues';

/** Repeats text a specified number of times. Example: REPT("*-",3) returns "*-*-*-". */
export const REPT: FormulaFunction = {
  name: 'REPT',
  evaluate(args, context) {
    if (args.length < 2 || args[1]?.kind === 'missing') return valueError();
    const text = textArg(args, 0, context);
    if (isFormulaErrorValue(text)) return text;
    const count = integerArg(args, 1, context, 0);
    if (isFormulaErrorValue(count)) return count;
    if (count < 0 || text.length * count > 32767) return valueError();
    return text.repeat(count);
  },
};
