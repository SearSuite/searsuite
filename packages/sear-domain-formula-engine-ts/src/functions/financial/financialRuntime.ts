// @ts-nocheck
import {
  isFormulaArgumentKind,
  FormulaErrorCode,
  FormulaNodeKind,
  createFormulaError,
  type EvalContext,
  type FormulaArg,
  type FormulaError,
  type FormulaFunction,
  type FormulaValue,
} from '@searsuite/sear-domain-formula-engine';
import { isFormulaText } from '@searsuite/sear-foundation-utils';
import { dateSerialArg, isFormulaErrorValue } from '../dateTime/shared/dateTimeFunctionUtils';
import { excelDatePartsFromSerial } from '../dateTime/shared/dateTimeUtils';
import {
  collectFinancialCashFlows,
  collectFinancialDateSerials,
  collectFinancialScheduleRates,
  collectIrrCashFlows,
  collectNpvCashFlows,
  futureValue,
  payment,
  periodicNpv,
  readFinancialNumber,
} from './cashFlow';
import { solveRateRoot } from './rateRoot';
import { bondDuration, bondPrice } from './bondPricing';
import { shortFirstCouponPrice } from './oddFirstPrice';
import { normalizeCouponFrequency, resolveCouponSchedule, resolveOddFirstCouponSchedule } from './couponSchedule';
import { oddLastPrice, oddLastYield } from './oddLastPrice';
import {
  financialDayCountDays,
  financialYearFraction,
  type FinancialDayCountBasis,
  normalizeFinancialBasis,
} from './dayCount';
import {
  decliningBalanceDepreciation,
  straightLineDepreciation,
  sumOfYearsDepreciation,
  variableDecliningBalance,
} from './depreciation';
import { solveFinancialRoot } from './rootSolver';
import { readArg } from '../shared/helpers';
import { resolveConditionalReference } from '../shared/conditionalReference';
import { collectValues } from '../math/shared/mathUtils';

type FinancialResult = FormulaValue;
type FinancialEvaluator = (args: FormulaArg[], context: EvalContext) => FinancialResult;

const valueError = (): FormulaError => createFormulaError(FormulaErrorCode.Value);
const numberError = (): FormulaError => createFormulaError(FormulaErrorCode.Number);
const divisionError = (): FormulaError => createFormulaError(FormulaErrorCode.DivisionByZero);

function firstError(values: readonly unknown[]): FormulaError | undefined {
  return values.find(isFormulaErrorValue) as FormulaError | undefined;
}

function removeIntegerRoundoff(value: number | FormulaError): number | FormulaError {
  if (typeof value !== 'number' || !Number.isFinite(value)) return value;
  const nearest = Math.round(value);
  return Number.isSafeInteger(nearest) && Math.abs(value - nearest) <= 4 * Number.EPSILON * Math.abs(value)
    ? nearest
    : value;
}

/** Creates a financial function definition while keeping wrappers declarative. */
export function makeFinancialFunction(name: string, evaluate: FinancialEvaluator, maxArgs?: number): FormulaFunction {
  return {
    name,
    evaluate: (args, context) =>
      maxArgs !== undefined && args.length > maxArgs ? valueError() : evaluate(args, context),
  };
}

function number(args: FormulaArg[], index: number, context: EvalContext, fallback?: number): number | FormulaError {
  const arg = args[index];
  if (arg === undefined || isFormulaArgumentKind(arg, 'missing'))
    return fallback === undefined ? valueError() : fallback;
  return readFinancialNumber(arg, context);
}

function isDirectNonNumericCashFlow(arg: FormulaArg | undefined): boolean {
  return (
    arg?.kind === 'value' && (arg.sourceKind === FormulaNodeKind.String || arg.sourceKind === FormulaNodeKind.Boolean)
  );
}

function bondRedemption(args: FormulaArg[], index: number, context: EvalContext): number | FormulaError {
  const arg = args[index];
  return arg === undefined || isFormulaArgumentKind(arg, 'missing')
    ? 100
    : readFinancialNumber(arg, context, { acceptLocalizedCurrency: true });
}

function integer(args: FormulaArg[], index: number, context: EvalContext, fallback?: number): number | FormulaError {
  const result = number(args, index, context, fallback);
  return isFormulaErrorValue(result) ? result : Math.trunc(result);
}

function date(
  args: FormulaArg[],
  index: number,
  context: EvalContext,
  rejectBooleanLiteral = false,
): number | FormulaError {
  const arg = args[index];
  return dateSerialArg(args, index, context, {
    rejectBoolean: rejectBooleanLiteral && arg?.kind === 'value' && arg.sourceKind === FormulaNodeKind.Boolean,
  });
}

function oddBondDate(args: FormulaArg[], index: number, context: EvalContext): number | FormulaError {
  const arg = args[index];
  const referenced = resolveConditionalReference(arg, context);
  if (referenced && !isFormulaErrorValue(referenced) && typeof readArg(arg, context) === 'boolean') return valueError();
  return date(args, index, context);
}

function boolean(args: FormulaArg[], index: number, context: EvalContext, fallback = false): boolean | FormulaError {
  const arg = args[index];
  if (!arg || isFormulaArgumentKind(arg, 'missing')) return fallback;
  const value = readArg(arg, context);
  if (isFormulaErrorValue(value)) return value;
  if (Array.isArray(value)) return valueError();
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const text = isFormulaText(value) ? value.value : value;
  return /^true$/i.test(String(text).trim()) ? true : /^false$/i.test(String(text).trim()) ? false : valueError();
}

function basis(args: FormulaArg[], index: number, context: EvalContext): FinancialDayCountBasis | FormulaError {
  const result = number(args, index, context, 0);
  return isFormulaErrorValue(result) ? result : result < 0 ? numberError() : normalizeFinancialBasis(result);
}

function durationBasis(args: FormulaArg[], index: number, context: EvalContext): FinancialDayCountBasis | FormulaError {
  const result = number(args, index, context, 0);
  if (isFormulaErrorValue(result)) return result;
  if (result < 0 || result > 4) return numberError();
  return normalizeFinancialBasis(result);
}

function frequency(args: FormulaArg[], index: number, context: EvalContext): 1 | 2 | 4 | FormulaError {
  const result = number(args, index, context);
  return isFormulaErrorValue(result) ? result : normalizeCouponFrequency(result);
}

function values(args: FormulaArg[], index: number, context: EvalContext): number[] | FormulaError {
  return collectFinancialCashFlows(args[index], context);
}

function financialInputCount(arg: FormulaArg | undefined, context: EvalContext): number | null {
  if (!arg) return null;
  const inputs = collectValues(arg, context);
  if (Array.isArray(inputs)) return inputs.length;
  if (arg.kind === 'reference') {
    const range = arg.reference;
    return (range.endRow - range.startRow + 1) * (range.endCol - range.startCol + 1);
  }
  if (
    arg.kind === 'expression' ||
    arg.kind === 'value' ||
    arg.kind === FormulaNodeKind.Cell ||
    arg.kind === FormulaNodeKind.WorkbookCell
  )
    return 1;
  if (arg.kind === FormulaNodeKind.Range || arg.kind === FormulaNodeKind.WorkbookRange) {
    return (Math.abs(arg.end[0] - arg.start[0]) + 1) * (Math.abs(arg.end[1] - arg.start[1]) + 1);
  }
  return null;
}

function hasTextInFinancialRange(arg: FormulaArg | undefined, context: EvalContext): boolean {
  const reference = resolveConditionalReference(arg, context);
  if (
    !reference ||
    isFormulaErrorValue(reference) ||
    (reference.startRow === reference.endRow && reference.startCol === reference.endCol)
  )
    return false;
  const inputs = collectValues(arg, context);
  return (
    Array.isArray(inputs) &&
    inputs.some((value) => {
      const text = isFormulaText(value) ? value.value : value;
      return typeof text === 'string' && text.trim() !== '';
    })
  );
}

