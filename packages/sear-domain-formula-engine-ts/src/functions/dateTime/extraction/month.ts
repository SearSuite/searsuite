import {
  dateSerialArg,
  isFormulaErrorValue,
  makeDateFunction,
  serialParts,
  valueError,
} from '../shared/dateTimeFunctionUtils';

/**
 * MONTH: Returns the month number for a date serial.
 * Example: =MONTH("2011-4-15") returns 4.
 */
export const MONTH = makeDateFunction('MONTH', 1, 1, (args, context) => {
  const serial = dateSerialArg(args, 0, context);
  const parts = isFormulaErrorValue(serial) ? null : serialParts(serial);
  return isFormulaErrorValue(serial) ? serial : parts?.month ?? valueError();
});
