import {
  isFormulaErrorValue,
  makeDateFunction,
  SECONDS_PER_DAY,
  timeFractionArg,
} from '../shared/dateTimeFunctionUtils';

/**
 * MINUTE: Returns the minute component from a time or date-time value.
 * Example: =MINUTE("12:45 PM") returns 45.
 */
export const MINUTE = makeDateFunction('MINUTE', 1, 1, (args, context) => {
  const fraction = timeFractionArg(args, 0, context);
  return isFormulaErrorValue(fraction) ? fraction : Math.floor((fraction * SECONDS_PER_DAY + 1e-7) / 60) % 60;
});
