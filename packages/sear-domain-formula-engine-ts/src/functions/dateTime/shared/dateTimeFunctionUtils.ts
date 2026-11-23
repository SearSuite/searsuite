import {
  isFormulaArgumentKind,
  FormulaErrorCode,
  FormulaNodeKind,
  createFormulaError,
  type EvalContext,
  type FormulaArg,
  type FormulaDateTimeParseOptions,
  type FormulaError,
  type FormulaFunction,
  type FormulaValue,
} from '@searsuite/sear-domain-formula-engine';
import { isFormulaText, toNumberOrError } from '@searsuite/sear-foundation-utils';
import { forEachFormulaRangeCell, readArg, resolveFormulaRange } from '../../shared/helpers';
import {
  excelDatePartsFromSerial,
  excelSerialFromDateParts,
  LAST_EXCEL_DATE_SERIAL,
  parseExcelDate,
  parseExcelDateTime,
} from './dateTimeUtils';

export const SECONDS_PER_DAY = 86_400;

export type DateResult = number | FormulaError;

export function valueError(): FormulaError {
  return createFormulaError(FormulaErrorCode.Value);
}

export function numberError(): FormulaError {
  return createFormulaError(FormulaErrorCode.Number);
}

export function isFormulaErrorValue(value: unknown): value is FormulaError {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { kind?: unknown }).kind === 'error' &&
    typeof (value as { code?: unknown }).code === 'string'
  );
}

export function scalarArg(args: FormulaArg[], index: number, context: EvalContext): FormulaValue | FormulaError {
  const arg = args[index];
  if (!arg || isFormulaArgumentKind(arg, 'missing')) return valueError();
  const value = readArg(arg, context);
  return Array.isArray(value) ? valueError() : value;
}

export function numericArg(
  args: FormulaArg[], index: number, context: EvalContext,
  options: { rejectBoolean?: boolean; allowDateText?: boolean; rejectEmptyText?: boolean } = {},
): number | FormulaError {
  const value = scalarArg(args, index, context);
  if (isFormulaErrorValue(value)) return value;
  if (options.rejectBoolean && typeof value === 'boolean') return valueError();
  if (options.rejectEmptyText && (value === '' || isFormulaText(value) && value.value === '')) return valueError();
  const numeric = toNumberOrError(value);
  if (!isFormulaErrorValue(numeric)) return numeric;
  if (options.allowDateText && (typeof value === 'string' || isFormulaText(value))) {
    const parsed = parseExcelDate(value, dateTimeParseOptions(context));
    if (parsed !== null) return parsed;
  }
  return valueError();
}

export function textArg(args: FormulaArg[], index: number, context: EvalContext): string | FormulaError {
  const value = scalarArg(args, index, context);
  if (isFormulaErrorValue(value)) return value;
  if (isFormulaText(value)) return value.value;
  return typeof value === 'string' ? value : String(value);
}

export function dateSerialArg(
  args: FormulaArg[], index: number, context: EvalContext, options: { rejectBoolean?: boolean } = {},
): DateResult {
  const value = scalarArg(args, index, context);
  if (isFormulaErrorValue(value)) return value;
  if (options.rejectBoolean && typeof value === 'boolean') return valueError();
  if (typeof value === 'number' && (!Number.isFinite(value) || value < 0 || value > LAST_EXCEL_DATE_SERIAL)) {
    return numberError();
  }
  const text = isFormulaText(value) ? value.value : typeof value === 'string' ? value : null;
  if (isIndirectSlashDateText(args[index], value)) return valueError();
  if (text !== null && (!isFormulaText(value) || value.numericCoercion !== 'deny')) {
    const trimmed = text.trim();
    if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(trimmed)) {
      const numeric = Number(trimmed);
      return !Number.isFinite(numeric) || numeric < 0 || numeric > LAST_EXCEL_DATE_SERIAL
        ? numberError()
        : Math.trunc(numeric);
    }
  }
  const serial = coerceDateSerial(value, context);
  return serial ?? valueError();
}

export function isIndirectSlashDateText(arg: FormulaArg | undefined, value: FormulaValue): boolean {
  if (!isSlashDateText(value)) return false;
  return arg?.kind === 'value'
    ? arg.sourceKind !== undefined && arg.sourceKind !== FormulaNodeKind.String
    : arg !== undefined;
}

function isSlashDateText(value: FormulaValue): boolean {
  const text = isFormulaText(value) ? value.value : typeof value === 'string' ? value : null;
  return text !== null && /^\s*\d{1,4}\/\d{1,2}\/\d{1,4}\s*$/.test(text);
}

