import { makeDateFunction, numericArg, isFormulaErrorValue } from '../shared/dateTimeFunctionUtils';

/** TO_DATE converts a number to its Excel date serial by removing its time fraction. Example: =TO_DATE(45351.75) returns 45351. */
export const TO_DATE = makeDateFunction('TO_DATE', 1, 1, (args, context) => {
  const serial = numericArg(args, 0, context);
  return isFormulaErrorValue(serial) ? serial : Math.trunc(serial);
});