function sameLength(left: readonly number[], right: readonly number[]): boolean {
  return left.length > 0 && left.length === right.length;
}

function cashFlowNpv(rate: number, cashFlows: readonly number[], initialPeriod = 0): number | FormulaError {
  if (!Number.isFinite(rate) || rate <= -1 || cashFlows.length === 0) return numberError();
  let result = 0;
  for (let index = 0; index < cashFlows.length; index++) {
    result += cashFlows[index] / Math.pow(1 + rate, index + initialPeriod);
  }
  return Number.isFinite(result) ? result : numberError();
}

function normalizeCashFlows(cashFlows: readonly number[]): number[] {
  const firstMagnitude = Math.abs(cashFlows.find((value) => value !== 0) ?? 0);
  const maximum = cashFlows.reduce((largest, value) => Math.max(largest, Math.abs(value)), 0);
  const scale = Number.isFinite(maximum / firstMagnitude) ? firstMagnitude : maximum;
  return cashFlows.map((value) => value / scale);
}

function rateRoot(cashFlows: readonly number[], initialGuess: number): number | FormulaError {
  if (cashFlows.length < 2 || !cashFlows.some((value) => value > 0) || !cashFlows.some((value) => value < 0))
    return numberError();
  if (cashFlows.length === 2) {
    const rate = Math.expm1(Math.log(Math.abs(cashFlows[1])) - Math.log(Math.abs(cashFlows[0])));
    return Number.isFinite(rate) ? rate : numberError();
  }
  const scaledCashFlows = normalizeCashFlows(cashFlows);
  const firstValue = cashFlowNpv(initialGuess, scaledCashFlows);
  const firstSlope = scaledCashFlows.reduce(
    (sum, value, index) => sum - (index * value) / Math.pow(1 + initialGuess, index + 1),
    0,
  );
  // WPS stops when the default guess's first Newton step leaves the rate domain.
  if (
    initialGuess === 0.1 &&
    typeof firstValue === 'number' &&
    Number.isFinite(firstSlope) &&
    firstSlope !== 0 &&
    initialGuess - firstValue / firstSlope <= -1
  )
    return numberError();
  const maxIterations = 20 + Math.ceil(Math.log2(Math.max(1, Math.abs(initialGuess))));
  return solveFinancialRoot(
    (rate) => cashFlowNpv(rate, scaledCashFlows) as number,
    (rate) => scaledCashFlows.reduce((sum, value, index) => sum - (index * value) / Math.pow(1 + rate, index + 1), 0),
    { initialGuess, lowerBound: -0.999999999, upperBound: Number.MAX_VALUE, tolerance: 1e-13, maxIterations },
  );
}

function xnpvValue(rate: number, cashFlows: readonly number[], dates: readonly number[]): number | FormulaError {
  if (
    !sameLength(cashFlows, dates) ||
    rate <= -1 ||
    !Number.isFinite(rate) ||
    dates.some((dateValue, index) => !Number.isFinite(dateValue) || (index > 0 && dateValue < dates[0]))
  )
    return numberError();
  const firstDate = dates[0];
  let result = 0;
  for (let index = 0; index < cashFlows.length; index++) {
    result += cashFlows[index] / Math.pow(1 + rate, (dates[index] - firstDate) / 365);
  }
  return Number.isFinite(result) ? result : numberError();
}

function xirrRoot(cashFlows: readonly number[], dates: readonly number[], initialGuess: number): number | FormulaError {
  if (
    !sameLength(cashFlows, dates) ||
    cashFlows.length < 2 ||
    !cashFlows.some((value) => value > 0) ||
    !cashFlows.some((value) => value < 0)
  )
    return numberError();
  if (cashFlows.length === 2) {
    const yearFraction = (dates[1] - dates[0]) / 365;
    if (!Number.isFinite(dates[0]) || !Number.isFinite(dates[1]) || !(yearFraction > 0)) return numberError();
    const rate = Math.expm1((Math.log(Math.abs(cashFlows[1])) - Math.log(Math.abs(cashFlows[0]))) / yearFraction);
    return Number.isFinite(rate) ? rate : numberError();
  }
  const scaledCashFlows = normalizeCashFlows(cashFlows);
  return solveFinancialRoot(
    (rate) => xnpvValue(rate, scaledCashFlows, dates) as number,
    (rate) =>
      scaledCashFlows.reduce((sum, value, index) => {
        const exponent = (dates[index] - dates[0]) / 365;
        return sum - (exponent * value) / Math.pow(1 + rate, exponent + 1);
      }, 0),
    { initialGuess, lowerBound: -0.999999999, upperBound: Number.MAX_VALUE, tolerance: 1e-13 },
  );
}

function amortizedDepreciation(
  cost: number,
  purchased: number,
  firstPeriod: number,
  salvage: number,
  period: number,
  rate: number,
  basisValue: FinancialDayCountBasis,
  coefficient: number,
): number | FormulaError {
  if (
    ![cost, purchased, firstPeriod, salvage, period, rate, coefficient].every(Number.isFinite) ||
    cost < 0 ||
    salvage < 0 ||
    salvage > cost ||
    purchased >= firstPeriod ||
    period < 0 ||
    rate <= 0 ||
    coefficient <= 0
  )
    return numberError();
  const life = 1 / rate;
  if (!Number.isFinite(life) || life <= 0) return numberError();
  const yearFraction = financialYearFraction(purchased, firstPeriod, basisValue);
  if (isFormulaErrorValue(yearFraction) || yearFraction <= 0) return valueError();
  const first = Math.round(Math.min(cost - salvage, cost * coefficient * rate * yearFraction));
  let book = cost;
  if (period === 0) return first;
  book -= first;
  let depreciation = first;
  const wholePeriod = Math.trunc(period);
  for (let current = 1; current <= wholePeriod; current++) {
    const declining = Math.round(book * coefficient * rate);
    const straight = Math.max(0, book - salvage) / Math.max(1, life - current);
    depreciation = Math.round(Math.max(declining, straight));
    book -= depreciation;
  }
  return Number.isFinite(depreciation) ? depreciation : numberError();
}

/** AMORDEGRC: declining-balance depreciation with a French accounting coefficient. */
export const AMORDEGRC = makeFinancialFunction('AMORDEGRC', (args, context) => {
  if (args.length < 6 || args.length > 7) return valueError();
  const cost = number(args, 0, context);
  const purchased = date(args, 1, context);
  const firstPeriod = date(args, 2, context);
  const salvage = number(args, 3, context);
  const period = number(args, 4, context);
  const rate = number(args, 5, context);
  const basisValue = basis(args, 6, context);
  const error = firstError([cost, purchased, firstPeriod, salvage, period, rate, basisValue]);
  if (error) return error;
  const life = 1 / rate;
  if (life < 3) return numberError();
  const coefficient = life < 5 ? 1.5 : life <= 6 ? 2 : 2.5;
  const depreciation = amortizedDepreciation(
    cost,
    purchased,
    firstPeriod,
    salvage,
    period,
    rate,
    basisValue,
    coefficient,
  );
  return isFormulaErrorValue(depreciation) ? depreciation : Math.round(depreciation);
});

/** AMORLINC: straight-line depreciation prorated over the first period. */
export const AMORLINC = makeFinancialFunction('AMORLINC', (args, context) => {
  if (args.length < 6 || args.length > 7) return valueError();
  const cost = number(args, 0, context);
  const purchased = date(args, 1, context);
  const firstPeriod = date(args, 2, context);
  const salvage = number(args, 3, context);
  const periodValue = number(args, 4, context);
  const rate = number(args, 5, context);
  const basisValue = basis(args, 6, context);
  const error = firstError([cost, purchased, firstPeriod, salvage, periodValue, rate, basisValue]);
  if (error) return error;
  if (cost < 0 || salvage < 0 || salvage > cost || purchased >= firstPeriod || periodValue < 0 || rate <= 0)
    return numberError();
  const period = Math.trunc(periodValue);
  const firstFraction = financialYearFraction(purchased, firstPeriod, basisValue);
  if (isFormulaErrorValue(firstFraction) || firstFraction <= 0) return valueError();
  const full = cost * rate;
  const first = Math.min(cost - salvage, full * firstFraction);
  if (period === 0) return first;
  const depreciation =
    Math.min(cost - salvage, first + full * period) - Math.min(cost - salvage, first + full * (period - 1));
  return Number.isFinite(depreciation) ? Math.max(0, depreciation) : numberError();
});