export function coerceDateSerial(value: FormulaValue, context: EvalContext): number | null {
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? Math.trunc(value) : null;
  if (isFormulaText(value) && value.numericCoercion === 'deny') return null;
  if (typeof value === 'string' || isFormulaText(value)) {
    return parseExcelDate(value, dateTimeParseOptions(context));
  }
  return null;
}

export function dateTimeParseOptions(context: EvalContext): FormulaDateTimeParseOptions & {
  readonly locale?: NonNullable<EvalContext['dateTimeLocale']>;
} {
  const currentDateTime = context.currentDateTime?.();
  return {
    ...(context.dateTimeLocale === undefined ? {} : { locale: context.dateTimeLocale }),
    ...(currentDateTime === undefined ? {} : { currentDateTime }),
  };
}

export function timeFractionArg(args: FormulaArg[], index: number, context: EvalContext): DateResult {
  const value = scalarArg(args, index, context);
  if (isFormulaErrorValue(value)) return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return checkedTimeFraction(typeof value === 'boolean' ? Number(value) : value);
  }
  if (typeof value === 'string' || isFormulaText(value)) {
    const parsed = parseExcelDateTime(value, dateTimeParseOptions(context));
    if (parsed) return checkedTimeFraction(parsed.serial);
    const text = isFormulaText(value) ? value.value : value;
    if (text.trim() === '') return valueError();
    const numeric = toNumberOrError(text);
    return isFormulaErrorValue(numeric) ? valueError() : checkedTimeFraction(numeric);
  }
  return valueError();
}

function checkedTimeFraction(serial: number): DateResult {
  if (!Number.isFinite(serial) || serial < 0 || serial >= LAST_EXCEL_DATE_SERIAL + 1) return numberError();
  return positiveFraction(serial);
}

export function positiveFraction(serial: number): number {
  return ((serial % 1) + 1) % 1;
}

export function serialParts(serial: number): ReturnType<typeof excelDatePartsFromSerial> {
  return excelDatePartsFromSerial(Math.trunc(serial));
}

export function addMonths(serial: number, months: number, endOfMonth: boolean): DateResult {
  const parts = serialParts(serial);
  if (!parts) return valueError();
  const firstOfTarget = excelSerialFromDateParts(parts.year, parts.month + Math.trunc(months), 1);
  if (firstOfTarget === null) return numberError();
  const firstParts = serialParts(firstOfTarget);
  if (!firstParts) return numberError();
  const targetEnd = excelSerialFromDateParts(firstParts.year, firstParts.month + 1, 0);
  if (targetEnd === null) return numberError();
  if (endOfMonth) return targetEnd;
  const endParts = serialParts(targetEnd);
  if (!endParts) return numberError();
  return (
    excelSerialFromDateParts(firstParts.year, firstParts.month, Math.min(parts.day, endParts.day)) ?? numberError()
  );
}

export function excelDayOfWeek(serial: number): number {
  return Math.floor(Math.trunc(serial) + 6) % 7;
}

export function weekdayForReturnType(serial: number, returnType: number): number | FormulaError {
  const dow = excelDayOfWeek(serial);
  if (returnType === 1) return dow + 1;
  if (returnType === 2 || returnType === 11) return ((dow + 6) % 7) + 1;
  if (returnType === 3) return (dow + 6) % 7;
  if (returnType >= 12 && returnType <= 17) return ((dow - (returnType - 10) + 7) % 7) + 1;
  return numberError();
}

export function parseWeekend(value: FormulaValue | undefined): Set<number> | FormulaError {
  const weekend = value === undefined ? 1 : value;
  if (typeof weekend === 'string' || isFormulaText(weekend)) {
    const text = isFormulaText(weekend) ? weekend.value : weekend;
    if (!/^[01]{7}$/.test(text)) return valueError();
    if (!text.includes('0')) return numberError();
    const days = new Set<number>();
    for (let i = 0; i < text.length; i++) if (text[i] === '1') days.add((i + 1) % 7);
    return days;
  }
  const codeValue = toNumberOrError(weekend);
  if (isFormulaErrorValue(codeValue)) return valueError();
  const code = Math.trunc(codeValue);
  const pairs: Record<number, readonly number[]> = {
    1: [6, 0],
    2: [0, 1],
    3: [1, 2],
    4: [2, 3],
    5: [3, 4],
    6: [4, 5],
    7: [5, 6],
    11: [0],
    12: [1],
    13: [2],
    14: [3],
    15: [4],
    16: [5],
    17: [6],
  };
  const days = pairs[code];
  return days ? new Set(days) : numberError();
}

