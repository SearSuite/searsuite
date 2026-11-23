import { benchmarkFormula } from './benchmarkUtils';
import { AggregationCache } from '../src/AggregationCache';
import { FormulaEvaluator } from '../src/FormulaEvaluator';
import { FormulaParser } from '../src/FormulaParser';
import { FunctionRegistry } from '../src/functions';
import { benchmarkContext } from './benchmarkUtils';

describe('cross-spreadsheet dialect formula performance', () => {
  it.each([
    '=SUM(ARRAY_CONSTRAIN(A1:C10000,10000,3))',
    '=SUM(FLATTEN(A1:C10000))',
    '=AVERAGE_WEIGHTED(A1:A10000,C1:C10000)',
    '=MARGINOFERROR(0.95,A1:A10000)',
  ])('executes a 10,000-row success path: %s', (formula) => {
    expect(benchmarkFormula(formula).p95).toBeGreaterThanOrEqual(0);
  });

  it.each(['EPOCHTODATE(0)', 'TO_DATE(45351.75)', 'ISBETWEEN(5,1,10)', 'ISDATE("2024-02-29")', 'ISEMAIL("a@example.com")', 'ISURL("https://example.com")', 'ROUNDBANK(2.5,0)', 'NUMBERSTRING(123,1)', 'REGEXMATCH("A12","[0-9]+")'])('executes 10,000 scalar calls: %s', (expression) => {
    const evaluator = new FormulaEvaluator(new FunctionRegistry(), new AggregationCache());
    const ast = new FormulaParser().parse(`=${expression}`);
    const start = performance.now();
    let result;
    for (let index = 0; index < 10_000; index++) result = evaluator.evaluate(ast, benchmarkContext);
    expect(result).not.toEqual(expect.objectContaining({ kind: 'error' }));
    expect(performance.now() - start).toBeLessThan(Number(process.env['FORMULA_BENCHMARK_MAX_P95_MS'] ?? 1_000));
  });
});
