import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { byteTextLocale } from './byteTextSupport';
import { isFormulaErrorValue, textArg } from './textFormat/FormulaTextValues';

/** Returns text length measured in locale-defined DBCS bytes. Example: LENB("abc") returns 3. */
export const LENB: FormulaFunction = {
  name: 'LENB',
  evaluate(args, context) {
    const text = textArg(args, 0, context);
    return isFormulaErrorValue(text) ? text : byteTextLocale(context).byteLength(text);
  },
};
