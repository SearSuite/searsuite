import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { isFormulaText } from '@searsuite/sear-foundation-utils';
import { scalarValueArg, isFormulaErrorValue } from './textFormat/FormulaTextValues';

/** Returns text values and an empty string for non-text values. Example: T("Excel") returns "Excel". */
export const T: FormulaFunction = {
  name: 'T',
  evaluate(args, context) {
    const value = scalarValueArg(args, 0, context);
    if (isFormulaErrorValue(value)) return value;
    return isFormulaText(value) ? value.value : typeof value === 'string' ? value : '';
  },
};
