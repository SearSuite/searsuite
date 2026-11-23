import { type FormulaError } from '@searsuite/sear-domain-formula-engine';
import { couponAmount, type CouponSchedule } from './couponSchedule';
import { financialDayCountDays, financialNumberError } from './dayCount';

/** Prices a short first coupon from its actual issue date and first payment. */
export function shortFirstCouponPrice(
  issue: number,
  settlement: number,
  firstCoupon: number,
  annualRate: number,
  annualYield: number,
  redemption: number,
  schedule: CouponSchedule,
): number | FormulaError {
  const issueToFirst = financialDayCountDays(issue, firstCoupon, schedule.basis);
  const issueToSettlement = financialDayCountDays(issue, settlement, schedule.basis);
  if (typeof issueToFirst !== 'number') return issueToFirst;
  if (typeof issueToSettlement !== 'number') return issueToSettlement;
  if (issueToFirst > 2 * schedule.daysInPeriod) return financialNumberError();
  const coupon = couponAmount(100, annualRate, schedule.frequency);
  if (typeof coupon !== 'number') return coupon;
  const periodYield = 1 + annualYield / schedule.frequency;
  if (periodYield <= 0 || schedule.daysInPeriod <= 0) return financialNumberError();

  const untilFirst = schedule.daysToNext / schedule.daysInPeriod;
  let price = coupon * (issueToFirst / schedule.daysInPeriod) / Math.pow(periodYield, untilFirst);
  for (let period = 1; period < schedule.couponsRemaining; period++) {
    price += coupon / Math.pow(periodYield, untilFirst + period);
  }
  price += redemption / Math.pow(periodYield, untilFirst + schedule.couponsRemaining - 1);
  price -= coupon * (issueToSettlement / schedule.daysInPeriod);
  return Number.isFinite(price) ? Number(price.toPrecision(15)) : financialNumberError();
}
