import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { isFormulaErrorValue, textArg } from './textFormat/FormulaTextValues';

/** Removes ASCII control characters 0 through 31. Example: CLEAN(CHAR(9)&"A") returns "A". */
export const CLEAN: FormulaFunction = {
  name: 'CLEAN',
  evaluate(args, context) {
    const text = textArg(args, 0, context);
    return isFormulaErrorValue(text) ? text : text.replace(/[\u0000-\u001f]/g, '');
  },
};