function periodicPayment(rate: number, periods: number, pv: number, fv: number, type: number): number | FormulaError {
  return payment(rate, periods, pv, fv, type);
}

function firstPeriodPrincipal(rate: number, periods: number, pv: number, fv: number): number | undefined {
  if (rate === 0 || rate === -1) return undefined;
  if (fv === 0) {
    // WPS evaluates the annuity as two divisions before subtracting them.
    const growth = Math.pow(1 + rate, periods);
    if (!Number.isFinite(growth)) return undefined;
    const annuity = growth / rate - 1 / rate;
    const principal = -pv / annuity;
    return Number.isFinite(annuity) && annuity !== 0 && Number.isFinite(principal) ? principal : undefined;
  }
  const discount = Math.pow(1 + rate, -periods);
  const principal = (-(rate * (pv + fv)) * discount) / (1 - discount);
  return Number.isFinite(principal) ? principal : undefined;
}

function cumulativePeriodInterest(
  pmt: number,
  periods: number,
  period: number,
  type: number,
  logGrowth: number,
): number {
  if (type === 1 && period === 1) return 0;
  return -pmt * Math.expm1(-(periods - period + 1) * logGrowth);
}

function couponInputs(
  args: FormulaArg[],
  context: EvalContext,
  allowBooleanSettlement = false,
): { settlement: number; maturity: number; frequency: 1 | 2 | 4; basis: FinancialDayCountBasis } | FormulaError {
  const settlement = allowBooleanSettlement ? dateSerialArg(args, 0, context) : date(args, 0, context);
  const maturity = date(args, 1, context);
  const frequencyValue = frequency(args, 2, context);
  const basisValue = basis(args, 3, context);
  const error = firstError([settlement, maturity, frequencyValue, basisValue]);
  if (error) return error;
  return { settlement, maturity, frequency: frequencyValue, basis: basisValue };
}

function couponScheduleResult(
  args: FormulaArg[],
  context: EvalContext,
  selector: (schedule: ReturnType<typeof resolveCouponSchedule> & object) => number | FormulaError,
  allowBooleanSettlement = false,
): number | FormulaError {
  const inputs = couponInputs(args, context, allowBooleanSettlement);
  if (isFormulaErrorValue(inputs)) return inputs;
  const schedule = resolveCouponSchedule(inputs.settlement, inputs.maturity, inputs.frequency, inputs.basis);
  if (isFormulaErrorValue(schedule)) return schedule;
  return selector(schedule as never);
}

function regularBondPrice(args: FormulaArg[], context: EvalContext): number | FormulaError {
  const settlement = date(args, 0, context);
  const maturity = date(args, 1, context);
  const rate = number(args, 2, context);
  const yieldRate = number(args, 3, context);
  const redemption = bondRedemption(args, 4, context);
  const frequencyValue = frequency(args, 5, context);
  const basisValue = basis(args, 6, context);
  const error = firstError([settlement, maturity, rate, yieldRate, redemption, frequencyValue, basisValue]);
  if (error) return error;
  if (yieldRate < 0) return numberError();
  return bondPrice(settlement, maturity, rate, yieldRate, redemption, frequencyValue, basisValue);
}

/** ACCRINT: accrued interest for a periodically paying security. */
export const ACCRINT = makeFinancialFunction('ACCRINT', (args, context) => {
  if (args.length < 5 || args.length > 8) return valueError();
  const issue = date(args, 0, context);
  const firstInterest = date(args, 1, context);
  const settlement = date(args, 2, context);
  const rate = number(args, 3, context);
  const par = number(args, 4, context);
  const frequencyValue = frequency(args, 5, context);
  const basisValue = basis(args, 6, context);
  const method = boolean(args, 7, context, true);
  const error = firstError([issue, firstInterest, settlement, rate, par, frequencyValue, basisValue, method]);
  if (error) return error;
  if (issue >= settlement || firstInterest === 0 || rate <= 0 || par <= 0) return numberError();
  const start = method || settlement < firstInterest ? issue : firstInterest;
  const fraction = financialYearFraction(start, settlement, basisValue);
  return isFormulaErrorValue(fraction) ? fraction : par * rate * fraction;
});

/** ACCRINTM: accrued interest for a security paying interest at maturity. */
export const ACCRINTM = makeFinancialFunction('ACCRINTM', (args, context) => {
  if (args.length < 4 || args.length > 5) return valueError();
  const issue = date(args, 0, context);
  const settlement = date(args, 1, context);
  const rate = number(args, 2, context);
  const par = number(args, 3, context);
  const basisValue = basis(args, 4, context);
  const error = firstError([issue, settlement, rate, par, basisValue]);
  if (error) return error;
  if (issue >= settlement || rate <= 0 || par <= 0) return numberError();
  const fraction = financialYearFraction(issue, settlement, basisValue);
  return isFormulaErrorValue(fraction) ? fraction : par * rate * fraction;
});

/** COUPDAYBS: days from the beginning of a coupon period to settlement. */
export const COUPDAYBS = makeFinancialFunction('COUPDAYBS', (args, context) =>
  couponScheduleResult(args, context, (schedule) => schedule.daysFromPrevious),
);

/** COUPDAYS: number of days in the coupon period containing settlement. */
export const COUPDAYS = makeFinancialFunction('COUPDAYS', (args, context) =>
  couponScheduleResult(args, context, (schedule) => schedule.daysInPeriod, true),
);

/** COUPDAYSNC: days from settlement to the next coupon. */
export const COUPDAYSNC = makeFinancialFunction('COUPDAYSNC', (args, context) => {
  const inputs = couponInputs(args, context);
  if (isFormulaErrorValue(inputs)) return inputs;
  const schedule = resolveCouponSchedule(inputs.settlement, inputs.maturity, inputs.frequency, inputs.basis);
  if (isFormulaErrorValue(schedule)) return schedule;
  // A directly supplied date string follows the coupon schedule's date-text convention.
  if (isFormulaArgumentKind(args[0], 'value') && args[0].sourceKind === FormulaNodeKind.String)
    return schedule.daysToNext;
  const days = financialDayCountDays(inputs.settlement, schedule.nextCoupon, inputs.basis);
  if (inputs.basis === 0 && schedule.daysFromPrevious === 1 && days === schedule.daysToNext + 1)
    return schedule.daysToNext;
  return days;
});

/** COUPNCD: next coupon date after settlement. */
export const COUPNCD = makeFinancialFunction('COUPNCD', (args, context) =>
  couponScheduleResult(args, context, (schedule) => schedule.nextCoupon),
);

/** COUPNUM: number of coupons remaining after settlement. */
export const COUPNUM = makeFinancialFunction('COUPNUM', (args, context) =>
  // Excel rejects schedules with 254 or more remaining coupon payments.
  couponScheduleResult(args, context, (schedule) =>
    schedule.couponsRemaining >= 254 ? numberError() : schedule.couponsRemaining,
  ),
);

/** COUPPCD: previous coupon date before settlement. */
export const COUPPCD = makeFinancialFunction('COUPPCD', (args, context) =>
  couponScheduleResult(args, context, (schedule) => schedule.previousCoupon),
);

