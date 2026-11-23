import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { isFormulaErrorValue, textArg } from './textFormat/FormulaTextValues';

/** Compares two strings with case sensitivity. Example: EXACT("A","a") returns FALSE. */
export const EXACT: FormulaFunction = {
  name: 'EXACT',
  evaluate(args, context) {
    const left = textArg(args, 0, context);
    if (isFormulaErrorValue(left)) return left;
    const right = textArg(args, 1, context);
    return isFormulaErrorValue(right) ? right : left === right;
  },
};
