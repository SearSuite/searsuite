import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { integerArg, isFormulaErrorValue, textArg, valueError } from './textFormat/FormulaTextValues';

/** Returns a substring by one-based start and length. Example: MID("Fluid Flow",7,4) returns "Flow". */
export const MID: FormulaFunction = {
  name: 'MID',
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
      : text.slice(start - 1, start - 1 + count);
  },
};
