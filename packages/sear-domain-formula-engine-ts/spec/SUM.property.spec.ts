import { AggregationCache } from '../src/AggregationCache';
import { FormulaEvaluator } from '../src/FormulaEvaluator';
import { FormulaParser } from '../src/FormulaParser';
import { FunctionRegistry } from '../src/functions';
import { type EvalContext, type FormulaValue } from '@searsuite/sear-domain-formula-engine';

function createRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function createContext(values: number[][]): EvalContext {
  return {
    isCellInBounds(row: number, col: number): boolean {
      return row >= 0 && row < values.length && col >= 0 && col < values[0].length;
    },
    getCellValue(row: number, col: number): FormulaValue {
      return values[row][col];
    },
    *iterateRange(startRow: number, startCol: number, endRow: number, endCol: number): Iterable<FormulaValue> {
      for (let row = startRow; row <= endRow; row++) {
        for (let col = startCol; col <= endCol; col++) {
          yield values[row][col];
        }
      }
    },
  };
}

describe('SUM properties', () => {
  it('equals a direct reduction for deterministic generated numeric matrices', () => {
    const random = createRandom(20260727);
    const parser = new FormulaParser();
    const ast = parser.parse('=SUM(A1:E7)');

    for (let iteration = 0; iteration < 100; iteration++) {
      const values = Array.from({ length: 7 }, () =>
        Array.from({ length: 5 }, () => Math.floor(random() * 2001) - 1000),
      );
      const expected = values.flat().reduce((sum, value) => sum + value, 0);
      const evaluator = new FormulaEvaluator(new FunctionRegistry(), new AggregationCache());

      expect(evaluator.evaluate(ast, createContext(values))).toBe(expected);
    }
  });

  it('keeps cached incremental results equivalent to a full recalculation', () => {
    const random = createRandom(20260728);
    const parser = new FormulaParser();
    const ast = parser.parse('=SUM(A1:D4)');
    const values = Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => Math.floor(random() * 100)));
    const cache = new AggregationCache();
    const cachedEvaluator = new FormulaEvaluator(new FunctionRegistry(), cache);
    const context = createContext(values);

    cachedEvaluator.evaluate(ast, context);
    for (let iteration = 0; iteration < 50; iteration++) {
      const row = Math.floor(random() * 4);
      const col = Math.floor(random() * 4);
      const oldValue = values[row][col];
      const newValue = Math.floor(random() * 200) - 100;
      values[row][col] = newValue;
      cache.onCellChanged(row, col, oldValue, newValue);

      const incremental = cachedEvaluator.evaluate(ast, context);
      const full = new FormulaEvaluator(new FunctionRegistry(), new AggregationCache()).evaluate(ast, context);
      expect(incremental).toBe(full);
    }
  });
});
