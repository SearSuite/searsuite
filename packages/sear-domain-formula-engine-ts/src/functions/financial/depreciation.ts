import { type FormulaError } from '@searsuite/sear-domain-formula-engine';
import { financialDivisionError, financialNumberError } from './dayCount';

export type DepreciationResult = number | FormulaError;

/** Straight-line depreciation for one period. */
export function straightLineDepreciation(cost: number, salvage: number, life: number): DepreciationResult {
  if (![cost, salvage, life].every(Number.isFinite)) return financialNumberError();
  if (life === 0) return financialDivisionError();
  return (cost - salvage) / life;
}

/** Sum-of-years-digits depreciation for a one-based period. */
export function sumOfYearsDepreciation(
  cost: number,
  salvage: number,
  life: number,
  period: number,
): DepreciationResult {
  if (![cost, salvage, life, period].every(Number.isFinite) || salvage < 0 || life <= 0 || period <= 0 || period > life)
    return financialNumberError();
  const result = ((cost - salvage) * (life - period + 1)) / ((life * (life + 1)) / 2);
  return Number.isFinite(result) ? Number(result.toPrecision(15)) : financialNumberError();
}

/** Declining-balance depreciation for a one-based period. */
export function decliningBalanceDepreciation(
  cost: number,
  salvage: number,
  life: number,
  period: number,
  factor = 2,
): DepreciationResult {
  if (
    ![cost, salvage, life, period, factor].every(Number.isFinite) ||
    cost < 0 ||
    salvage < 0 ||
    life <= 0 ||
    period < 1 ||
    period > life ||
    factor <= 0
  )
    return financialNumberError();
  if (salvage >= cost) return 0;
  const rate = factor / life;
  let book = cost;
  let depreciation = 0;
  const completedPeriods = Math.floor(period - 1);
  for (let current = 1; current <= completedPeriods; current++) {
    depreciation = Math.min(book * rate, Math.max(0, book - salvage));
    book -= depreciation;
  }
  const elapsedFraction = period - 1 - completedPeriods;
  if (elapsedFraction > 0 && rate < 1) book *= Math.pow(1 - rate, elapsedFraction);
  depreciation = Math.min(book * rate, Math.max(0, book - salvage));
  return Number.isFinite(depreciation) ? depreciation : financialNumberError();
}

/** Variable declining-balance depreciation, with Excel's straight-line switch. */
export function variableDecliningBalance(
  cost: number,
  salvage: number,
  life: number,
  startPeriod: number,
  endPeriod: number,
  factor = 2,
  noSwitch = false,
): DepreciationResult {
  if (
    ![cost, salvage, life, startPeriod, endPeriod, factor].every(Number.isFinite) ||
    life <= 0 ||
    startPeriod < 0 ||
    endPeriod < startPeriod ||
    endPeriod > life ||
    factor < 0 ||
    cost < 0 ||
    salvage < 0
  )
    return financialNumberError();
  if (salvage >= cost) return 0;
  const start = Math.floor(startPeriod);
  const end = Math.ceil(endPeriod);
  let book = cost;
  let total = 0;
  for (let period = 1; period <= Math.min(end, Math.ceil(life)); period++) {
    const remainingLife = Math.max(life - period + 1, 1);
    const declining = Math.min((book * factor) / life, Math.max(0, book - salvage));
    const straight = Math.max(0, book - salvage) / remainingLife;
    const depreciation = !noSwitch && straight > declining ? straight : declining;
    const overlap = Math.max(0, Math.min(period, endPeriod) - Math.max(period - 1, startPeriod));
    total += depreciation * overlap;
    book -= depreciation;
  }
  return Number.isFinite(total) ? total : financialNumberError();
}
