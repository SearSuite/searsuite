import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { byteTextLocale } from './byteTextSupport';
import { integerArg, isFormulaErrorValue, textArg, valueError } from './textFormat/FormulaTextValues';

/** Returns leading text limited by a locale-defined DBCS byte count. Example: LEFTB("abc", 2) returns "ab". */
export const LEFTB: FormulaFunction = {
  name: 'LEFTB',
  evaluate(args, context) {
    const text = textArg(args, 0, context);
    if (isFormulaErrorValue(text)) return text;
    const count = integerArg(args, 1, context, 1);
    return isFormulaErrorValue(count)
      ? count
      : count < 0
      ? valueError()
      : byteTextLocale(context).sliceByBytes(text, 1, count);
  },
};
