import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { isFormulaError, isFormulaText, toNumberOrError } from '@searsuite/sear-foundation-utils';
import { parseExcelDate } from '../dateTime/shared/dateTimeUtils';
import { dateTimeParseOptions } from '../dateTime/shared/dateTimeFunctionUtils';
import { formatExcelText } from './textFormat/ExcelNumberFormat';
import { coerceText, isFormulaErrorValue, scalarValueArg, valueError } from './textFormat/FormulaTextValues';

/** Formats a value with an Excel format code. Example: TEXT(1234.5,"#,##0.00") returns "1,234.50". */
export const TEXT: FormulaFunction = {
  name: 'TEXT',

  evaluate(args, context) {
    const value = scalarValueArg(args, 0, context);
    if (isFormulaErrorValue(value)) return value;
    const formatValue = scalarValueArg(args, 1, context);
    if (isFormulaErrorValue(formatValue)) return formatValue;
    if (typeof formatValue === 'boolean') return valueError();
    const format = coerceText(formatValue);
    if (isFormulaErrorValue(format)) return format;
    if (/^(?:TRUE|FALSE)$/i.test(format.trim())) return valueError();
    const text = isFormulaText(value) ? value.value : value;
    if (typeof text === 'string') {
      if (text === '') return '';
      const number = toNumberOrError(text);
      if (!isFormulaError(number)) return formatExcelText(number, format);
      const date = parseExcelDate(text, dateTimeParseOptions(context));
      return date === null ? text : formatExcelText(date, format);
    }
    return formatExcelText(value, format);
  },
};
