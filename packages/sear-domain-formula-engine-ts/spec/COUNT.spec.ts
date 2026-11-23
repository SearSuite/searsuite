import { AggregationCache } from '../src/AggregationCache';
import { FormulaEvaluator } from '../src/FormulaEvaluator';
import { FormulaParser } from '../src/FormulaParser';
import { FunctionRegistry } from '../src/functions';
import { COUNT } from '../src/functions/math/aggregation/count';
import {
  type EvalContext,
  type FormulaValue,
  FormulaErrorCode,
  createFormulaError,
} from '@searsuite/sear-domain-formula-engine';

function createContext(
  data: Record<string, FormulaValue>,
  shape: [number, number],
  visited?: Array<[number, number]>,
): EvalContext {
  return {
    isCellInBounds: (row, col) => row >= 0 && row < shape[0] && col >= 0 && col < shape[1],
    getSheetShape: () => shape,
    getCellValue: (row, col) => data[`${row},${col}`] ?? 0,
    *iterateRange(startRow, startCol, endRow, endCol) {
      for (let row = startRow; row <= endRow; row++) {
        for (let col = startCol; col <= endCol; col++) {
          visited?.push([row, col]);
          yield data[`${row},${col}`] ?? 0;
        }
      }
    },
    *iterateRangeCells(startRow, startCol, endRow, endCol) {
      for (let row = startRow; row <= endRow; row++) {
        for (let col = startCol; col <= endCol; col++) {
          visited?.push([row, col]);
          const key = `${row},${col}`;
          yield {
            row,
            col,
            value: data[key] ?? 0,
            source: Object.hasOwn(data, key) ? ('value' as const) : ('empty' as const),
          };
        }
      }
    },
  };
}

describe('COUNT contract', () => {
  const parser = new FormulaParser();

  function evaluate(
    formula: string,
    data: Record<string, FormulaValue> = {},
    shape: [number, number] = [10, 10],
    visited?: Array<[number, number]>,
    cache = new AggregationCache(),
  ): FormulaValue {
    const evaluator = new FormulaEvaluator(new FunctionRegistry(), cache);
    return evaluator.evaluate(parser.parse(formula), createContext(data, shape, visited));
  }

  it.each([
    ['numeric literals', '=COUNT(1,2,3)', {}, [1, 2, 3], 3],
    ['mixed literals', '=COUNT(1,"2",TRUE,"hello")', {}, [], 3],
    ['mixed range', '=COUNT(A1:A5)', { '0,0': 1, '1,0': '2', '2,0': true, '3,0': 'hello', '4,0': 3 }, [], 2],
    ['mixed references and arguments', '=COUNT(A1:A2,5,B1)', { '0,0': 2, '1,0': 'text', '0,1': 4 }, [], 3],
  ])('handles %s', (_name, formula, data, _unused, expected) => {
    expect(evaluate(formula, data as Record<string, FormulaValue>)).toBe(expected);
  });

  it('does not count blank cells projected as zero', () => {
    expect(evaluate('=COUNT(A1:A3)', {})).toBe(0);
  });

  it('ignores errors in references', () => {
    expect(
      evaluate('=COUNT(A1:A3)', {
        '0,0': 1,
        '1,0': createFormulaError(FormulaErrorCode.DivisionByZero),
        '2,0': 3,
      }),
    ).toBe(2);
  });

  it('counts direct logical arguments but ignores referenced logical values', () => {
    expect(evaluate('=COUNT(TRUE,FALSE)')).toBe(2);
    expect(evaluate('=COUNT(A1:B1)', { '0,0': true, '0,1': false }, [1, 2])).toBe(0);
    expect(evaluate('=COUNT(A1,TRUE)', { '0,0': true }, [1, 1])).toBe(1);
  });

  it('propagates a direct error argument', () => {
    expect(evaluate('=COUNT(1/0)')).toEqual({ kind: 'error', code: '#DIV/0!' });
  });

  it('supports whole-column and whole-row references', () => {
    expect(evaluate('=COUNT(A:A)', { '0,0': 2, '1,0': 'text' }, [2, 1])).toBe(1);
    expect(evaluate('=COUNT(1:1)', { '0,0': 2, '0,1': false }, [1, 2])).toBe(1);
  });

  it('uses and updates the cached range count', () => {
    const cache = new AggregationCache();
    const visited: Array<[number, number]> = [];
    const data: Record<string, FormulaValue> = { '0,0': 10, '1,0': 'text', '2,0': 30 };
    expect(evaluate('=COUNT(A1:A3)', data, [3, 1], visited, cache)).toBe(2);
    expect(evaluate('=COUNT(A1:A3)', data, [3, 1], visited, cache)).toBe(2);
    expect(visited).toHaveLength(3);
    data['1,0'] = 20;
    cache.onCellChanged(1, 0, 'text', 20);
    expect(evaluate('=COUNT(A1:A3)', data, [3, 1], undefined, cache)).toBe(3);
  });
});

describe('COUNT function directly', () => {
  it('updates its result incrementally', () => {
    expect((COUNT.incrementalUpdate as any)(2, [{ oldVal: 'text', newVal: 5 }])).toBe(3);
    expect((COUNT.incrementalUpdate as any)(2, [{ oldVal: 5, newVal: false }])).toBe(1);
  });
});
