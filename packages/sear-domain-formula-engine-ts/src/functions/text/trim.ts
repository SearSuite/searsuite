import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { isFormulaErrorValue, textArg } from './textFormat/FormulaTextValues';

/** Removes outer ASCII spaces and collapses internal runs. Example: TRIM(" a  b ") returns "a b". */
export const TRIM: FormulaFunction = {
  name: 'TRIM',
  evaluate(args, context) {
    const text = textArg(args, 0, context);
    return isFormulaErrorValue(text) ? text : text.replace(/ +/g, ' ').replace(/^ | $/g, '');
  },
};
