import { excelTimeFraction } from '../shared/dateTimeUtils';
import { isFormulaText, toNumberOrError } from '@searsuite/sear-foundation-utils';
import { type EvalContext, type FormulaArg } from '@searsuite/sear-domain-formula-engine';
import {
  coerceDateSerial,
  isFormulaErrorValue,
  makeDateFunction,
  numberError,
  scalarArg,
  valueError,
} from '../shared/dateTimeFunctionUtils';

/**
 * TIME: Converts hour, minute, and second parts into a fraction of one day.
 * Example: =TIME(12,0,0) returns 0.5.
 */
export const TIME = makeDateFunction('TIME', 3, 3, (args, context) => {
  const hour = timePart(args, 0, context);
  const minute = timePart(args, 1, context);
  const second = timePart(args, 2, context);
  if (isFormulaErrorValue(hour)) return hour;
  if (isFormulaErrorValue(minute)) return minute;
  if (isFormulaErrorValue(second)) return second;
  if ([hour, minute, second].some((part) => !Number.isFinite(part) || part > 32_767)) {
    return numberError();
  }
  const normalizedHour = normalizeExcessiveNegativePart(hour);
  const normalizedMinute = normalizeTimePart(normalizeExcessiveNegativePart(minute));
  const normalizedSecond = normalizeTimePart(normalizeExcessiveNegativePart(second));
  if (Math.trunc(normalizedHour) * 3_600 + normalizedMinute * 60 + normalizedSecond < 0) {
    return numberError();
  }
  return excelTimeFraction(normalizedHour, normalizedMinute, normalizedSecond) ?? valueError();
});

function normalizeExcessiveNegativePart(value: number): number {
  // WPS maps components below -32768 to the largest accepted positive component.
  return value < -32_768 ? 32_767 : value;
}

function normalizeTimePart(value: number): number {
  // A near-zero negative fraction must not roll a whole minute or second backward.
  return Math.floor(Math.abs(value) <= 1e-12 ? 0 : value);
}

function timePart(args: FormulaArg[], index: number, context: EvalContext): number | ReturnType<typeof valueError> {
  const value = scalarArg(args, index, context);
  if (isFormulaErrorValue(value)) return value;
  if (typeof value === 'string' || isFormulaText(value)) {
    const text = isFormulaText(value) ? value.value : value;
    if (text.trim() === '') return valueError();
    const numericText = toNumberOrError(value);
    if (!isFormulaErrorValue(numericText)) return numericText;
    return coerceDateSerial(value, context) ?? valueError();
  }
  const numeric = toNumberOrError(value);
  return isFormulaErrorValue(numeric) ? valueError() : numeric;
}
