import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { isFormulaErrorValue, textArg } from './textFormat/FormulaTextValues';
import { widthTextLocale } from './widthTextSupport';

/** Converts full-width DBCS characters to half-width characters. Example: ASC("ＡＢＣ") returns "ABC". */
export const ASC: FormulaFunction = {
  name: 'ASC',
  evaluate(args, context) {
    const text = textArg(args, 0, context);
    return isFormulaErrorValue(text) ? text : widthTextLocale(context).toHalfWidth?.(text) ?? text;
  },
};
