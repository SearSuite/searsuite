import { excelDatePartsFromSerial, excelSerialFromDateParts } from '../shared/dateTimeUtils';
import {
  dateSerialArg,
  isFormulaErrorValue,
  makeDateFunction,
  numberError,
  serialParts,
  textArg,
  valueError,
} from '../shared/dateTimeFunctionUtils';

/**
 * DATEDIF: Returns the elapsed days, months, or years between two dates.
 * Example: =DATEDIF("1/1/2001","1/1/2003","Y") returns 2.
 */
export const DATEDIF = makeDateFunction('DATEDIF', 3, 3, (args, context) => {
  const start = dateSerialArg(args, 0, context);
  const end = dateSerialArg(args, 1, context);
  const unit = textArg(args, 2, context);
  if (isFormulaErrorValue(start)) return start;
  if (isFormulaErrorValue(end)) return end;
  if (isFormulaErrorValue(unit)) return unit;
  const normalizedUnit = unit.toUpperCase();
  if (normalizedUnit === 'D') return end - start;
  const reversed = end < start;
  const sign = reversed ? -1 : 1;
  const signed = (value: number): number => value === 0 ? 0 : sign * value;
  const earlier = reversed ? end : start;
  const later = reversed ? start : end;
  const startParts = serialParts(earlier);
  const endParts = serialParts(later);
  if (!startParts || !endParts) return valueError();
  const fullMonths =
    (endParts.year - startParts.year) * 12 +
    endParts.month -
    startParts.month -
    (endParts.day < startParts.day ? 1 : 0);
  if (normalizedUnit === 'M') return signed(fullMonths);
  if (normalizedUnit === 'Y') return signed(Math.floor(fullMonths / 12));
  if (normalizedUnit === 'YM') return signed(fullMonths % 12);
  if (normalizedUnit === 'YD') {
    const sameYearStart = excelSerialFromDateParts(endParts.year, startParts.month, startParts.day);
    if (sameYearStart === null) return valueError();
    return signed(later >= sameYearStart
      ? later - sameYearStart
      : later - (excelSerialFromDateParts(endParts.year - 1, startParts.month, startParts.day) ?? earlier));
  }
  if (normalizedUnit === 'MD') {
    if (endParts.day >= startParts.day) return signed(endParts.day - startParts.day);
    const previousMonthEnd = excelDatePartsFromSerial(excelSerialFromDateParts(endParts.year, endParts.month, 0) ?? -1);
    return signed((previousMonthEnd?.day ?? 30) - startParts.day + endParts.day);
  }
  return numberError();
});
