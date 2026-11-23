import { isFormulaErrorValue, makeDateFunction, timeFractionArg } from '../shared/dateTimeFunctionUtils';

/**
 * HOUR: Returns the hour component from a time or date-time value.
 * Example: =HOUR("2011-7-18 7:45") returns 7.
 */
export const HOUR = makeDateFunction('HOUR', 1, 1, (args, context) => {
  const fraction = timeFractionArg(args, 0, context);
  return isFormulaErrorValue(fraction) ? fraction : Math.floor(fraction * 24);
});
