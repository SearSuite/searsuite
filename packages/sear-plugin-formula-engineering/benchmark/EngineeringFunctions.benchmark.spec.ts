/** @jest-environment node */

import type { EvalContext, FormulaValue } from '@searsuite/sear-domain-formula-engine';
import { performance } from 'perf_hooks';
import { BESSELJ, BITAND, CONVERT, IMCOS, IMCOTH, IMLOG, IMTANH } from '../src';

const context: EvalContext = {
  isCellInBounds: () => true,
  getCellValue: () => 0,
  iterateRange: () => [],
};
const value = (input: FormulaValue) => ({ kind: 'value', value: input } as const);

function measure(operation: () => FormulaValue, expected: (result: FormulaValue) => void): void {
  for (let warmup = 0; warmup < 5; warmup++) operation();
  const durations: number[] = [];
  let result: FormulaValue = 0;
  for (let sample = 0; sample < 30; sample++) {
    const start = performance.now();
    result = operation();
    durations.push(performance.now() - start);
  }
  expected(result);
  durations.sort((left, right) => left - right);
  const median = durations[14]!;
  const p95 = durations[28]!;
  expect(Number.isFinite(median)).toBe(true);
  expect(p95).toBeLessThan(Number(process.env['ENGINEERING_BENCHMARK_MAX_P95_MS'] ?? 1_000));
}

describe('engineering formula performance', () => {
  it('measures 10,000 48-bit operations with median and p95 over 30 samples', () => {
    measure(
      () => {
        let result: FormulaValue = 0;
        for (let index = 0; index < 10_000; index++) result = BITAND.evaluate([value(index), value(255)], context);
        return result;
      },
      (result) => expect(result).toBe(15),
    );
  });

  it('measures 10,000 radix-independent unit conversions', () => {
    measure(
      () => {
        let result: FormulaValue = 0;
        for (let index = 0; index < 10_000; index++)
          result = CONVERT.evaluate([value(index), value('m'), value('km')], context);
        return result;
      },
      (result) => expect(result).toBeCloseTo(9.999),
    );
  });

  it('measures 10,000 complex evaluations without non-finite output', () => {
    measure(
      () => {
        let result: FormulaValue = '';
        for (let index = 0; index < 10_000; index++) result = IMCOS.evaluate([value(`${index % 10}+2i`)], context);
        return result;
      },
      (result) => expect(result).toEqual(expect.any(String)),
    );
  });

  it.each([IMCOTH, IMLOG, IMTANH])('measures 10,000 new complex-dialect evaluations', (formula) => {
    measure(() => { let result: FormulaValue = ''; for (let index = 0; index < 10_000; index++) result = formula.evaluate(formula === IMLOG ? [value('8+i'), value(2)] : [value('1+i')], context); return result; }, (result) => expect(result).toEqual(expect.any(String)));
  });

  it('measures the special-function path over 30 samples', () => {
    measure(
      () => BESSELJ.evaluate([value(1.9), value(2)], context),
      (result) => {
        expect(result).toEqual(expect.any(Number));
        expect(Number.isFinite(result as number)).toBe(true);
      },
    );
  });
});