/** CUMIPMT: cumulative interest paid between two periods. */
export const CUMIPMT = makeFinancialFunction('CUMIPMT', (args, context) => {
  if (args.length !== 6) return valueError();
  const rate = number(args, 0, context);
  const nper = number(args, 1, context);
  const pv = number(args, 2, context);
  const start = number(args, 3, context);
  const end = integer(args, 4, context);
  const type = number(args, 5, context);
  const argumentError = firstError([rate, nper, pv, start, end, type]);
  if (argumentError) return argumentError;
  if (rate <= 0 || nper <= 0 || pv <= 0 || start < 1 || end < start || end > nper || (type !== 0 && type !== 1))
    return numberError();
  const logGrowth = Math.log1p(rate);
  const pmt = (-rate * pv) / (-Math.expm1(-nper * logGrowth) * (1 + rate * type));
  if (!Number.isFinite(pmt)) return numberError();
  let total = 0;
  for (let period = Math.ceil(start); period <= end; period++) {
    total += cumulativePeriodInterest(pmt, nper, period, type, logGrowth);
  }
  return removeIntegerRoundoff(total);
});

/** CUMPRINC: cumulative principal paid between two periods. */
export const CUMPRINC = makeFinancialFunction('CUMPRINC', (args, context) => {
  if (args.length !== 6) return valueError();
  const rate = number(args, 0, context);
  const nper = number(args, 1, context);
  const pv = number(args, 2, context);
  const start = number(args, 3, context);
  const end = integer(args, 4, context);
  const type = number(args, 5, context);
  const argumentError = firstError([rate, nper, pv, start, end, type]);
  if (argumentError) return argumentError;
  if (rate <= 0 || nper <= 0 || pv <= 0 || start < 1 || end < start || end > nper || (type !== 0 && type !== 1))
    return numberError();
  const logGrowth = Math.log1p(rate);
  const pmt = (-rate * pv) / (-Math.expm1(-nper * logGrowth) * (1 + rate * type));
  if (!Number.isFinite(pmt)) return numberError();
  let total = 0;
  for (let period = Math.ceil(start); period <= end; period++) {
    total += pmt - cumulativePeriodInterest(pmt, nper, period, type, logGrowth);
  }
  return total;
});

/** DB: fixed-declining balance depreciation. */
export const DB = makeFinancialFunction('DB', (args, context) => {
  const cost = number(args, 0, context);
  const salvage = number(args, 1, context);
  const life = number(args, 2, context);
  const period = number(args, 3, context);
  const month = number(args, 4, context, 12);
  const argumentError = firstError([cost, salvage, life, period, month]);
  if (argumentError) return argumentError;
  const monthCount = Math.trunc(month);
  if (
    cost < 0 ||
    salvage < 0 ||
    life <= 0 ||
    period < 1 ||
    Math.trunc(period) > life + (monthCount < 12 ? 1 : 0) ||
    monthCount < 1 ||
    monthCount > 12
  )
    return numberError();
  if (cost === 0) return 0;
  const rate = Math.round((1 - Math.pow(salvage / cost, 1 / life)) * 1000) / 1000;
  let book = cost;
  let depreciation = 0;
  for (let current = 1; current <= period; current++) {
    depreciation =
      current === 1
        ? (cost * rate * monthCount) / 12
        : current > life && monthCount < 12
        ? (book * rate * (12 - monthCount)) / 12
        : Math.min(book * rate, Math.max(0, book - salvage));
    book -= depreciation;
  }
  return Number.isFinite(depreciation) ? depreciation : numberError();
});

/** DDB: double-declining or custom-factor depreciation. */
export const DDB = makeFinancialFunction('DDB', (args, context) => {
  const cost = number(args, 0, context);
  const salvage = number(args, 1, context);
  const life = number(args, 2, context);
  const period = number(args, 3, context);
  const factor = number(args, 4, context, 2);
  const argumentError = firstError([cost, salvage, life, period, factor]);
  if (argumentError) return argumentError;
  return decliningBalanceDepreciation(cost, salvage, life, period, factor);
});

/** DISC: annualized discount rate for a discounted security. */
export const DISC = makeFinancialFunction('DISC', (args, context) => {
  const settlement =
    isFormulaArgumentKind(args[0], 'value') && args[0].sourceKind === FormulaNodeKind.Boolean
      ? dateSerialArg(args, 0, context)
      : date(args, 0, context);
  const maturity =
    isFormulaArgumentKind(args[1], 'value') && args[1].sourceKind === FormulaNodeKind.Boolean
      ? dateSerialArg(args, 1, context)
      : date(args, 1, context);
  const price = number(args, 2, context);
  const redemption = number(args, 3, context, 100);
  const basisValue = basis(args, 4, context);
  const argumentError = firstError([settlement, maturity, price, redemption, basisValue]);
  if (argumentError) return argumentError;
  const fraction = financialYearFraction(settlement, maturity, basisValue);
  if (isFormulaErrorValue(fraction)) return fraction;
  return fraction <= 0 || price <= 0 || redemption <= 0 ? numberError() : (redemption - price) / redemption / fraction;
});

/** DOLLARDE: converts a fractional dollar price to a decimal price. */
export const DOLLARDE = makeFinancialFunction('DOLLARDE', (args, context) => {
  const value = number(args, 0, context);
  const fractionInput = number(args, 1, context);
  const argumentError = firstError([value, fractionInput]);
  if (argumentError) return argumentError;
  if (fractionInput < 0) return numberError();
  const fraction = Math.trunc(fractionInput);
  if (fraction === 0) return divisionError();
  const integerPart = value < 0 ? Math.ceil(value) : Math.floor(value);
  const decimal = value - integerPart;
  const scale = Math.pow(10, Math.ceil(Math.log10(fraction)));
  if (!Number.isFinite(scale)) return numberError();
  return integerPart + (decimal * scale) / fraction;
});

/** DOLLARFR: converts a decimal dollar price to a fractional price. */
export const DOLLARFR = makeFinancialFunction('DOLLARFR', (args, context) => {
  const value = number(args, 0, context);
  const fractionInput = number(args, 1, context);
  const argumentError = firstError([value, fractionInput]);
  if (argumentError) return argumentError;
  if (fractionInput < 0) return numberError();
  const fraction = Math.trunc(fractionInput);
  if (fraction === 0) return divisionError();
  if (fraction < 0) return numberError();
  const integerPart = value < 0 ? Math.ceil(value) : Math.floor(value);
  const decimal = value - integerPart;
  const scale = Math.pow(10, Math.ceil(Math.log10(fraction)));
  if (!Number.isFinite(scale)) return numberError();
  return integerPart + (decimal * fraction) / scale;
});

/** DURATION: Macaulay duration of a coupon security. */
export const DURATION = makeFinancialFunction('DURATION', (args, context) => {
  const settlement = date(args, 0, context);
  const maturity = date(args, 1, context);
  const coupon = number(args, 2, context);
  const yieldRate = number(args, 3, context);
  const frequencyValue = frequency(args, 4, context);
  const basisValue = durationBasis(args, 5, context);
  const argumentError = firstError([settlement, maturity, coupon, yieldRate, frequencyValue, basisValue]);
  if (argumentError) return argumentError;
  return bondDuration(settlement, maturity, coupon, yieldRate, 100, frequencyValue, basisValue);
});

/** EFFECT: effective annual interest rate. */
export const EFFECT = makeFinancialFunction(
  'EFFECT',
  (args, context) => {
    const nominal = number(args, 0, context);
    const periods = integer(args, 1, context);
    const argumentError = firstError([nominal, periods]);
    if (argumentError) return argumentError;
    if (nominal <= 0 || periods <= 0) return numberError();
    const periodicRate = nominal / periods;
    if (Number.isSafeInteger(periodicRate) && periodicRate > 0) {
      const base = periodicRate + 1;
      if (Number.isSafeInteger(base)) {
        let growth = 1;
        for (let period = 0; period < periods; period++) {
          growth *= base;
          if (!Number.isSafeInteger(growth)) break;
        }
        if (Number.isSafeInteger(growth)) return growth - 1;
      }
    }
    return Math.expm1(periods * Math.log1p(periodicRate));
  },
  2,
);

