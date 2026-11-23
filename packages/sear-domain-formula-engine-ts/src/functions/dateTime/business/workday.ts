import {
  dateSerialArg,
  holidaySet,
  isFormulaErrorValue,
  makeDateFunction,
  numericArg,
  workday,
} from '../shared/dateTimeFunctionUtils';

/**
 * WORKDAY: Returns the date serial after moving a number of workdays from a start date.
 * Example: =WORKDAY("2008-10-1",151,{"11/26/2008";"12/4/2008";"1/21/2009"}) returns 39938.
 */
export const WORKDAY = makeDateFunction('WORKDAY', 2, 3, (args, context) => {
  const start = dateSerialArg(args, 0, context);
  const days = numericArg(args, 1, context);
  const holidays = holidaySet(args[2], context);
  if (isFormulaErrorValue(start)) return start;
  if (isFormulaErrorValue(days)) return days;
  if (isFormulaErrorValue(holidays)) return holidays;
  return workday(start, Math.floor(days), new Set([0, 6]), holidays);
});
