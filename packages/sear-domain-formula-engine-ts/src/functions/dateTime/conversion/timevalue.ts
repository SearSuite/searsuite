import { parseExcelDateTime } from '../shared/dateTimeUtils';
import {
  dateTimeParseOptions,
  isFormulaErrorValue,
  makeDateFunction,
  scalarArg,
  valueError,
} from '../shared/dateTimeFunctionUtils';

/**
 * TIMEVALUE: Converts time text into the fractional part of one day.
 * Example: =TIMEVALUE("2:24 AM") returns 0.1.
 */
export const TIMEVALUE = makeDateFunction('TIMEVALUE', 1, 1, (args, context) => {
  const value = scalarArg(args, 0, context);
  if (isFormulaErrorValue(value)) return value;
  const parsed = parseExcelDateTime(value, dateTimeParseOptions(context));
  return parsed ? parsed.serial - Math.floor(parsed.serial) : valueError();
});
