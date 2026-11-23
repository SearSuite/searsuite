import {
  dateSerialArg,
  isFormulaErrorValue,
  makeDateFunction,
  numericArg,
  weekNum,
} from '../shared/dateTimeFunctionUtils';

/**
 * WEEKNUM: Returns the week number of a date using Excel week-numbering rules.
 * Example: =WEEKNUM("2012-3-9",2) returns 11.
 */
export const WEEKNUM = makeDateFunction('WEEKNUM', 1, 2, (args, context) => {
  const serial = dateSerialArg(args, 0, context);
  const returnType = args[1] === undefined || args[1].kind === 'missing'
    ? 1 : numericArg(args, 1, context);
  return isFormulaErrorValue(serial)
    ? serial
    : isFormulaErrorValue(returnType)
    ? returnType
    : weekNum(serial, Math.trunc(returnType));
});
