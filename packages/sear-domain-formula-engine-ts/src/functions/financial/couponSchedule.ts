import { type FormulaError } from '@searsuite/sear-domain-formula-engine';
import { excelDatePartsFromSerial, excelSerialFromDateParts } from '../dateTime/shared/dateTimeUtils';
import {
  financialNumberError,
  financialValueError,
  isFinancialMonthEnd,
  normalizeFinancialBasis,
  type FinancialDayCountBasis,
} from './dayCount';

/** Coupon schedule resolved around a bond settlement date. */
export interface CouponSchedule {
  readonly previousCoupon: number;
  readonly nextCoupon: number;
  readonly couponsRemaining: number;
  readonly daysInPeriod: number;
  readonly daysFromPrevious: number;
  readonly daysToNext: number;
  readonly basis: FinancialDayCountBasis;
  readonly frequency: 1 | 2 | 4;
}

/** Validates a bond frequency used by Excel financial functions. */
export function normalizeCouponFrequency(value: number): 1 | 2 | 4 | FormulaError {
  const frequency = Math.trunc(value);
  return frequency === 1 || frequency === 2 || frequency === 4 ? frequency : financialNumberError();
}

function shiftCouponDate(serial: number, months: number, preserveMonthEnd: boolean): number | FormulaError {
  const parts = excelDatePartsFromSerial(serial);
  if (!parts) return financialValueError();
  const targetMonthIndex = parts.month - 1 + months;
  const targetYear = parts.year + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12 + 1;
  if (targetYear === 1899 && targetMonth === 12 && preserveMonthEnd) return 0;
  if (targetYear < 1900) return financialNumberError();
  const first = excelSerialFromDateParts(parts.year, parts.month + months, 1);
  if (first === null) return financialNumberError();
  const firstParts = excelDatePartsFromSerial(first);
  if (!firstParts) return financialNumberError();
  if (preserveMonthEnd) {
    return excelSerialFromDateParts(firstParts.year, firstParts.month + 1, 0) ?? financialNumberError();
  }
  const targetEnd = excelSerialFromDateParts(firstParts.year, firstParts.month + 1, 0);
  if (targetEnd === null) return financialNumberError();
  const targetParts = excelDatePartsFromSerial(targetEnd);
  if (!targetParts) return financialNumberError();
  return (
    excelSerialFromDateParts(firstParts.year, firstParts.month, Math.min(parts.day, targetParts.day)) ??
    financialNumberError()
  );
}

/** Resolves the previous/next coupon dates and basis-dependent day counts. */
export function resolveCouponSchedule(
  settlement: number,
  maturity: number,
  frequencyValue: number,
  basisValue?: number,
): CouponSchedule | FormulaError {
  if (!Number.isFinite(settlement) || !Number.isFinite(maturity) || settlement >= maturity)
    return financialNumberError();
  const frequency = normalizeCouponFrequency(frequencyValue);
  if (typeof frequency !== 'number') return frequency;
  const basis = normalizeFinancialBasis(basisValue);
  if (typeof basis !== 'number') return basis;

  const months = 12 / frequency;
  const preserveMonthEnd = isFinancialMonthEnd(maturity);
  let next = maturity;
  let guard = 0;
  while (next > settlement && guard++ < 20_000) {
    const previous = shiftCouponDate(next, -months, preserveMonthEnd);
    if (typeof previous !== 'number') return previous;
    if (previous <= settlement) {
      const daysInPeriod = basis === 1
        ? couponDays(previous, next, basis)
        : (basis === 3 ? 365 : 360) / frequency;
      const daysFromPrevious = couponDays(previous, settlement, basis);
      const daysToNext = couponDays(settlement, next, basis);
      if (typeof daysInPeriod !== 'number' || typeof daysFromPrevious !== 'number' || typeof daysToNext !== 'number') {
        return financialValueError();
      }
      const couponsRemaining = countCoupons(next, maturity, months, preserveMonthEnd);
      return {
        previousCoupon: previous,
        nextCoupon: next,
        couponsRemaining,
        daysInPeriod,
        daysFromPrevious,
        daysToNext,
        basis,
        frequency,
      };
    }
    next = previous;
  }
  return financialNumberError();
}

/** Resolves an odd first coupon schedule anchored at its first payment date. */
export function resolveOddFirstCouponSchedule(
  settlement: number,
  maturity: number,
  firstCoupon: number,
  frequencyValue: number,
  basisValue?: number,
): CouponSchedule | FormulaError {
  const frequency = normalizeCouponFrequency(frequencyValue);
  if (typeof frequency !== 'number') return frequency;
  const preserveMonthEnd = isFinancialMonthEnd(firstCoupon);
  let finalCoupon = firstCoupon;
  for (let guard = 0; finalCoupon < maturity && guard < 20_000; guard++) {
    const next = shiftCouponDate(finalCoupon, 12 / frequency, preserveMonthEnd);
    if (typeof next !== 'number' || next <= finalCoupon) return financialNumberError();
    finalCoupon = next;
  }
  if (finalCoupon < maturity) return financialNumberError();
  return resolveCouponSchedule(settlement, finalCoupon, frequency, basisValue);
}

/** Returns the basis-dependent length of a regular period after the final coupon date. */
export function oddLastRegularPeriodDays(
  lastCoupon: number,
  frequency: 1 | 2 | 4,
  basis: FinancialDayCountBasis,
): number | FormulaError {
  if (basis !== 1) return (basis === 3 ? 365 : 360) / frequency;
  const next = shiftCouponDate(lastCoupon, 12 / frequency, isFinancialMonthEnd(lastCoupon));
  return typeof next === 'number' ? couponDays(lastCoupon, next, basis) : next;
}

function couponDays(start: number, end: number, basis: FinancialDayCountBasis): number | FormulaError {
  if (basis === 0 || basis === 4) {
    const startParts = excelDatePartsFromSerial(start);
    const endParts = excelDatePartsFromSerial(end);
    if (!startParts || !endParts) return financialValueError();
    const startDay = basis === 0 && startParts.month === 2 && !startParts.phantomLeapDay && isFinancialMonthEnd(start)
      ? 30
      : Math.min(startParts.day, 30);
    const endDay = basis === 0 && endParts.day === 31 && startDay < 30 ? 30 : Math.min(endParts.day, 30);
    return (endParts.year - startParts.year) * 360 + (endParts.month - startParts.month) * 30 + endDay - startDay;
  }
  return end - start;
}

function countCoupons(next: number, maturity: number, months: number, preserveMonthEnd: boolean): number {
  let count = 1;
  let current = next;
  for (let guard = 0; current < maturity && guard < 20_000; guard++) {
    const following = shiftCouponDate(current, months, preserveMonthEnd);
    if (typeof following !== 'number' || following <= current) break;
    current = following;
    count++;
  }
  return count;
}

/** Returns the coupon amount for a face value and annual coupon rate. */
export function couponAmount(faceValue: number, annualRate: number, frequency: 1 | 2 | 4): number | FormulaError {
  if (!Number.isFinite(faceValue) || !Number.isFinite(annualRate) || faceValue < 0) return financialValueError();
  return (faceValue * annualRate) / frequency;
}
