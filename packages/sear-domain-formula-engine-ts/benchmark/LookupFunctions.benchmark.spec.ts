/** @jest-environment node */

import { AggregationCache } from '../src/AggregationCache';
import { FormulaEvaluator } from '../src/FormulaEvaluator';
import { FormulaParser } from '../src/FormulaParser';
import { FunctionRegistry } from '../src/functions';
import { type EvalContext, type FormulaValue } from '@searsuite/sear-domain-formula-engine';

const context: EvalContext = {
  isCellInBounds: (row, col) => row >= 0 && row < 20_000 && col >= 0 && col < 20,
  getSheetShape: () => [20_000, 20],
  getCellValue: (row, col) => col === 0 ? row : col === 1 ? `K${row % 100}` : row,
  iterateRange(startRow, startCol, endRow, endCol) {
    const values: FormulaValue[] = [];
    for (let row = startRow; row <= endRow; row++) for (let col = startCol; col <= endCol; col++) values.push(this.getCellValue(row, col));
    return values;
  },
};

function measure(formula: string): { median: number; p95: number; result: FormulaValue } {
  const evaluator = new FormulaEvaluator(new FunctionRegistry(), new AggregationCache());
  const parser = new FormulaParser();
  const times: number[] = [];
  let result: FormulaValue = 0;
  for (let run = 0; run < 35; run++) {
    const start = performance.now();
    result = evaluator.evaluate(parser.parse(formula), context);
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return { median: times[Math.floor(times.length / 2)]!, p95: times[Math.floor(times.length * 0.95)]!, result };
}

describe('lookup and reference performance', () => {
  it('measures 10k-item dynamic-array transforms after warmup', () => {
    const measured = measure('=SORT(SEQUENCE(10000,1,1,1))');
    expect(Array.isArray(measured.result)).toBe(true);
    expect(measured.median).toBeLessThan(500);
    expect(measured.p95).toBeLessThan(1000);
  });

  it('measures repeated scalar reference calls', () => {
    const measured = measure('=MATCH(9999,A1:A10000,0)');
    expect(measured.result).toBe(10000);
    expect(Number.isFinite(measured.median)).toBe(true);
    expect(Number.isFinite(measured.p95)).toBe(true);
  });
});
