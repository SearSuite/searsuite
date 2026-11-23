import { isFormulaError, type FormulaError } from '@searsuite/sear-domain-formula-engine';
import { couponAmount, oddLastRegularPeriodDays } from './couponSchedule';
import { financialDayCountDays, financialNumberError, type FinancialDayCountBasis } from './dayCount';

interface OddLastTerms {
  readonly payment: number;
  readonly accrued: number;
  readonly remainingPeriodFraction: number;
}

function oddLastTerms(
  settlement: number,
  maturity: number,
  lastCoupon: number,
  rate: number,
  redemption: number,
  frequency: 1 | 2 | 4,
  basis: FinancialDayCountBasis,
): OddLastTerms | FormulaError {
  if (lastCoupon > settlement || settlement >= maturity || rate < 0 || redemption <= 0)
    return financialNumberError();
  const periodDays = oddLastRegularPeriodDays(lastCoupon, frequency, basis);
  const oddDays = financialDayCountDays(lastCoupon, maturity, basis);
  const accruedDays = financialDayCountDays(lastCoupon, settlement, basis);
  const remainingDays = financialDayCountDays(settlement, maturity, basis);
  const coupon = couponAmount(100, rate, frequency);
  if (isFormulaError(periodDays)) return periodDays;
  if (isFormulaError(oddDays)) return oddDays;
  if (isFormulaError(accruedDays)) return accruedDays;
  if (isFormulaError(remainingDays)) return remainingDays;
  if (isFormulaError(coupon)) return coupon;
  if (periodDays <= 0 || oddDays <= 0 || remainingDays <= 0) return financialNumberError();
  return {
    payment: redemption + coupon * oddDays / periodDays,
    accrued: coupon * accruedDays / periodDays,
    remainingPeriodFraction: remainingDays / periodDays,
  };
}

/** Prices an odd final coupon when settlement follows the last regular coupon. */
export function oddLastPrice(
  settlement: number,
  maturity: number,
  lastCoupon: number,
  rate: number,
  yieldRate: number,
  redemption: number,
  frequency: 1 | 2 | 4,
  basis: FinancialDayCountBasis,
): number | FormulaError {
  const terms = oddLastTerms(settlement, maturity, lastCoupon, rate, redemption, frequency, basis);
  if (isFormulaError(terms)) return terms;
  const discount = 1 + yieldRate / frequency * terms.remainingPeriodFraction;
  return discount > 0 ? terms.payment / discount - terms.accrued : financialNumberError();
}

/** Inverts the same single-payment odd final coupon pricing equation. */
export function oddLastYield(
  settlement: number,
  maturity: number,
  lastCoupon: number,
  rate: number,
  price: number,
  redemption: number,
  frequency: 1 | 2 | 4,
  basis: FinancialDayCountBasis,
): number | FormulaError {
  const terms = oddLastTerms(settlement, maturity, lastCoupon, rate, redemption, frequency, basis);
  if (isFormulaError(terms)) return terms;
  const dirtyPrice = price + terms.accrued;
  return dirtyPrice > 0
    ? frequency / terms.remainingPeriodFraction * (terms.payment / dirtyPrice - 1)
    : financialNumberError();
}
