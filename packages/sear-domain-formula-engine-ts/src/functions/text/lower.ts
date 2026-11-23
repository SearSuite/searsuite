import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { isFormulaErrorValue, textArg } from './textFormat/FormulaTextValues';

/** Converts letters to lowercase. Example: LOWER("Excel") returns "excel". */
export const LOWER: FormulaFunction = {
  name: 'LOWER',
  evaluate(args, context) {
    const text = textArg(args, 0, context);
    return isFormulaErrorValue(text) ? text : text.toLowerCase();
  },
};
