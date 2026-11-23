import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { integerArg, isFormulaErrorValue, textArg, valueError } from './textFormat/FormulaTextValues';

/** Returns characters from the end of text. Example: RIGHT("Sale",2) returns "le". */
export const RIGHT: FormulaFunction = {
  name: 'RIGHT',
  evaluate(args, context) {
    const text = textArg(args, 0, context);
    if (isFormulaErrorValue(text)) return text;
    const count = integerArg(args, 1, context, 1);
    return isFormulaErrorValue(count)
      ? count
      : count < 0
      ? valueError()
      : count === 0
      ? ''
      : text.slice(-count);
  },
};
