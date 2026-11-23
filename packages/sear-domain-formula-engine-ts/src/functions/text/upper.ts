import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { isFormulaErrorValue, textArg } from './textFormat/FormulaTextValues';

/** Converts letters to uppercase. Example: UPPER("Excel") returns "EXCEL". */
export const UPPER: FormulaFunction = {
  name: 'UPPER',
  evaluate(args, context) {
    const text = textArg(args, 0, context);
    return isFormulaErrorValue(text) ? text : text.toUpperCase();
  },
};
