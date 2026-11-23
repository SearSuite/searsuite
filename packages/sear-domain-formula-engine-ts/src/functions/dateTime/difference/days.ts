import { dateSerialArg, isFormulaErrorValue, makeDateFunction } from '../shared/dateTimeFunctionUtils';

/**
 * DAYS: Returns the number of days between an end date and a start date.
 * Example: =DAYS("2021-12-31","2021-1-1") returns 364.
 */
export const DAYS = makeDateFunction('DAYS', 2, 2, (args, context) => {
  const end = dateSerialArg(args, 0, context);
  const start = dateSerialArg(args, 1, context);
  return isFormulaErrorValue(end) ? end : isFormulaErrorValue(start) ? start : end - start;
});
