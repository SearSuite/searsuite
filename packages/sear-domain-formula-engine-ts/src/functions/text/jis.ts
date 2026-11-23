import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { isFormulaErrorValue, textArg } from './textFormat/FormulaTextValues';
import { widthTextLocale } from './widthTextSupport';

/** Converts half-width text to Japanese full-width text. Example: JIS("ABC ｶ") returns "ＡＢＣ　カ". */
export const JIS: FormulaFunction = {
  name: 'JIS',
  evaluate(args, context) {
    const text = textArg(args, 0, context);
    if (isFormulaErrorValue(text)) return text;
    const locale = widthTextLocale(context);
    return locale.toJis?.(text) ?? locale.toFullWidth?.(text) ?? text;
  },
};
