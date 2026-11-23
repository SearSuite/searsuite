import {
  dateSerialArg,
  isFormulaErrorValue,
  makeDateFunction,
  numericArg,
  weekdayForReturnType,
} from '../shared/dateTimeFunctionUtils';

/**
 * WEEKDAY: Returns the day of week using the requested Excel return type.
 * Example: =WEEKDAY("2008-2-14",2) returns 4.
 */
export const WEEKDAY = makeDateFunction('WEEKDAY', 1, 2, (args, context) => {
  const serial = dateSerialArg(args, 0, context);
  const returnType = args[1] === undefined || args[1].kind === 'missing' ? 1 : numericArg(args, 1, context);
  return isFormulaErrorValue(serial)
    ? serial
    : isFormulaErrorValue(returnType)
    ? returnType
    : weekdayForReturnType(serial, Math.trunc(returnType));
});
