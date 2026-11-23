import { FormulaDateSystem } from '@searsuite/sear-domain-formula-engine';
import { EXCEL_1904_SERIAL_OFFSET, excelSerialFromDateParts } from '../shared/dateTimeUtils';
import { isFormulaErrorValue, makeDateFunction, numberError, numericArg } from '../shared/dateTimeFunctionUtils';

/**
 * DATE: Creates an Excel date serial from year, month, and day parts.
 * Example: =DATE(2024,2,29) returns 45351.
 */
export const DATE = makeDateFunction('DATE', 3, 3, (args, context) => {
  const options = { allowDateText: true, rejectEmptyText: true };
  const year = numericArg(args, 0, context, options);
  const month = numericArg(args, 1, context, options);
  const day = numericArg(args, 2, context, options);
  if (isFormulaErrorValue(year)) return year;
  if (isFormulaErrorValue(month)) return month;
  if (isFormulaErrorValue(day)) return day;
  if (Math.abs(month) > 32_767) return numberError();
  const roundedMonth = month < 0 ? -Math.round(-month) : Math.trunc(month);
  const serial = excelSerialFromDateParts(year, roundedMonth, day);
  if (serial === null) return numberError();
  return context.dateSystem === FormulaDateSystem.Excel1904 ? serial - EXCEL_1904_SERIAL_OFFSET : serial;
});
