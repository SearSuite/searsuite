import { AggregationCache } from '../src/AggregationCache';
import { FormulaEvaluator } from '../src/FormulaEvaluator';
import { FormulaParser } from '../src/FormulaParser';
import { FunctionRegistry } from '../src/functions';
import { benchmarkContext } from './benchmarkUtils';

describe('information formulas benchmark', () => {
  it('performs 10,000 scalar type inspections below the configured threshold', () => {
    const evaluator = new FormulaEvaluator(new FunctionRegistry(), new AggregationCache());
    const ast = new FormulaParser().parse('=TYPE(A1)');
    const durations: number[] = [];
    let result = 0;
    for (let sample = 0; sample < 5; sample++) {
      const start = performance.now();
      for (let index = 0; index < 10_000; index++) result += Number(evaluator.evaluate(ast, benchmarkContext));
      durations.push(performance.now() - start);
    }
    durations.sort((left, right) => left - right);
    const p95 = durations[Math.ceil(durations.length * 0.95) - 1];
    const limit = Number(process.env['FORMULA_BENCHMARK_MAX_P95_MS'] ?? 1_000);
    expect(result).toBe(50_000);
    expect(p95).toBeLessThanOrEqual(limit);
  });
});
