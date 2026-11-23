import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { coerceNumber, isFormulaErrorValue, scalarValueArg, valueError } from './textFormat/FormulaTextValues';
import { numericDateText } from '../shared/formulaNumericDateText';

/** Returns the Unicode character for a code point. Example: UNICHAR(9733) returns "★". */
export const UNICHAR: FormulaFunction = {
  name: 'UNICHAR',
  evaluate(args, context) {
    const value = scalarValueArg(args, 0, context);
    if (isFormulaErrorValue(value)) return value;
    const number = numericDateText(value, context) ?? coerceNumber(value);
    if (isFormulaErrorValue(number)) return number;
    const code = Math.trunc(number);
    try {
      return code < 1 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)
        ? valueError()
        : String.fromCodePoint(code);
    } catch {
      return valueError();
    }
  },
};
