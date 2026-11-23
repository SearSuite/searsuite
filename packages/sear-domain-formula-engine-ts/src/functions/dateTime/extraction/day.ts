import {
  dateSerialArg,
  isFormulaErrorValue,
  makeDateFunction,
  serialParts,
  valueError,
} from '../shared/dateTimeFunctionUtils';

/**
 * DAY: Returns the day of month for a date serial.
 * Example: =DAY("2011-4-15") returns 15.
 */
export const DAY = makeDateFunction('DAY', 1, 1, (args, context) => {
  const serial = dateSerialArg(args, 0, context);
  const parts = isFormulaErrorValue(serial) ? null : serialParts(serial);
  return isFormulaErrorValue(serial) ? serial : parts?.day ?? valueError();
});
