import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { isFormulaErrorValue, textArg, valueError } from './textFormat/FormulaTextValues';

/** Returns the Unicode code point of the first character. Example: UNICODE("★") returns 9733. */
export const UNICODE: FormulaFunction = {
  name: 'UNICODE',
  evaluate(args, context) {
    const text = textArg(args, 0, context);
    return isFormulaErrorValue(text) ? text : text.length === 0 ? valueError() : text.codePointAt(0)!;
  },
};
