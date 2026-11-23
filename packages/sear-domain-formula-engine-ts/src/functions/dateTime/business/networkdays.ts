import {
  dateSerialArg,
  holidaySet,
  isFormulaErrorValue,
  makeDateFunction,
  networkDays,
} from '../shared/dateTimeFunctionUtils';

/**
 * NETWORKDAYS: Counts whole workdays between two dates, excluding weekends and holidays.
 * Example: =NETWORKDAYS("2012-10-1","2013-3-1",{"2012-11-22";"2012-12-4";"2013-1-21"}) returns 107.
 */
export const NETWORKDAYS = makeDateFunction('NETWORKDAYS', 2, 3, (args, context) => {
  const start = dateSerialArg(args, 0, context, { rejectBoolean: true });
  const end = dateSerialArg(args, 1, context, { rejectBoolean: true });
  const holidays = holidaySet(args[2], context);
  if (isFormulaErrorValue(start)) return start;
  if (isFormulaErrorValue(end)) return end;
  if (isFormulaErrorValue(holidays)) return holidays;
  return networkDays(start, end, new Set([0, 6]), holidays);
});