/** FV: future value of an annuity. */
export const FV = makeFinancialFunction(
  'FV',
  (args, context) => {
    const rate = number(args, 0, context);
    const nper = number(args, 1, context);
    const pmt = number(args, 2, context);
    const pv = number(args, 3, context, 0);
    const type = number(args, 4, context, 0);
    const argumentError = firstError([rate, nper, pmt, pv, type]);
    if (argumentError) return argumentError;
    return removeIntegerRoundoff(futureValue(rate, nper, pmt, pv, type === 0 ? 0 : 1));
  },
  5,
);

/** FVSCHEDULE: future value using a series of variable rates. */
export const FVSCHEDULE = makeFinancialFunction('FVSCHEDULE', (args, context) => {
  const principal = number(args, 0, context);
  const rates = collectFinancialScheduleRates(args[1], context);
  const argumentError = firstError([principal, rates]);
  if (argumentError) return argumentError;
  const result = rates.reduce((value, rate) => value * (1 + rate), principal);
  if (Number.isFinite(result)) return result;
  const multiplier = rates.reduce((value, rate) => value * (1 + rate), 1);
  const stableResult = principal * multiplier;
  return Number.isFinite(stableResult) ? stableResult : numberError();
});

/** INTRATE: annualized interest rate of a fully invested security. */
export const INTRATE = makeFinancialFunction('INTRATE', (args, context) => {
  const settlement = date(args, 0, context);
  const maturity = date(args, 1, context);
  const investment = number(args, 2, context);
  const redemption = number(args, 3, context);
  const basisValue = basis(args, 4, context);
  const argumentError = firstError([settlement, maturity, investment, redemption, basisValue]);
  if (argumentError) return argumentError;
  const fraction = financialYearFraction(settlement, maturity, basisValue);
  if (isFormulaErrorValue(fraction)) return fraction;
  return investment <= 0 || redemption <= 0 || fraction <= 0
    ? numberError()
    : (redemption - investment) / investment / fraction;
});

/** IPMT: interest payment for a period. */
export const IPMT = makeFinancialFunction('IPMT', (args, context) => {
  const rate = number(args, 0, context);
  const period = number(args, 1, context);
  const nper = number(args, 2, context);
  const pv = number(args, 3, context);
  const fv = number(args, 4, context, 0);
  const type = number(args, 5, context, 0);
  const argumentError = firstError([rate, period, nper, pv, fv, type]);
  if (argumentError) return argumentError;
  if (period < 1 || period > nper || (type !== 0 && type !== 1)) return numberError();
  const pmt = periodicPayment(rate, nper, pv, fv, type);
  if (isFormulaErrorValue(pmt)) return pmt;
  if (rate === -1 && period === 1 && type === 0) return 0;
  if (rate === 0) return 0;
  if (period === 1 && type === 0) {
    const principal = firstPeriodPrincipal(rate, nper, pv, fv);
    if (principal !== undefined) return removeIntegerRoundoff(pmt - principal);
  }
  const before =
    period === 1
      ? pv
      : pv * Math.pow(1 + rate, period - 1) + (pmt * (1 + rate * type) * (Math.pow(1 + rate, period - 1) - 1)) / rate;
  return -before * rate;
});

/** IRR: periodic internal rate of return. */
export const IRR = makeFinancialFunction('IRR', (args, context) => {
  if (isDirectNonNumericCashFlow(args[0])) return valueError();
  const cashFlows = collectIrrCashFlows(args[0], context);
  const guess = number(args, 1, context, 0.1);
  if (isFormulaErrorValue(cashFlows)) return cashFlows;
  if (isFormulaErrorValue(guess)) return guess;
  if (guess <= -1) return valueError();
  return rateRoot(cashFlows, guess);
});

/** ISPMT: interest paid during a specific period of an investment. */
export const ISPMT = makeFinancialFunction('ISPMT', (args, context) => {
  const rate = number(args, 0, context);
  const period = number(args, 1, context);
  const nper = number(args, 2, context);
  const pv = number(args, 3, context);
  const argumentError = firstError([rate, period, nper, pv]);
  if (argumentError) return argumentError;
  return nper === 0 ? divisionError() : (pv * rate * (period - nper)) / nper;
});

/** MDURATION: modified duration of a coupon security. */
export const MDURATION = makeFinancialFunction('MDURATION', (args, context) => {
  const duration = DURATION.evaluate(args, context);
  const yieldRate = number(args, 3, context);
  const frequencyValue = frequency(args, 4, context);
  const argumentError = firstError([duration, yieldRate, frequencyValue]);
  if (argumentError) return argumentError;
  return duration / (1 + yieldRate / frequencyValue);
});

/** MIRR: modified internal rate of return. */
export const MIRR = makeFinancialFunction('MIRR', (args, context) => {
  if (isDirectNonNumericCashFlow(args[0])) return valueError();
  const reference = resolveConditionalReference(args[0], context);
  if (isFormulaErrorValue(reference)) return reference;
  const cashFlows = collectNpvCashFlows(args[0], context);
  const finance = number(args, 1, context);
  const reinvest = number(args, 2, context);
  const argumentError = firstError([cashFlows, finance, reinvest]);
  if (argumentError) return argumentError;
  if (cashFlows.length < 2) return divisionError();
  if (!cashFlows.some((value) => value > 0) || !cashFlows.some((value) => value < 0))
    return reference ? divisionError() : numberError();
  if (finance === -1) return divisionError();
  const last = cashFlows.length - 1;
  const positiveFuture = cashFlows.reduce(
    (sum, value, index) => sum + (value > 0 ? value * Math.pow(1 + reinvest, last - index) : 0),
    0,
  );
  const negativePresent = cashFlows.reduce(
    (sum, value, index) => sum + (value < 0 ? value / Math.pow(1 + finance, index) : 0),
    0,
  );
  if (negativePresent === 0 || positiveFuture <= 0) return numberError();
  const result = Math.pow(positiveFuture / -negativePresent, 1 / last) - 1;
  if (Number.isFinite(result)) return result;
  const scale = cashFlows.reduce((largest, value) => Math.max(largest, Math.abs(value)), 0);
  const scaledPositiveFuture = cashFlows.reduce(
    (sum, value, index) => sum + (value > 0 ? (value / scale) * Math.pow(1 + reinvest, last - index) : 0),
    0,
  );
  const scaledNegativePresent = cashFlows.reduce(
    (sum, value, index) => sum + (value < 0 ? value / scale / Math.pow(1 + finance, index) : 0),
    0,
  );
  const stableResult = Math.pow(scaledPositiveFuture / -scaledNegativePresent, 1 / last) - 1;
  return Number.isFinite(stableResult) ? stableResult : numberError();
});

/** NOMINAL: nominal annual interest rate. */
export const NOMINAL = makeFinancialFunction('NOMINAL', (args, context) => {
  const effective = number(args, 0, context);
  const periods = integer(args, 1, context);
  const argumentError = firstError([effective, periods]);
  if (argumentError) return argumentError;
  return effective > 0 && periods > 0 ? periods * Math.expm1(Math.log1p(effective) / periods) : numberError();
});

