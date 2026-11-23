import { SearError } from '@searsuite/sear-foundation-error';
import { AggregationCache } from '../src/AggregationCache';
import { FormulaEvaluator } from '../src/FormulaEvaluator';
import { FormulaParser } from '../src/FormulaParser';
import { FunctionRegistry } from '../src/functions';
import { type EvalContext, type FormulaValue } from '@searsuite/sear-domain-formula-engine';

export const benchmarkRows = 10_000;
export const benchmarkParser = new FormulaParser();
export const benchmarkValues = new Float64Array(benchmarkRows);
for (let row = 0; row < benchmarkRows; row++) benchmarkValues[row] = row % 100;

export const benchmarkContext: EvalContext = {
  currentDateTime: () => Date.UTC(2024, 0, 1, 12),
  random: () => 0.5,
  languageService: {
    detectLanguage: () => ({ status: 'ready', value: 'en' }),
    translate: () => ({ status: 'ready', value: 'translated' }),
  },
  isCellInBounds: (row, col) => row >= 0 && row < benchmarkRows && col >= 0 && col < 3,
  getSheetShape: () => [benchmarkRows, 3],
  getCellValue: (row, col): FormulaValue =>
    col === 0 ? benchmarkValues[row] : col === 1 ? `Item ${row % 10}` : benchmarkValues[row] * 2,
  *iterateRange(startRow, startCol, endRow, endCol): Iterable<FormulaValue> {
    for (let row = startRow; row <= endRow; row++) {
      for (let col = startCol; col <= endCol; col++) yield benchmarkContext.getCellValue(row, col);
    }
  },
};

export function benchmarkFormula(formula: string): { p95: number; result: FormulaValue } {
  const ast = benchmarkParser.parse(formula);
  const durations: number[] = [];
  // Warm the evaluator and JavaScript engine before collecting latency samples.
  // Otherwise the maximum of five samples mostly measures one-time module/JIT work.
  let result: FormulaValue = new FormulaEvaluator(new FunctionRegistry(), new AggregationCache()).evaluate(
    ast,
    benchmarkContext,
  );
  for (let sample = 0; sample < 5; sample++) {
    const evaluator = new FormulaEvaluator(new FunctionRegistry(), new AggregationCache());
    const start = performance.now();
    result = evaluator.evaluate(ast, benchmarkContext);
    durations.push(performance.now() - start);
  }
  durations.sort((left, right) => left - right);
  assertSuccessfulResult(result, formula);
  const p95 = durations[Math.ceil(durations.length * 0.95) - 1];
  console.log(`${formula}: p95 ${p95.toFixed(2)} ms`);
  const limit = Number(process.env['FORMULA_BENCHMARK_MAX_P95_MS'] ?? 1_000);
  if (!Number.isFinite(limit) || limit <= 0)
    throw new SearError('FORMULA_BENCHMARK_MAX_P95_MS must be a positive number.');
  if (p95 > limit) throw new SearError(`${formula} p95 ${p95.toFixed(2)} ms exceeded ${limit} ms.`);
  return { p95, result };
}

function assertSuccessfulResult(value: FormulaValue, formula: string): void {
  if (Array.isArray(value)) {
    for (const row of value) for (const cell of row as FormulaValue[]) assertSuccessfulResult(cell, formula);
  } else if (typeof value === 'object' && value !== null && value.kind === 'error') {
    throw new SearError(`${formula} returned ${value.code}; a failed calculation is not a valid performance path.`);
  } else if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new SearError(`${formula} returned a non-finite result.`);
  }
}
