/**
 * ROMAN: Converts an Arabic number to Roman numeral text.
 * Example: =ROMAN(2024) returns "MMXXIV".
 */
import { type FormulaFunction, type FormulaValue } from '@searsuite/sear-domain-formula-engine';
import { isFormulaText } from '@searsuite/sear-foundation-utils';
import { readArg } from '../../shared/helpers';
import { numericDateText } from '../../shared/formulaNumericDateText';
import { integerArgument, isFormulaErrorValue, numericValue, numberError, valueError } from '../shared/mathUtils';
import { roman } from './combinatoricsUtils';

export const ROMAN: FormulaFunction = {
  name: 'ROMAN',
  evaluate(args, context): FormulaValue {
    if (args.length < 1 || args.length > 2) return valueError();
    const input = readArg(args[0]!, context);
    if (isFormulaErrorValue(input)) return input;
    if (Array.isArray(input) || input === '' || (isFormulaText(input) && input.value === '')) return valueError();
    const numeric = numericValue(input);
    const value = isFormulaErrorValue(numeric) ? numericDateText(input, context) ?? numeric : numeric;
    if (isFormulaErrorValue(value)) return value;
    const form = integerArgument(args, 1, context, 0);
    if (isFormulaErrorValue(form)) return form;
    // Excel and WPS treat a tiny negative value as zero here.
    if (value < -1e-12) return numberError();
    const integer = Math.trunc(value);
    if (integer > 3999) return numberError();
    if (form < 0 || form > 4) return numberError();
    return roman(integer, form);
  },
};
