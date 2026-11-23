import { type FormulaFunction, isFormulaError } from '@searsuite/sear-domain-formula-engine';
import { scalar, lookupValueError } from '../lookup/lookupHelpers';
import { LAST_EXCEL_DATE_SERIAL, parseExcelDateTime } from '../dateTime/shared/dateTimeUtils';
import { dateTimeParseOptions } from '../dateTime/shared/dateTimeFunctionUtils';

/** ISDATE reports whether a value is a valid date or date serial. Example: =ISDATE("2024-02-29") returns TRUE. */
export const ISDATE: FormulaFunction = {
  name: 'ISDATE',
  evaluate(args, context) {
    if (args.length !== 1) return lookupValueError();
    const value = scalar(args[0], context);
    if (isFormulaError(value)) return false;
    if (typeof value === 'number') return Number.isFinite(value) && value >= 0 && value <= LAST_EXCEL_DATE_SERIAL;
    if (typeof value !== 'string' && !(typeof value === 'object' && value && 'value' in value)) return false;
    return parseExcelDateTime(value as string, dateTimeParseOptions(context)) !== null;
  },
};
