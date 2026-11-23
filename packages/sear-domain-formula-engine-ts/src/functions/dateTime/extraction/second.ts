import {
  isFormulaErrorValue,
  makeDateFunction,
  SECONDS_PER_DAY,
  timeFractionArg,
} from '../shared/dateTimeFunctionUtils';

/**
 * SECOND: Returns the second component from a time or date-time value.
 * Example: =SECOND("4:48:18 PM") returns 18.
 */
export const SECOND = makeDateFunction('SECOND', 1, 1, (args, context) => {
  const fraction = timeFractionArg(args, 0, context);
  return isFormulaErrorValue(fraction) ? fraction : Math.floor(fraction * SECONDS_PER_DAY + 1e-7) % 60;
});
