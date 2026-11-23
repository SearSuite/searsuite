import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { coerceNumber, isFormulaErrorValue, scalarValueArg, valueError } from './textFormat/FormulaTextValues';
import { numericDateText } from '../shared/formulaNumericDateText';
import { macRomanCharacter } from './macRomanCodePage';

/** Returns the character for a code-page number. Example: CHAR(65) returns "A". */
export const CHAR: FormulaFunction = {
  name: 'CHAR',
  evaluate(args, context) {
    const value = scalarValueArg(args, 0, context);
    if (isFormulaErrorValue(value)) return value;
    const parsed = coerceNumber(value);
    const numeric = isFormulaErrorValue(parsed) ? numericDateText(value, context) ?? parsed : parsed;
    if (isFormulaErrorValue(numeric)) return numeric;
    const code = Math.trunc(numeric);
    if (code >= 1 && code <= 255)
      return context.textLocale?.characterFromCode?.(code) ?? macRomanCharacter(code) ?? String.fromCharCode(code);
    return context.textLocale?.characterFromCode?.(code) ??
      (code >= 0xa000 && code <= 0xffff ? '\uFFFD' : valueError());
  },
};
