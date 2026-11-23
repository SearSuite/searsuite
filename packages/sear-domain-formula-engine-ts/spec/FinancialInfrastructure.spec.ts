/** @jest-environment node */

import {
  bondDuration,
  bondPrice,
  collectFinancialCashFlows,
  decliningBalanceDepreciation,
  financialDayCountDays,
  financialYearFraction,
  forEachFinancialCashFlow,
  futureValue,
  normalizeCouponFrequency,
  payment,
  periodicNpv,
  resolveCouponSchedule,
  solveFinancialRoot,
  straightLineDepreciation,
  sumOfYearsDepreciation,
  variableDecliningBalance,
} from '../src/functions/financial';
import { excelSerialFromDateParts } from '../src/functions/dateTime/shared/dateTimeUtils';
import { FormulaErrorCode, type EvalContext, type FormulaValue } from '@searsuite/sear-domain-formula-engine';

const date = (year: number, month: number, day: number): number => excelSerialFromDateParts(year, month, day)!;

function errorCode(value: unknown): string | undefined {
  return typeof value === 'object' && value !== null && 'code' in value ? String(value.code) : undefined;
}

function contextFor(values: FormulaValue[] = []): EvalContext {
  return {
    isCellInBounds: (row, col) => row >= 0 && col >= 0 && row < 10 && col < 10,
    getCellValue: (row, col) => values[row * 10 + col] ?? 0,
    *iterateRange(startRow, startCol, endRow, endCol): Iterable<FormulaValue> {
      for (let row = startRow; row <= endRow; row++) {
        for (let col = startCol; col <= endCol; col++) yield values[row * 10 + col] ?? 0;
      }
    },
  };
}

describe('financial infrastructure', () => {
  it('supports all Excel day-count bases and rejects invalid bases', () => {
    const start = date(2024, 1, 31);
    const end = date(2024, 2, 29);
    expect(financialDayCountDays(start, end, 0)).toBe(30);
    expect(financialDayCountDays(start, end, 4)).toBe(29);
    expect(financialDayCountDays(start, end, 2)).toBe(end - start);
    expect(financialDayCountDays(start, end, 1)).toBe(end - start);
    expect(financialYearFraction(start, end, 1)).toBeCloseTo((end - start) / 366, 12);
    expect(financialYearFraction(start, end, 3)).toBeCloseTo((end - start) / 365, 12);
    expect(errorCode(normalizeCouponFrequency(3))).toBe(FormulaErrorCode.Number);
  });

  it('resolves coupon boundaries, remaining coupons, and basis day counts', () => {
    const schedule = resolveCouponSchedule(date(2024, 3, 15), date(2025, 12, 31), 2, 0);
    expect(errorCode(schedule)).toBeUndefined();
    if ('kind' in schedule) return;
    expect(schedule.previousCoupon).toBe(date(2023, 12, 31));
    expect(schedule.nextCoupon).toBe(date(2024, 6, 30));
    expect(schedule.couponsRemaining).toBe(4);
    expect(schedule.daysInPeriod).toBe(180);
    expect(schedule.daysFromPrevious).toBe(75);
  });

  it('rejects invalid settlement and frequency combinations', () => {
    expect(errorCode(resolveCouponSchedule(date(2025, 1, 1), date(2024, 1, 1), 2))).toBe(FormulaErrorCode.Number);
    expect(errorCode(resolveCouponSchedule(date(2024, 1, 1), date(2025, 1, 1), 3))).toBe(FormulaErrorCode.Number);
  });

  it('collects range cash flows and streams without hiding invalid values', () => {
    const context = contextFor([1, 2, 3, 4]);
    const arg = { kind: 'range' as const, start: [0, 0] as [number, number], end: [0, 3] as [number, number] };
    expect(collectFinancialCashFlows(arg, context)).toEqual([1, 2, 3, 4]);
    const seen: number[] = [];
    expect(
      forEachFinancialCashFlow(arg, context, (value) => {
        seen.push(value);
      }),
    ).toBeUndefined();
    expect(seen).toEqual([1, 2, 3, 4]);
    const invalid = contextFor([1, { kind: 'error', code: FormulaErrorCode.Value }]);
    expect(errorCode(collectFinancialCashFlows(arg, invalid))).toBe(FormulaErrorCode.Value);
    expect(errorCode(forEachFinancialCashFlow(arg, invalid, () => true))).toBe(FormulaErrorCode.Value);
  });

  it('computes periodic cash-flow primitives with zero-rate branches', () => {
    expect(periodicNpv(0.1, [-100, 60, 60])).toBeCloseTo(3.756574, 5);
    expect(futureValue(0, 3, -100, 0)).toBe(300);
    expect(payment(0, 4, 100, 0)).toBe(-25);
    expect(errorCode(periodicNpv(-1, [1]))).toBe(FormulaErrorCode.DivisionByZero);
    expect(errorCode(payment(0, 0, 100))).toBe(FormulaErrorCode.DivisionByZero);
  });

  it('solves roots deterministically and returns #NUM! for an unbracketed root', () => {
    expect(
      solveFinancialRoot(
        (x) => x * x - 2,
        (x) => 2 * x,
        { initialGuess: 1 },
      ),
    ).toBeCloseTo(Math.sqrt(2), 9);
    expect(
      errorCode(
        solveFinancialRoot(
          (x) => x * x + 1,
          (x) => 2 * x,
        ),
      ),
    ).toBe(FormulaErrorCode.Number);
  });

  it('provides straight-line, sum-of-years, declining, and variable depreciation', () => {
    expect(straightLineDepreciation(1000, 100, 5)).toBe(180);
    expect(sumOfYearsDepreciation(1000, 100, 5, 1)).toBe(300);
    expect(decliningBalanceDepreciation(1000, 0, 5, 1, 2)).toBe(400);
    expect(variableDecliningBalance(1000, 0, 5, 0, 1, 2)).toBe(400);
    expect(straightLineDepreciation(100, 200, 5)).toBe(-20);
  });

  it('prices a bond and computes positive duration at par yield', () => {
    const settlement = date(2025, 1, 1);
    const maturity = date(2027, 1, 1);
    expect(bondPrice(settlement, maturity, 0.1, 0.1, 100, 2, 0)).toBeCloseTo(100, 9);
    const duration = bondDuration(settlement, maturity, 0.1, 0.1, 100, 2, 0);
    expect(typeof duration).toBe('number');
    expect(duration as number).toBeGreaterThan(0);
  });
});
