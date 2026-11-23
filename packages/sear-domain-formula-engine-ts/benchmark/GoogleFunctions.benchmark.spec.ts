import {
  FormulaGoogleServiceDefinition,
  FormulaServiceCacheStatus,
  type EvalContext,
  type FormulaGoogleRequest,
  type FormulaValue,
} from '@searsuite/sear-domain-formula-engine';
import { AggregationCache } from '../src/AggregationCache';
import { FormulaEvaluator } from '../src/FormulaEvaluator';
import { FormulaParser } from '../src/FormulaParser';
import { FunctionRegistry } from '../src/functions';
import { benchmarkContext, benchmarkFormula } from './benchmarkUtils';

describe('Google-compatible formula performance', () => {
  it.each([
    '=COUNTUNIQUE(A1:A10000)',
    '=JOIN(",",A1:A10000)',
    '=SORTN(A1:A10000,100)',
    '=QUERY(A1:C10000,"select Col1 where Col2 = \'Item 1\' limit 100",0)',
    '=SPARKLINE(A1:A10000)',
  ])('executes a 10,000-row path: %s', (formula) => {
    expect(benchmarkFormula(formula).p95).toBeGreaterThanOrEqual(0);
  });

  it.each([
    'ADD(2,3)', 'ARRAYFORMULA({1,2}*2)', 'AVERAGE.WEIGHTED({10,20},{1,3})', 'DIVIDE(6,2)',
    'EQ(2,2)', 'GT(3,2)', 'GTE(2,2)', 'LT(2,3)', 'LTE(2,2)', 'MINUS(5,2)', 'MULTIPLY(3,4)',
    'NE(2,3)', 'POW(2,3)', 'SPLIT("a,b",",")', 'TO_DOLLARS(12.5)', 'TO_PERCENT(0.25)',
    'TO_PURE_NUMBER("42")', 'TO_TEXT(42)', 'UMINUS(3)', 'UNARY_PERCENT(25)', 'UPLUS("3")',
  ])('executes 10,000 pure scalar calls: %s', (expression) => {
    runRepeated(expression, benchmarkContext);
  });

  it.each([
    'AI("Summarize","text")', 'GOOGLEFINANCE("NASDAQ:GOOG","price")',
    'GOOGLETRANSLATE("hello","en","zh-CN")', 'IMPORTDATA("https://example.com/data.csv")',
    'IMPORTFEED("https://example.com/feed.xml")', 'IMPORTHTML("https://example.com","table",1)',
    'IMPORTRANGE("sheet-id","A1:B2")', 'IMPORTXML("https://example.com","//title")',
  ])('executes 10,000 ready-cache reads: %s', (expression) => {
    const externalServices = {
      get<T>(definition: { id: string }): T | undefined {
        return definition.id === FormulaGoogleServiceDefinition.id ? { read: (_request: FormulaGoogleRequest) => ({ status: FormulaServiceCacheStatus.Ready, value: 'cached' }) } as T : undefined;
      },
    };
    runRepeated(expression, { ...benchmarkContext, externalServices });
  });
});

function runRepeated(expression: string, context: EvalContext): void {
  const evaluator = new FormulaEvaluator(new FunctionRegistry(), new AggregationCache());
  const ast = new FormulaParser().parse(`=${expression}`);
  const start = performance.now();
  let result: FormulaValue = 0;
  for (let index = 0; index < 10_000; index++) result = evaluator.evaluate(ast, context);
  expect(result).not.toEqual(expect.objectContaining({ kind: 'error' }));
  expect(performance.now() - start).toBeLessThan(Number(process.env['FORMULA_BENCHMARK_MAX_P95_MS'] ?? 1_000));
}
