import {
  addMonths,
  dateSerialArg,
  isFormulaErrorValue,
  makeDateFunction,
  numericArg,
} from '../shared/dateTimeFunctionUtils';

/**
 * EOMONTH: Returns the last day of the month offset from a start date.
 * Example: =EOMONTH("2011-1-1",1) returns 40602.
 */
export const EOMONTH = makeDateFunction('EOMONTH', 2, 2, (args, context) => {
  const start = dateSerialArg(args, 0, context);
  const months = numericArg(args, 1, context);
  return isFormulaErrorValue(start) ? start : isFormulaErrorValue(months) ? months : addMonths(start, months, true);
});
