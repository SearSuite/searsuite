import { currentExcelDateTimeSerial } from '../shared/dateTimeUtils';
import { makeDateFunction } from '../shared/dateTimeFunctionUtils';

/**
 * TODAY: Returns the current date as an Excel serial without a time fraction.
 * Example: =TODAY()+5 returns the serial for five days after the injected current date.
 */
export const TODAY = makeDateFunction(
  'TODAY',
  0,
  0,
  (_args, context) => Math.floor(currentExcelDateTimeSerial(context)),
  true,
);
