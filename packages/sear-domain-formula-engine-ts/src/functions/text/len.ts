import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { mapArrayValues, readArrayArgument } from '../shared/arrayArgumentValues';
import { coerceText, isFormulaErrorValue, textArg } from './textFormat/FormulaTextValues';

/** Returns the UTF-16 character count used by Excel compatibility mode. Example: LEN("Excel") returns 5. */
export const LEN: FormulaFunction = {
  name: 'LEN',
  evaluate(args, context) {
    if (args[0]) {
      const value = readArrayArgument(args[0], context, true);
      if (Array.isArray(value)) return mapArrayValues(value, (item) => {
        if (item === null) return 0;
        const text = coerceText(item);
        return isFormulaErrorValue(text) ? text : text.length;
      });
    }
    const text = textArg(args, 0, context);
    return isFormulaErrorValue(text) ? text : text.length;
  },
};