/** NPER: number of periods for an annuity. */
export const NPER = makeFinancialFunction('NPER', (args, context) => {
  const rate = number(args, 0, context);
  const pmt = number(args, 1, context);
  const pv = number(args, 2, context);
  const fv = number(args, 3, context, 0);
  const type = number(args, 4, context, 0);
  const argumentError = firstError([rate, pmt, pv, fv, type]);
  if (argumentError) return argumentError;
  if (type !== 0 && type !== 1) return numberError();
  if (rate === 0) return pmt === 0 ? numberError() : -(pv + fv) / pmt;
  if (rate <= -1) return numberError();
  const factor = 1 + rate * type;
  const numerator = pmt * factor - fv * rate;
  const denominator = pv * rate + pmt * factor;
  if (denominator === 0) return numberError();
  const relativeDifference = (-rate * (pv + fv)) / denominator;
  const logRatio =
    Number.isFinite(relativeDifference) && relativeDifference > -1
      ? Math.log1p(relativeDifference)
      : Math.log(numerator / denominator);
  const result = logRatio / Math.log1p(rate);
  if (numerator === denominator && Math.abs(result) < 1e-12) return 0;
  return Number.isFinite(result) ? result : numberError();
});

/** NPV: net present value of periodic cash flows. */
export const NPV = makeFinancialFunction('NPV', (args, context) => {
  const rate = number(args, 0, context);
  if (isFormulaErrorValue(rate)) return rate;
  const cashFlows: number[] = [];
  for (let index = 1; index < args.length; index++) {
    const next = collectNpvCashFlows(args[index], context);
    if (isFormulaErrorValue(next)) return next;
    cashFlows.push(...next);
  }
  return periodicNpv(rate, cashFlows);
});

/** ODDFPRICE: clean price for a security with an odd first coupon period. */
export const ODDFPRICE = makeFinancialFunction('ODDFPRICE', (args, context) => oddPrice(args, context, true));

/** ODDFYIELD: yield for a security with an odd first coupon period. */
export const ODDFYIELD = makeFinancialFunction('ODDFYIELD', (args, context) => oddYield(args, context, true));

/** ODDLPRICE: clean price for a security with an odd last coupon period. */
export const ODDLPRICE = makeFinancialFunction('ODDLPRICE', (args, context) => oddPrice(args, context, false));

/** ODDLYIELD: yield for a security with an odd last coupon period. */
export const ODDLYIELD = makeFinancialFunction('ODDLYIELD', (args, context) => oddYield(args, context, false));

/** PDURATION: periods required for an investment to reach a target value. */
export const PDURATION = makeFinancialFunction('PDURATION', (args, context) => {
  const rate = number(args, 0, context);
  const present = number(args, 1, context);
  const future = number(args, 2, context);
  const argumentError = firstError([rate, present, future]);
  if (argumentError) return argumentError;
  return rate <= 0 || present <= 0 || future <= 0
    ? numberError()
    : (Math.log(future) - Math.log(present)) / Math.log1p(rate);
});

/** PMT: periodic payment for an annuity. */
export const PMT = makeFinancialFunction('PMT', (args, context) => {
  const rate = number(args, 0, context);
  const nper = number(args, 1, context);
  const pv = number(args, 2, context);
  const fv = number(args, 3, context, 0);
  const type = number(args, 4, context, 0);
  const argumentError = firstError([rate, nper, pv, fv, type]);
  if (argumentError) return argumentError;
  if (rate < -1) return numberError();
  const result = periodicPayment(rate, nper, pv, fv, type);
  return removeIntegerRoundoff(typeof result === 'number' ? Number(result.toPrecision(15)) : result);
});

/** PPMT: principal payment for a period. */
export const PPMT = makeFinancialFunction('PPMT', (args, context) => {
  const rate = number(args, 0, context);
  const periodValue = number(args, 1, context);
  const period = isFormulaErrorValue(periodValue) ? periodValue : Math.trunc(periodValue);
  const nper = number(args, 2, context);
  const pv = number(args, 3, context);
  const fv = number(args, 4, context, 0);
  const type = number(args, 5, context, 0);
  const argumentError = firstError([rate, period, nper, pv, fv, type]);
  if (argumentError) return argumentError;
  if (period === 1 && period <= nper && type === 0 && rate !== 0) {
    const growth = Math.pow(1 + rate, nper);
    if (Number.isFinite(growth) && growth > 1e12) {
      const principal = -(rate * (pv + fv)) / (growth - 1);
      if (Number.isFinite(principal)) return principal;
    }
    if (fv === 0 && periodValue === 1) {
      const principal = firstPeriodPrincipal(rate, nper, pv, fv);
      if (principal !== undefined) return principal;
    }
  }
  const interest = IPMT.evaluate(args, context);
  if (isFormulaErrorValue(interest)) return interest;
  const pmt = periodicPayment(rate, nper, pv, fv, type);
  if (isFormulaErrorValue(pmt)) return pmt;
  const principal = pmt - interest;
  return principal === 0 ? 0 : principal;
});

/** PRICE: clean price of a coupon security. */
export const PRICE = makeFinancialFunction('PRICE', regularBondPrice);

/** PRICEDISC: price of a discounted security. */
export const PRICEDISC = makeFinancialFunction('PRICEDISC', (args, context) => {
  const settlement = date(args, 0, context, true);
  const maturity = date(args, 1, context, true);
  const discount = number(args, 2, context);
  const redemption = number(args, 3, context, 100);
  const basisValue = basis(args, 4, context);
  const argumentError = firstError([settlement, maturity, discount, redemption, basisValue]);
  if (argumentError) return argumentError;
  if (discount <= 0 || redemption <= 0) return numberError();
  const fraction = financialYearFraction(settlement, maturity, basisValue);
  if (isFormulaErrorValue(fraction)) return fraction;
  return fraction <= 0 ? numberError() : redemption * (1 - discount * fraction);
});

/** PRICEMAT: price of a security paying interest at maturity. */
export const PRICEMAT = makeFinancialFunction('PRICEMAT', (args, context) => {
  const settlement = oddBondDate(args, 0, context);
  const maturity = oddBondDate(args, 1, context);
  const issue = oddBondDate(args, 2, context);
  const rate = number(args, 3, context);
  const yieldRate = number(args, 4, context);
  const basisValue = basis(args, 5, context);
  const argumentError = firstError([settlement, maturity, issue, rate, yieldRate, basisValue]);
  if (argumentError) return argumentError;
  if (issue > settlement || settlement >= maturity || rate < 0 || yieldRate < 0) return numberError();
  const yearFraction = (start: number, end: number) => {
    if (basisValue !== 1) return financialYearFraction(start, end, basisValue);
    const days = financialDayCountDays(start, end, basisValue);
    return isFormulaErrorValue(days) ? days : days / 365;
  };
  const accrued = yearFraction(issue, settlement);
  const life = yearFraction(issue, maturity);
  const remaining = yearFraction(settlement, maturity);
  const fractionError = firstError([accrued, life, remaining]);
  if (fractionError) return fractionError;
  return (100 + 100 * rate * life) / (1 + yieldRate * remaining) - 100 * rate * accrued;
});

/** PV: present value of an annuity. */
export const PV = makeFinancialFunction('PV', (args, context) => {
  const rate = number(args, 0, context);
  const nper = number(args, 1, context);
  const pmt = number(args, 2, context);
  const fv = number(args, 3, context, 0);
  const type = number(args, 4, context, 0);
  const argumentError = firstError([rate, nper, pmt, fv, type]);
  if (argumentError) return argumentError;
  if (!Number.isFinite(rate) || !Number.isFinite(nper) || (type !== 0 && type !== 1)) return valueError();
  if (rate === 0) return -fv - pmt * nper;
  if (pmt === 0) {
    const presentValue = -fv * Math.pow(1 + rate, -nper);
    return Number.isFinite(presentValue) ? presentValue : numberError();
  }
  if (!Number.isFinite(Math.pow(1 + rate, nper))) return numberError();
  const exponent = rate > -1 ? -nper * Math.log1p(rate) : Number.NaN;
  const growth = rate > -1 && exponent <= 50 ? Math.expm1(exponent) : Math.pow(1 + rate, -nper) - 1;
  const discount = growth + 1;
  if (!Number.isFinite(discount)) return numberError();
  const presentValue =
    growth === -1 ? -pmt * (1 + rate * type) * (1 / rate) : -fv * discount + (pmt * (1 + rate * type) * growth) / rate;
  return Number.isFinite(presentValue) ? presentValue : numberError();
});

