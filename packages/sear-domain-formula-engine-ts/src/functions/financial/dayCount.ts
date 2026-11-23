import { FormulaErrorCode, createFormulaError, type FormulaError } from '@searsuite/sear-domain-formula-engine';
import { actualYearFrac, days360Serial } from '../dateTime/shared/dateTimeFunctionUtils';
import { excelDatePartsFromSerial } from '../dateTime/shared/dateTimeUtils';

/** Excel financial day-count conventions. */
export type FinancialDayCountBasis = 0 | 1 | 2 | 3 | 4;

export type DayCountResult = number | FormulaError;

/** Returns a standard #NUM! result for an invalid basis or date interval. */
export function financialNumberError(): FormulaError {
  return createFormulaError(FormulaErrorCode.Number);
}

/** Returns a standard #VALUE! result for malformed financial inputs. */
export function financialValueError(): FormulaError {
  return createFormulaError(FormulaErrorCode.Value);
}

/** Returns a standard #DIV/0! result for an undefined periodic payment. */
export function financialDivisionError(): FormulaError {
  return createFormulaError(FormulaErrorCode.DivisionByZero);
}

/** Checks and normalizes the five Excel day-count basis values. */
export function normalizeFinancialBasis(value: number | undefined): FinancialDayCountBasis | FormulaError {
  const basis = value === undefined ? 0 : Math.trunc(value);
  return basis >= 0 && basis <= 4 ? (basis as FinancialDayCountBasis) : financialNumberError();
}

/** Returns the number of days between two Excel serial dates for a basis. */
export function financialDayCountDays(start: number, end: number, basis: FinancialDayCountBasis): DayCountResult {
  if (!Number.isFinite(start) || !Number.isFinite(end)) return financialValueError();
  switch (basis) {
    case 0:
      return usDays360(start, end);
    case 1:
    case 2:
    case 3:
    case 4: {
      if (basis === 1) return end - start;
      if (basis === 2) return end - start;
      if (basis === 3) return end - start;
      return days360Serial(start, end, true);
    }
    default:
      return financialNumberError();
  }
}

/** Returns the Excel year fraction for a financial basis. */
export function financialYearFraction(start: number, end: number, basis: FinancialDayCountBasis): DayCountResult {
  if (!Number.isFinite(start) || !Number.isFinite(end)) return financialValueError();
  switch (basis) {
    case 0: {
      const days = usDays360(start, end);
      return typeof days === 'number' ? days / 360 : days;
    }
    case 1:
      return actualYearFrac(start, end);
    case 2:
      return (end - start) / 360;
    case 3:
      return (end - start) / 365;
    case 4: {
      const days = days360Serial(start, end, true);
      return typeof days === 'number' ? days / 360 : days;
    }
    default:
      return financialNumberError();
  }
}

/** Returns whether an Excel serial date is the last calendar day of its month. */
export function isFinancialMonthEnd(serial: number): boolean {
  const parts = excelDatePartsFromSerial(serial);
  if (!parts) return false;
  const next = excelDatePartsFromSerial(serial + 1);
  return next !== null && next.month !== parts.month;
}

function usDays360(start: number, end: number): number | FormulaError {
  const startParts = excelDatePartsFromSerial(start);
  const endParts = excelDatePartsFromSerial(end);
  if (!startParts || !endParts) return financialValueError();
  const startFebruaryEnd = startParts.month === 2 && startParts.day === (isLeap(startParts.year) ? 29 : 28);
  const endFebruaryEnd = endParts.month === 2 && endParts.day === (isLeap(endParts.year) ? 29 : 28);
  const startDay = startParts.day === 31 || startFebruaryEnd ? 30 : startParts.day;
  const endDay = (endFebruaryEnd && startDay >= 30) || (endParts.day === 31 && startDay >= 30) ? 30 : endParts.day;
  return (endParts.year - startParts.year) * 360 + (endParts.month - startParts.month) * 30 + endDay - startDay;
}

function isLeap(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}
