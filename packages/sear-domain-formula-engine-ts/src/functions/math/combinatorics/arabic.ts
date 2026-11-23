/**
 * ARABIC: Converts a Roman numeral text value to an Arabic number.
 * Example: =ARABIC("MCMXCIX") returns 1999.
 */
import { type FormulaFunction, type FormulaValue } from '@searsuite/sear-domain-formula-engine';
import { isFormulaErrorValue, readText, valueError } from '../shared/mathUtils';
import { isBlankScalarInput } from '../../shared/blankScalarInput';
import { romanValue } from './combinatoricsUtils';

export const ARABIC: FormulaFunction = {
  name: 'ARABIC',
  evaluate(args, context): FormulaValue {
    if (args.length !== 1) return valueError();
    if (isBlankScalarInput(args[0]!, context)) return 0;
    const text = readText(args, 0, context);
    if (isFormulaErrorValue(text)) return text;
    const normalized = text.trim().toUpperCase();
    if (normalized === '') return 0;
    if (!/^[IVXLCDM]+$/.test(normalized)) return valueError();
    if (!/^M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/.test(normalized))
      return valueError();
    let total = 0;
    for (let index = 0; index < normalized.length; index++) {
      const current = romanValue(normalized[index] ?? '');
      const next = romanValue(normalized[index + 1] ?? '');
      total += current < next ? -current : current;
    }
    return total > 0 && total <= 3999 ? total : valueError();
  },
};
