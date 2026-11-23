/** @jest-environment node */

import { AggregationCache } from '../src/AggregationCache';
import { FormulaEvaluator } from '../src/FormulaEvaluator';
import { FormulaParser } from '../src/FormulaParser';
import { FunctionRegistry } from '../src/functions';
import { type FormulaValue } from '@searsuite/sear-domain-formula-engine';
import { benchmarkContext } from './benchmarkUtils';
import { financialBenchmarkCases } from './financialBenchmarkCases';

const parser = new FormulaParser();

function measure(formula: string): { readonly median: number; readonly p95: number; readonly result: FormulaValue } {
  const ast = parser.parse(formula);
  const samples: number[] = [];
  let result: FormulaValue = 0;
  for (let index = 0; index < 35; index++) {
    const evaluator = new FormulaEvaluator(new FunctionRegistry(), new AggregationCache());
    const start = performance.now();
    result = evaluator.evaluate(ast, benchmarkContext);
    if (index >= 5) samples.push(performance.now() - start);
  }
  samples.sort((left, right) => left - right);
  return {
    median: samples[Math.floor(samples.length / 2)],
    p95: samples[Math.ceil(samples.length * 0.95) - 1],
    result,
  };
}

function expectFinite(result: FormulaValue): void {
  if (Array.isArray(result)) {
    for (const row of result) for (const cell of row as FormulaValue[]) expectFinite(cell);
    return;
  }
  expect(typeof result).toBe('number');
  expect(Number.isFinite(result as number)).toBe(true);
}

describe('financial formula performance coverage', () => {
  it('measures every financial formula with warmup, median, and p95 samples', () => {
    expect(financialBenchmarkCases).toHaveLength(55);
    const limit = Number(process.env['FORMULA_BENCHMARK_MAX_P95_MS'] ?? 1_000);
    for (const [name, formula] of financialBenchmarkCases) {
      const measured = measure(formula);
      expectFinite(measured.result);
      expect(measured.p95).toBeLessThanOrEqual(limit);
      expect(measured.median).toBeLessThanOrEqual(measured.p95);
      console.log(`${name}: median ${measured.median.toFixed(2)} ms, p95 ${measured.p95.toFixed(2)} ms`);
    }
  });

  it('handles a ten-thousand-cell periodic cash-flow range', () => {
    const measured = measure('=NPV(0.05,A1:A10000)');
    expectFinite(measured.result);
    expect(measured.p95).toBeLessThanOrEqual(Number(process.env['FORMULA_BENCHMARK_MAX_P95_MS'] ?? 1_000));
  });
});
