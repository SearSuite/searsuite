import { type FormulaError } from '@searsuite/sear-domain-formula-engine';
import { financialNumberError, financialValueError } from './dayCount';
import { couponAmount, resolveCouponSchedule } from './couponSchedule';

export type BondResult = number | FormulaError;

/** Prices a coupon bond per 100 face value using a clean price. */
export function bondPrice(
  settlement: number,
  maturity: number,
  annualRate: number,
  annualYield: number,
  redemption = 100,
  frequencyValue = 2,
  basisValue = 0,
): BondResult {
  if (![settlement, maturity, annualRate, annualYield, redemption].every(Number.isFinite))
    return financialValueError();
  if (settlement <= 0 || annualRate < 0 || redemption <= 0) return financialNumberError();
  const schedule = resolveCouponSchedule(settlement, maturity, frequencyValue, basisValue);
  if ('kind' in schedule) return schedule;
  const coupon = couponAmount(100, annualRate, schedule.frequency);
  if (typeof coupon !== 'number') return coupon;
  const periodYield = annualYield / schedule.frequency;
  if (1 + periodYield <= 0) return financialNumberError();
  const fraction = schedule.daysToNext / schedule.daysInPeriod;
  let presentValue = 0;
  for (let period = 0; period < schedule.couponsRemaining; period++) {
    presentValue += coupon / Math.pow(1 + periodYield, period + fraction);
  }
  presentValue += redemption / Math.pow(1 + periodYield, schedule.couponsRemaining - 1 + fraction);
  const accrued = (coupon * schedule.daysFromPrevious) / schedule.daysInPeriod;
  return Number.isFinite(presentValue - accrued) ? presentValue - accrued : financialNumberError();
}

/** Computes Macaulay duration from a clean bond price. */
export function bondDuration(
  settlement: number,
  maturity: number,
  annualRate: number,
  annualYield: number,
  redemption = 100,
  frequencyValue = 2,
  basisValue = 0,
): BondResult {
  if (!Number.isFinite(annualYield)) return financialValueError();
  if (annualYield < 0) return financialNumberError();
  const schedule = resolveCouponSchedule(settlement, maturity, frequencyValue, basisValue);
  if ('kind' in schedule) return schedule;
  const coupon = couponAmount(redemption, annualRate, schedule.frequency);
  if (typeof coupon !== 'number') return coupon;
  const periodYield = annualYield / schedule.frequency;
  if (1 + periodYield <= 0) return financialNumberError();
  const periodDays = schedule.basis === 2 || schedule.basis === 3
    ? schedule.nextCoupon - schedule.previousCoupon
    : schedule.daysInPeriod;
  const fraction = schedule.daysToNext / periodDays;
  let presentValue = 0;
  let weighted = 0;
  for (let period = 0; period < schedule.couponsRemaining; period++) {
    const time = (period + fraction) / schedule.frequency;
    const value = coupon / Math.pow(1 + periodYield, period + fraction);
    presentValue += value;
    weighted += time * value;
  }
  const redemptionTime = (schedule.couponsRemaining - 1 + fraction) / schedule.frequency;
  const redemptionValue = redemption / Math.pow(1 + periodYield, schedule.couponsRemaining - 1 + fraction);
  presentValue += redemptionValue;
  weighted += redemptionTime * redemptionValue;
  return presentValue > 0 && Number.isFinite(weighted / presentValue)
    ? weighted / presentValue
    : financialNumberError();
}
