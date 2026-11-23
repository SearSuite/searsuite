import {
  dateSerialArg,
  isFormulaErrorValue,
  makeDateFunction,
  serialParts,
  valueError,
} from '../shared/dateTimeFunctionUtils';

/**
 * YEAR: Returns the year for a date serial.
 * Example: =YEAR("7/5/2025") returns 2025.
 */
export const YEAR = makeDateFunction('YEAR', 1, 1, (args, context) => {
  const serial = dateSerialArg(args, 0, context);
  const parts = isFormulaErrorValue(serial) ? null : serialParts(serial);
  return isFormulaErrorValue(serial) ? serial : parts?.year ?? valueError();
});
