import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { isFormulaErrorValue, textArg } from './textFormat/FormulaTextValues';
import { widthTextLocale } from './widthTextSupport';

/** Converts half-width characters to full-width DBCS characters. Example: DBCS("ABC") returns "ＡＢＣ". */
export const DBCS: FormulaFunction = {
  name: 'DBCS',
  evaluate(args, context) {
    const text = textArg(args, 0, context);
    return isFormulaErrorValue(text) ? text : widthTextLocale(context).toFullWidth?.(text) ?? text;
  },
};
