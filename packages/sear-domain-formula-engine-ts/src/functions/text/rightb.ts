import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { byteTextLocale } from './byteTextSupport';
import { integerArg, isFormulaErrorValue, textArg, valueError } from './textFormat/FormulaTextValues';

/** Returns trailing text limited by a locale-defined DBCS byte count. Example: RIGHTB("abc", 2) returns "bc". */
export const RIGHTB: FormulaFunction = {
  name: 'RIGHTB',
  evaluate(args, context) {
    const text = textArg(args, 0, context);
    if (isFormulaErrorValue(text)) return text;
    const count = integerArg(args, 1, context, 1);
    if (isFormulaErrorValue(count)) return count;
    if (count < 0) return valueError();
    const locale = byteTextLocale(context);
    return locale.sliceByBytes(text, Math.max(1, locale.byteLength(text) - count + 1), count);
  },
};