/** RATE: periodic interest rate for an annuity. */
export const RATE = makeFinancialFunction('RATE', (args, context) => {
  const nper = number(args, 0, context);
  const pmt = number(args, 1, context);
  const pv = number(args, 2, context);
  const fv = number(args, 3, context, 0);
  const type = number(args, 4, context, 0);
  const guess = number(args, 5, context, 0.1);
  const argumentError = firstError([nper, pmt, pv, fv, type, guess]);
  if (argumentError) return argumentError;
  if (nper <= 0 || (type !== 0 && type !== 1)) return numberError();
  return solveRateRoot(nper, pmt, pv, fv, type, guess);
});

/** RECEIVED: amount received at maturity for a discounted security. */
export const RECEIVED = makeFinancialFunction('RECEIVED', (args, context) => {
  const settlement = date(args, 0, context);
  const maturity = date(args, 1, context);
  const investment = number(args, 2, context);
  const discount = number(args, 3, context);
  const basisValue = basis(args, 4, context);
  const argumentError = firstError([settlement, maturity, investment, discount, basisValue]);
  if (argumentError) return argumentError;
  if (investment <= 0 || discount <= 0) return numberError();
  const fraction = financialYearFraction(settlement, maturity, basisValue);
  if (isFormulaErrorValue(fraction)) return fraction;
  return 1 - discount * fraction <= 0 ? numberError() : investment / (1 - discount * fraction);
});

/** RRI: equivalent growth rate for an investment. */
export const RRI = makeFinancialFunction(
  'RRI',
  (args, context) => {
    const nper = number(args, 0, context);
    const pv = number(args, 1, context);
    const fv = number(args, 2, context);
    const argumentError = firstError([nper, pv, fv]);
    if (argumentError) return argumentError;
    return nper <= 0 || pv <= 0 || fv <= 0 ? numberError() : Math.expm1((Math.log(fv) - Math.log(pv)) / nper);
  },
  3,
);

/** SLN: straight-line depreciation. */
export const SLN = makeFinancialFunction('SLN', (args, context) => {
  const cost = number(args, 0, context);
  const salvage = number(args, 1, context);
  const life = number(args, 2, context);
  const argumentError = firstError([cost, salvage, life]);
  if (argumentError) return argumentError;
  return straightLineDepreciation(cost, salvage, life);
});

/** SYD: sum-of-years-digits depreciation. */
export const SYD = makeFinancialFunction('SYD', (args, context) => {
  const cost = number(args, 0, context);
  const salvage = number(args, 1, context);
  const life = number(args, 2, context);
  const period = number(args, 3, context);
  const argumentError = firstError([cost, salvage, life, period]);
  if (argumentError) return argumentError;
  return sumOfYearsDepreciation(cost, salvage, life, period);
});

/** TBILLEQ: bond-equivalent yield for a Treasury bill. */
export const TBILLEQ = makeFinancialFunction('TBILLEQ', (args, context) => {
  const settlement = date(args, 0, context);
  const maturity = date(args, 1, context);
  const discount = number(args, 2, context);
  const argumentError = firstError([settlement, maturity, discount]);
  if (argumentError) return argumentError;
  const days = maturity - settlement;
  return days <= 0 || days > 365 || discount <= 0 || discount * days >= 360
    ? numberError()
    : (365 * discount) / (360 - discount * days);
});

/** TBILLPRICE: price per 100 for a Treasury bill. */
export const TBILLPRICE = makeFinancialFunction('TBILLPRICE', (args, context) => {
  const settlement = date(args, 0, context);
  const maturity = date(args, 1, context);
  const discount = number(args, 2, context);
  const argumentError = firstError([settlement, maturity, discount]);
  if (argumentError) return argumentError;
  const days = maturity - settlement;
  const settlementDate = excelDatePartsFromSerial(settlement);
  const maturityDate = excelDatePartsFromSerial(maturity);
  const fullCalendarYear =
    settlementDate &&
    maturityDate &&
    maturityDate.year === settlementDate.year + 1 &&
    maturityDate.month === settlementDate.month &&
    maturityDate.day === settlementDate.day;
  const yearDays = fullCalendarYear ? financialDayCountDays(settlement, maturity, 0) : days;
  if (isFormulaErrorValue(yearDays)) return yearDays;
  const priceDays = fullCalendarYear ? yearDays + 1 : days;
  return days <= 0 || (days > 365 && !fullCalendarYear) || discount <= 0 || discount * priceDays >= 360
    ? numberError()
    : 100 * (1 - (discount * priceDays) / 360);
});

/** TBILLYIELD: discount yield for a Treasury bill price. */
export const TBILLYIELD = makeFinancialFunction('TBILLYIELD', (args, context) => {
  const settlement = date(args, 0, context);
  const maturity = date(args, 1, context);
  const price = number(args, 2, context);
  const argumentError = firstError([settlement, maturity, price]);
  if (argumentError) return argumentError;
  const days = maturity - settlement;
  return days <= 0 || days > 365 || price <= 0 ? numberError() : ((100 - price) * 360) / (price * days);
});

/** VDB: variable declining-balance depreciation. */
export const VDB = makeFinancialFunction('VDB', (args, context) => {
  const cost = number(args, 0, context);
  const salvage = number(args, 1, context);
  const life = number(args, 2, context);
  const start = number(args, 3, context);
  const end = number(args, 4, context);
  const factor = number(args, 5, context, 2);
  const noSwitch = boolean(args, 6, context, false);
  const argumentError = firstError([cost, salvage, life, start, end, factor, noSwitch]);
  if (argumentError) return argumentError;
  return variableDecliningBalance(cost, salvage, life, start, end, factor, noSwitch);
});

/** XIRR: internal rate of return for irregular cash-flow dates. */
export const XIRR = makeFinancialFunction('XIRR', (args, context) => {
  const cashFlows = collectFinancialCashFlows(args[0], context, true);
  const dates = collectFinancialDateSerials(args[1], context, true);
  const guess = number(args, 2, context, 0.1);
  const argumentError = firstError([cashFlows, guess]);
  if (argumentError) return argumentError;
  if (isFormulaErrorValue(dates)) {
    const dateReference = resolveConditionalReference(args[1], context);
    const dateValues = collectValues(args[1], context);
    if (
      dateReference &&
      !isFormulaErrorValue(dateReference) &&
      Array.isArray(dateValues) &&
      dateValues.some((value) => typeof value === 'boolean')
    )
      return numberError();
    return dates.code === FormulaErrorCode.DivisionByZero || dates.code === FormulaErrorCode.NotAvailable
      ? valueError()
      : dates;
  }
  return xirrRoot(cashFlows, dates, guess);
});

/** XNPV: net present value for irregular cash-flow dates. */
export const XNPV = makeFinancialFunction('XNPV', (args, context) => {
  const rate = number(args, 0, context);
  const cashFlows = values(args, 1, context);
  const dates = collectFinancialDateSerials(args[2], context);
  if (hasTextInFinancialRange(args[1], context) || hasTextInFinancialRange(args[2], context)) return numberError();
  const argumentError = firstError([rate, cashFlows]);
  if (argumentError) return argumentError;
  if (isFormulaErrorValue(dates)) {
    const dateReference = resolveConditionalReference(args[2], context);
    const dateValues = collectValues(args[2], context);
    if (
      dateReference &&
      !isFormulaErrorValue(dateReference) &&
      Array.isArray(dateValues) &&
      dateValues.length !== cashFlows.length &&
      dateValues.some((value) => {
        const text = isFormulaText(value) ? value.value : value;
        return typeof text === 'string' && text.trim() !== '' && !Number.isFinite(Number(text));
      })
    )
      return numberError();
    if (dates.code === FormulaErrorCode.Reference || dates.code === FormulaErrorCode.Name) {
      const dateCount = financialInputCount(args[2], context);
      if (dateCount !== null && dateCount !== cashFlows.length) return numberError();
    }
    return dates;
  }
  return xnpvValue(rate, cashFlows, dates);
});

