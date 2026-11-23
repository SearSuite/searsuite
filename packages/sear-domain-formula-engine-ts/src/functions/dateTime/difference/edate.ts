import {
  addMonths,
  dateSerialArg,
  isFormulaErrorValue,
  makeDateFunction,
  numberError,
  numericArg,
} from '../shared/dateTimeFunctionUtils';

/**
 * EDATE: Returns the date serial offset by a whole number of months.
 * Example: =EDATE("2011-1-15",2) returns 40617.
 */
export const EDATE = makeDateFunction('EDATE', 2, 2, (args, context) => {
  const start = dateSerialArg(args, 0, context);
  const months = numericArg(args, 1, context);
  if (isFormulaErrorValue(start)) return start;
  if (isFormulaErrorValue(months)) return months;
  return start === 0 ? numberError() : addMonths(start, months, false);
});
