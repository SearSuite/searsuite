import { SearError } from '@searsuite/sear-foundation-error';
import { AggregationCache } from '../src/AggregationCache';
import { FormulaEvaluator } from '../src/FormulaEvaluator';
import { FormulaParser } from '../src/FormulaParser';
import { FunctionRegistry } from '../src/functions';
import { DependencyGraph } from '../src/DependencyGraph';
import { cellKey } from '../src/cellKey';
import { type EvalContext, type FormulaValue } from '@searsuite/sear-domain-formula-engine';

const rowCount = 100_000;
const samples = 7;
const fanoutFormulaCount = 10_000;
const parser = new FormulaParser();
const ast = parser.parse(`=SUM(A1:A${rowCount})`);
const values = new Float64Array(rowCount);

for (let row = 0; row < rowCount; row++) values[row] = row % 10;

const context: EvalContext = {
  isCellInBounds(row: number, col: number): boolean {
    return row >= 0 && row < rowCount && col === 0;
  },
  getCellValue(row: number): FormulaValue {
    return values[row];
  },
  *iterateRange(startRow: number, _startCol: number, endRow: number, _endCol: number): Iterable<FormulaValue> {
    for (let row = startRow; row <= endRow; row++) yield values[row];
  },
};

function median(valuesToSort: number[]): number {
  const sorted = [...valuesToSort].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function percentile95(valuesToSort: number[]): number {
  const sorted = [...valuesToSort].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * 0.95) - 1];
}

interface BenchmarkResult {
  p50: number;
  p95: number;
  heapDeltaBytes: number | undefined;
}

function getHeapUsed(): number | undefined {
  const runtime = globalThis as unknown as {
    process?: { memoryUsage?: () => { heapUsed: number } };
  };
  return runtime.process?.memoryUsage?.().heapUsed;
}

function measure(label: string, operation: () => void): BenchmarkResult {
  const durations: number[] = [];
  const heapBefore = getHeapUsed();
  for (let sample = 0; sample < samples; sample++) {
    const start = performance.now();
    operation();
    durations.push(performance.now() - start);
  }
  const heapAfter = getHeapUsed();
  const result = {
    p50: median(durations),
    p95: percentile95(durations),
    heapDeltaBytes: heapBefore === void 0 || heapAfter === void 0 ? void 0 : heapAfter - heapBefore,
  };
  const heapDelta = result.heapDeltaBytes === void 0 ? 'n/a' : `${result.heapDeltaBytes} B`;
  console.log(`${label}: p50 ${result.p50.toFixed(2)} ms, p95 ${result.p95.toFixed(2)} ms, heap Δ ${heapDelta}`);
  return result;
}

function assertConfiguredThreshold(label: string, result: BenchmarkResult): void {
  const runtime = globalThis as unknown as {
    process?: { env?: Record<string, string | undefined> };
  };
  const configured = runtime.process?.env?.['FORMULA_BENCHMARK_MAX_P95_MS'];
  if (configured === void 0) return;
  const limit = Number(configured);
  if (!Number.isFinite(limit) || limit <= 0) {
    throw new SearError('FORMULA_BENCHMARK_MAX_P95_MS must be a positive number.');
  }
  if (result.p95 > limit) {
    throw new SearError(`${label} p95 ${result.p95.toFixed(2)} ms exceeded ${limit} ms.`);
  }
}

describe('SUM benchmark', () => {
  it('reports calculation, cache update, and dependency fanout latency', () => {
    const firstCalculation = measure('SUM first calculation (100,000 cells)', () => {
      const evaluator = new FormulaEvaluator(new FunctionRegistry(), new AggregationCache());
      evaluator.evaluate(ast, context);
    });

    const cache = new AggregationCache();
    const evaluator = new FormulaEvaluator(new FunctionRegistry(), cache);
    evaluator.evaluate(ast, context);
    const cachedUpdate = measure('SUM cached single-cell update', () => {
      const oldValue = values[50_000];
      const newValue = oldValue + 1;
      values[50_000] = newValue;
      cache.onCellChanged(50_000, 0, oldValue, newValue);
      evaluator.evaluate(ast, context);
    });

    const fanoutAst = parser.parse('=A1+1');
    const fanoutDependencies = parser.extractDependencies(fanoutAst);
    const fanout = measure(`dependency fanout (${fanoutFormulaCount} formulas)`, () => {
      const graph = new DependencyGraph();
      for (let index = 0; index < fanoutFormulaCount; index++) {
        graph.updateCell(cellKey(index, 1), fanoutDependencies);
      }
      graph.markDirty([cellKey(0, 0)]);
    });

    assertConfiguredThreshold('SUM first calculation', firstCalculation);
    assertConfiguredThreshold('SUM cached update', cachedUpdate);
    assertConfiguredThreshold('dependency fanout', fanout);
  });
});