export function holidaySet(arg: FormulaArg | undefined, context: EvalContext): Set<number> | FormulaError {
  const holidays = new Set<number>();
  if (!arg || isFormulaArgumentKind(arg, 'missing')) return holidays;

  const addHoliday = (value: FormulaValue, fromReference = false): FormulaError | undefined => {
    if (Array.isArray(value)) {
      for (const item of value) {
        const error = addHoliday(item, fromReference);
        if (error) return error;
      }
      return undefined;
    }
    if (typeof value === 'number' && (!Number.isFinite(value) || value < 0 || value > LAST_EXCEL_DATE_SERIAL)) {
      return numberError();
    }
    if (fromReference && isSlashDateText(value)) return valueError();
    const serial = coerceDateSerial(value, context);
    if (serial === null) return valueError();
    holidays.add(serial);
    return undefined;
  };

  if (
    isFormulaArgumentKind(arg, FormulaNodeKind.Range) ||
    isFormulaArgumentKind(arg, FormulaNodeKind.WorkbookRange) ||
    isFormulaArgumentKind(arg, FormulaNodeKind.ColumnRange) ||
    isFormulaArgumentKind(arg, FormulaNodeKind.RowRange)
  ) {
    const range = resolveFormulaRange(arg, context);
    if (!range || 'kind' in range) return range ?? valueError();
    let holidayError: FormulaError | undefined;
    const traversalError = forEachFormulaRangeCell(range, context, (value) => {
      holidayError = addHoliday(value, true);
      return holidayError === undefined;
    });
    return traversalError ?? holidayError ?? holidays;
  }

  const value = readArg(arg, context);
  if (isFormulaErrorValue(value)) return value;
  const error = addHoliday(value, isIndirectSlashDateText(arg, value));
  return error ?? holidays;
}

export function isBusinessDay(serial: number, weekend: Set<number>, holidays: Set<number>): boolean {
  return !weekend.has(excelDayOfWeek(serial)) && !holidays.has(Math.trunc(serial));
}

export function networkDays(start: number, end: number, weekend: Set<number>, holidays: Set<number>): DateResult {
  const first = Math.trunc(Math.min(start, end));
  const last = Math.trunc(Math.max(start, end));
  if (first < 0 || last > LAST_EXCEL_DATE_SERIAL || weekend.size === 7) return numberError();
  const length = last - first + 1;
  const fullWeeks = Math.floor(length / 7);
  let count = fullWeeks * (7 - weekend.size);
  for (let serial = first + fullWeeks * 7; serial <= last; serial++) {
    if (!weekend.has(excelDayOfWeek(serial))) count++;
  }
  for (const holiday of holidays) {
    if (holiday >= first && holiday <= last && !weekend.has(excelDayOfWeek(holiday))) count--;
  }
  return start <= end ? count : -count;
}

export function workday(start: number, days: number, weekend: Set<number>, holidays: Set<number>): DateResult {
  const serial = Math.trunc(start);
  const remaining = Math.abs(Math.trunc(days));
  if (serial < 0 || serial > LAST_EXCEL_DATE_SERIAL || weekend.size === 7) return numberError();
  if (remaining === 0) return serial;
  if (remaining > LAST_EXCEL_DATE_SERIAL) return numberError();
  if (days > 0) {
    if (serial === LAST_EXCEL_DATE_SERIAL) return numberError();
    const available = networkDays(serial + 1, LAST_EXCEL_DATE_SERIAL, weekend, holidays);
    if (isFormulaErrorValue(available) || available < remaining) return numberError();
    let low = serial + 1;
    let high = LAST_EXCEL_DATE_SERIAL;
    while (low < high) {
      const mid = low + Math.floor((high - low) / 2);
      const count = networkDays(serial + 1, mid, weekend, holidays);
      if (isFormulaErrorValue(count)) return count;
      if (count >= remaining) high = mid;
      else low = mid + 1;
    }
    return low;
  }
  if (serial === 0) return numberError();
  const available = networkDays(0, serial - 1, weekend, holidays);
  if (isFormulaErrorValue(available) || available < remaining) return numberError();
  let low = 0;
  let high = serial - 1;
  while (low < high) {
    const mid = low + Math.ceil((high - low) / 2);
    const count = networkDays(mid, serial - 1, weekend, holidays);
    if (isFormulaErrorValue(count)) return count;
    if (count >= remaining) low = mid;
    else high = mid - 1;
  }
  return low;
}

