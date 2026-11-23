import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { integerArg, isFormulaErrorValue, textArg, valueError } from './textFormat/FormulaTextValues';

/** Returns characters from the start of text. Example: LEFT("Sale",2) returns "Sa". */
export const LEFT: FormulaFunction = {
  name: 'LEFT',
  evaluate(args, context) {
    const text = textArg(args, 0, context);
    if (isFormulaErrorValue(text)) return text;
    const count = integerArg(args, 1, context, 1);
    return isFormulaErrorValue(count) ? count : count < 0 ? valueError() : text.slice(0, count);
  },
};
