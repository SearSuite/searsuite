import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { formatDollar } from './textFormat/ExcelNumberFormat';
import { isFormulaErrorValue, numberArg, optionalNumberArg, valueError } from './textFormat/FormulaTextValues';

/** Formats a number as currency text. Example: DOLLAR(1234.5,2) returns "$1,234.50". */
export const DOLLAR: FormulaFunction = {
  name: 'DOLLAR',

  evaluate(args, context) {
    const number = numberArg(args, 0, context);
    if (isFormulaErrorValue(number)) return number;
    const decimalInput = optionalNumberArg(args, 1, context, 2);
    if (isFormulaErrorValue(decimalInput)) return decimalInput;
    const decimals = Math.floor(decimalInput);
    if (decimals > 100) return valueError();
    return context.textLocale?.formatCurrency?.(number, decimals)
      ?? formatDollar(number, decimals, context.textLocale?.currencySymbol);
  },
};
