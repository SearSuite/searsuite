import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { isFormulaText } from '@searsuite/sear-foundation-utils';
import { numericDateText } from '../shared/formulaNumericDateText';
import { formatFixed } from './textFormat/ExcelNumberFormat';
import { booleanArg, coerceNumber, integerArg, isFormulaErrorValue, scalarValueArg, valueError } from './textFormat/FormulaTextValues';

/** Formats rounded fixed-decimal text. Example: FIXED(1234.567,1) returns "1,234.6". */
export const FIXED: FormulaFunction = {
  name: 'FIXED',

  evaluate(args, context) {
    const input = scalarValueArg(args, 0, context);
    if (isFormulaErrorValue(input)) return input;
    if (input === '' || isFormulaText(input) && input.value === '') return valueError();
    const numeric = coerceNumber(input);
    const number = isFormulaErrorValue(numeric) ? numericDateText(input, context) ?? numeric : numeric;
    if (isFormulaErrorValue(number)) return number;
    const decimals = integerArg(args, 1, context, 2);
    if (isFormulaErrorValue(decimals)) return decimals;
    if (decimals > 100) return valueError();
    const noCommas = booleanArg(args, 2, context, false);
    if (isFormulaErrorValue(noCommas)) return noCommas;
    return formatFixed(number, decimals, noCommas);
  },
};
