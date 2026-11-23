import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { isFormulaErrorValue, textArg, valueError } from './textFormat/FormulaTextValues';
import { parseExcelDateTime } from '../dateTime/shared/dateTimeUtils';
import { dateTimeParseOptions } from '../dateTime/shared/dateTimeFunctionUtils';
import { isBlankScalarInput } from '../shared/blankScalarInput';
import { parseNumberValue } from '@searsuite/sear-domain-format';

/** Converts common numeric text to a number. Example: VALUE("$1,234.50") returns 1234.5. */
export const VALUE: FormulaFunction = {
  name: 'VALUE',
  evaluate(args, context) {
    const text = textArg(args, 0, context);
    if (isFormulaErrorValue(text)) return text;
    if (args[0] && isBlankScalarInput(args[0], context)) return 0;
    const normalized = text.trim().replace(/^[\p{Sc}]\s*/u, '');
    const numericBody = normalized.replace(/%+$/, '');
    const validGroups = !numericBody.includes(',') || /^[+-]?\d{1,3}(,\d{3})+(?:\.\d*)?$/.test(numericBody);
    if (validGroups) {
      const numeric = parseNumberValue(normalized);
      if (numeric !== null) return numeric;
    }
    return parseExcelDateTime(text, dateTimeParseOptions(context))?.serial ?? valueError();
  },
};