/** YIELD: yield of a coupon security. */
export const YIELD = makeFinancialFunction('YIELD', (args, context) => {
  const settlement = date(args, 0, context);
  const maturity = date(args, 1, context);
  const rate = number(args, 2, context);
  const price = number(args, 3, context);
  const redemption = bondRedemption(args, 4, context);
  const frequencyValue = frequency(args, 5, context);
  const basisValue = basis(args, 6, context);
  const argumentError = firstError([settlement, maturity, rate, price, redemption, frequencyValue, basisValue]);
  if (argumentError) return argumentError;
  if (rate === 0) {
    if (settlement <= 0 || price <= 0 || redemption <= 0) return numberError();
    const schedule = resolveCouponSchedule(settlement, maturity, frequencyValue, basisValue);
    if (isFormulaErrorValue(schedule)) return schedule;
    const remainingPeriods = schedule.couponsRemaining - 1 + schedule.daysToNext / schedule.daysInPeriod;
    const annualYield = schedule.frequency * Math.expm1((Math.log(redemption) - Math.log(price)) / remainingPeriods);
    return Number.isFinite(annualYield) ? annualYield : numberError();
  }
  return solveFinancialRoot(
    (yieldRate) => {
      const calculated = bondPrice(settlement, maturity, rate, yieldRate, redemption, frequencyValue, basisValue);
      return isFormulaErrorValue(calculated) ? Number.NaN : calculated - price;
    },
    undefined,
    { initialGuess: rate, lowerBound: -0.999999999, upperBound: 2.25, tolerance: 1e-14 },
  );
});

/** YIELDDISC: yield of a discounted security. */
export const YIELDDISC = makeFinancialFunction('YIELDDISC', (args, context) => {
  const settlement = date(args, 0, context);
  const maturity = date(args, 1, context);
  const price = number(args, 2, context);
  const redemption = number(args, 3, context, 100);
  const basisValue = basis(args, 4, context);
  const argumentError = firstError([settlement, maturity, price, redemption, basisValue]);
  if (argumentError) return argumentError;
  const fraction = financialYearFraction(settlement, maturity, basisValue);
  if (isFormulaErrorValue(fraction)) return fraction;
  return price <= 0 || redemption <= 0 || fraction <= 0 ? numberError() : (redemption - price) / price / fraction;
});

/** YIELDMAT: yield of a security paying interest at maturity. */
export const YIELDMAT = makeFinancialFunction('YIELDMAT', (args, context) => {
  const settlement = date(args, 0, context);
  const maturity = date(args, 1, context);
  const issue = date(args, 2, context);
  const rate = number(args, 3, context);
  const price = number(args, 4, context);
  const basisValue = basis(args, 5, context);
  const argumentError = firstError([settlement, maturity, issue, rate, price, basisValue]);
  if (argumentError) return argumentError;
  if (issue >= settlement || settlement >= maturity || rate < 0 || price <= 0) return numberError();
  const accrued = financialYearFraction(issue, settlement, basisValue);
  const remaining = financialYearFraction(settlement, maturity, basisValue);
  const total = financialYearFraction(issue, maturity, basisValue);
  const fractionError = firstError([accrued, remaining, total]);
  if (fractionError) return fractionError;
  const invested = price + 100 * rate * accrued;
  return remaining <= 0 || invested <= 0 ? numberError() : ((100 + 100 * rate * total) / invested - 1) / remaining;
});

function oddPrice(
  args: FormulaArg[],
  context: EvalContext,
  first: boolean,
  allowNegativeYield = false,
): number | FormulaError {
  if (args.length < (first ? 8 : 7) || args.length > (first ? 9 : 8)) return valueError();
  const settlement = first ? oddBondDate(args, 0, context) : date(args, 0, context);
  const maturity = first ? oddBondDate(args, 1, context) : date(args, 1, context);
  const issueOrLast = first ? oddBondDate(args, 2, context) : date(args, 2, context);
  const firstOrLast = first ? oddBondDate(args, 3, context) : issueOrLast;
  const rate = number(args, first ? 4 : 3, context);
  const yieldRate = number(args, first ? 5 : 4, context);
  const redemption = bondRedemption(args, first ? 6 : 5, context);
  const frequencyValue = frequency(args, first ? 7 : 6, context);
  const basisValue = basis(args, first ? 8 : 7, context);
  const argumentError = firstError([
    settlement,
    maturity,
    issueOrLast,
    firstOrLast,
    rate,
    yieldRate,
    redemption,
    frequencyValue,
    basisValue,
  ]);
  if (argumentError) return argumentError;
  if (settlement >= maturity || rate < 0 || (yieldRate < 0 && !allowNegativeYield) || redemption <= 0)
    return numberError();
  if (first && (issueOrLast > settlement || settlement >= firstOrLast || firstOrLast >= maturity)) return numberError();
  if (first) {
    const schedule = resolveOddFirstCouponSchedule(settlement, maturity, firstOrLast, frequencyValue, basisValue);
    if (isFormulaErrorValue(schedule)) return schedule;
    return shortFirstCouponPrice(issueOrLast, settlement, firstOrLast, rate, yieldRate, redemption, schedule);
  }
  if (issueOrLast <= settlement)
    return oddLastPrice(settlement, maturity, issueOrLast, rate, yieldRate, redemption, frequencyValue, basisValue);
  const regular = bondPrice(settlement, maturity, rate, yieldRate, redemption, frequencyValue, basisValue);
  if (isFormulaErrorValue(regular)) return regular;
  const oddFraction = financialYearFraction(
    first ? issueOrLast : firstOrLast,
    first ? firstOrLast : maturity,
    basisValue,
  );
  if (isFormulaErrorValue(oddFraction)) return oddFraction;
  return (
    regular + (redemption * rate * (oddFraction - 1 / frequencyValue)) / Math.pow(1 + yieldRate / frequencyValue, 1)
  );
}

function oddYield(args: FormulaArg[], context: EvalContext, first: boolean): number | FormulaError {
  const rateIndex = first ? 4 : 3;
  const yieldIndex = first ? 5 : 4;
  const couponRate = number(args, rateIndex, context);
  if (isFormulaErrorValue(couponRate)) return couponRate;
  if (couponRate > 10) return numberError();
  const price = readFinancialNumber(args[yieldIndex], context, { acceptLocalizedCurrency: true });
  if (isFormulaErrorValue(price)) return price;
  if (!first) {
    const settlement = date(args, 0, context);
    const maturity = date(args, 1, context);
    const lastCoupon = date(args, 2, context);
    const redemption = bondRedemption(args, 5, context);
    const frequencyValue = frequency(args, 6, context);
    const basisValue = basis(args, 7, context);
    const error = firstError([settlement, maturity, lastCoupon, redemption, frequencyValue, basisValue]);
    if (error) return error;
    if (lastCoupon <= settlement)
      return oddLastYield(settlement, maturity, lastCoupon, couponRate, price, redemption, frequencyValue, basisValue);
  }
  const guess = 0.1;
  const initialArgs = args.slice();
  initialArgs[yieldIndex] = { kind: 'value', value: guess };
  const initialPrice = oddPrice(initialArgs, context, first);
  if (isFormulaErrorValue(initialPrice)) return initialPrice;
  return solveFinancialRoot(
    (yieldRate) => {
      const clone = args.slice();
      clone[yieldIndex] = { kind: 'value', value: yieldRate };
      const calculated = oddPrice(clone, context, first, true);
      return isFormulaErrorValue(calculated) ? Number.NaN : calculated - price;
    },
    undefined,
    { initialGuess: guess, lowerBound: -0.999999999, upperBound: 10, tolerance: 1e-13 },
  );
}