export function days360Serial(start: number, end: number, european: boolean): DateResult {
  const startParts = serialParts(start);
  const endParts = serialParts(end);
  if (!startParts || !endParts) return valueError();
  let startDay = startParts.day;
  let endDay = endParts.day;
  if (european) {
    if (startDay === 31) startDay = 30;
    if (endDay === 31) endDay = 30;
  } else {
    const startLastDay = isLastDayOfMonth(startParts.year, startParts.month, startParts.day);
    const endLastDay = isLastDayOfMonth(endParts.year, endParts.month, endParts.day);
    if (startLastDay) startDay = 30;
    if (endParts.month === 2 && endLastDay && startDay >= 30) {
      endDay = 30;
    } else if (endDay === 31) {
      if (startDay >= 30) endDay = 30;
      else {
        const next = excelDatePartsFromSerial(excelSerialFromDateParts(endParts.year, endParts.month + 1, 1) ?? 0);
        if (next) return (next.year - startParts.year) * 360 + (next.month - startParts.month) * 30 + 1 - startDay;
      }
    }
  }
  return (endParts.year - startParts.year) * 360 + (endParts.month - startParts.month) * 30 + endDay - startDay;
}

export function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

export function yearLength(year: number): number {
  return year === 1900 || isLeapYear(year) ? 366 : 365;
}

export function actualYearFrac(start: number, end: number): number {
  if (start === end) return 0;
  const sign = start <= end ? 1 : -1;
  const from = Math.min(start, end);
  const to = Math.max(start, end);
  const startParts = serialParts(from);
  const endParts = serialParts(to);
  if (!startParts || !endParts) return Number.NaN;
  if (startParts.year === endParts.year) return sign * ((to - from) / yearLength(startParts.year));
  const withinOneYear = endParts.year === startParts.year + 1 && (
    endParts.month < startParts.month ||
    (endParts.month === startParts.month && endParts.day <= startParts.day)
  );
  if (withinOneYear) {
    const leapYear = isLeapYear(startParts.year) ? startParts.year : endParts.year;
    const leapDay = isLeapYear(leapYear) ? excelSerialFromDateParts(leapYear, 2, 29) : null;
    const daysInYear = leapDay !== null && leapDay >= from && leapDay < to ? 366 : 365;
    return sign * ((to - from) / daysInYear);
  }
  let daysInYears = 0;
  for (let year = startParts.year; year <= endParts.year; year++) daysInYears += yearLength(year);
  const averageYearLength = daysInYears / (endParts.year - startParts.year + 1);
  return sign * ((to - from) / averageYearLength);
}

export function isoWeek(serial: number): number {
  const parts = serialParts(serial);
  if (!parts) return 0;
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  if (Math.trunc(serial) > 0 && Math.trunc(serial) <= 60) date.setUTCDate(date.getUTCDate() - 1);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  return Math.ceil(((date.getTime() - yearStart) / 86_400_000 + 1) / 7);
}

export function weekNum(serial: number, returnType: number): DateResult {
  if (returnType === 21) return isoWeek(serial);
  const start = weekStartForReturnType(returnType);
  const parts = serialParts(serial);
  if (start === null || !parts) return numberError();
  const jan1 = excelSerialFromDateParts(parts.year, 1, 1);
  if (jan1 === null) return numberError();
  const offset = (excelDayOfWeek(jan1) - start + 7) % 7;
  return Math.floor((serial - jan1 + offset) / 7) + 1;
}

export function makeDateFunction(
  name: string,
  minArgs: number,
  maxArgs: number,
  evaluate: (args: FormulaArg[], context: EvalContext) => FormulaValue,
  volatile = false,
  arityError: () => FormulaError = valueError,
): FormulaFunction {
  return {
    name,
    volatile,
    evaluate(args, context) {
      if (args.length < minArgs || args.length > maxArgs) return arityError();
      return evaluate(args, context);
    },
  };
}

function isLastDayOfMonth(year: number, month: number, day: number): boolean {
  if (year === 1900 && month === 2) return day === 29;
  const last = excelDatePartsFromSerial(excelSerialFromDateParts(year, month + 1, 0) ?? -1);
  return last?.day === day;
}

function weekStartForReturnType(returnType: number): number | null {
  if (returnType === 1) return 0;
  if (returnType === 2 || returnType === 11 || returnType === 21) return 1;
  if (returnType >= 12 && returnType <= 17) return returnType - 10;
  return null;
}
