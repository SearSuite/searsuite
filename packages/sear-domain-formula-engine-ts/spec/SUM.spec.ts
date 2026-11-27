import { AggregationCache } from '../src/AggregationCache';
import { FormulaEvaluator } from '../src/FormulaEvaluator';
import { FormulaParser } from '../src/FormulaParser';
import { FunctionRegistry } from '../src/functions';
import { SUM } from '../src/functions/math/aggregation/sum';
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
    isCellInBounds(row: number, col: number): boolean {
      return row >= 0 && row < shape[0] && col >= 0 && col < shape[1];
    },
    getSheetShape(): [number, number] {
      return shape;
    },
    getCellValue(row: number, col: number): FormulaValue {
      return data[`${row},${col}`] ?? 0;
    },
    *iterateRange(startRow: number, startCol: number, endRow: number, endCol: number): Iterable<FormulaValue> {
      for (let row = startRow; row <= endRow; row++) {
        for (let col = startCol; col <= endCol; col++) {
          visited?.push([row, col]);
          yield data[`${row},${col}`] ?? 0;
        }
      }
    },
  };
}

describe('SUM contract', () => {
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
    ['literals', '=SUM(1,2,3)', {}, 6],
    ['empty cells', '=SUM(A1:A3)', {}, 0],
    ['referenced numeric text and booleans are ignored', '=SUM(A1:A3)', { '0,0': '2', '1,0': true, '2,0': false }, 0],
    ['ordinary text is ignored', '=SUM(A1:A3)', { '0,0': '2', '1,0': 'hello', '2,0': 3 }, 3],
    ['mixed ranges and arguments', '=SUM(A1:A2,5,B1)', { '0,0': 2, '1,0': 3, '0,1': 4 }, 14],
  ])('handles %s', (_name, formula, data, expected) => {
    expect(evaluate(formula, data)).toBe(expected);
  });

  it('propagates an error and stops consuming a lazy range', () => {
    const visited: Array<[number, number]> = [];
    const result = evaluate(
      '=SUM(A1:A3)',
      { '0,0': 1, '1,0': { kind: 'error', code: '#DIV/0!' }, '2,0': 3 },
      [3, 1],
      visited,
    );

    expect(result).toEqual({ kind: 'error', code: '#DIV/0!' });
    expect(visited).toEqual([
      [0, 0],
      [1, 0],
    ]);
  });

  it('rejects explicitly non-coercible text in a referenced range', () => {
    expect(
      evaluate('=SUM(A1:A2)', {
        '0,0': 1,
        '1,0': { kind: 'text', value: '13800138000', numericCoercion: 'deny' },
      }),
    ).toEqual(createFormulaError(FormulaErrorCode.Value));
  });

  it('uses the cached successful range result on a repeated evaluation', () => {
    const data: Record<string, FormulaValue> = {
      '0,0': 10,
      '1,0': 20,
      '2,0': 30,
    };
    const cache = new AggregationCache();
    const visited: Array<[number, number]> = [];
    const context = createContext(data, [3, 1], visited);
    const evaluator = new FormulaEvaluator(new FunctionRegistry(), cache);
    const ast = parser.parse('=SUM(A1:A3)');

    expect(evaluator.evaluate(ast, context)).toBe(60);
    expect(evaluator.evaluate(ast, context)).toBe(60);
    expect(visited).toHaveLength(3);
  });

  it('recalculates after a cached range cell changes', () => {
    const data: Record<string, FormulaValue> = {
      '0,0': 10,
      '1,0': 20,
      '2,0': 30,
    };
    const cache = new AggregationCache();
    const evaluator = new FormulaEvaluator(new FunctionRegistry(), cache);
    const ast = parser.parse('=SUM(A1:A3)');
    const context = createContext(data, [3, 1]);

    expect(evaluator.evaluate(ast, context)).toBe(60);
    data['1,0'] = 50;
    cache.onCellChanged(1, 0, 20, 50);
    expect(evaluator.evaluate(ast, context)).toBe(90);
  });

  it('supports bounded whole-column and whole-row references', () => {
    expect(evaluate('=SUM(A:A)', { '0,0': 2, '1,0': 3 }, [2, 1])).toBe(5);
    expect(evaluate('=SUM(1:1)', { '0,0': 2, '0,1': 3 }, [1, 2])).toBe(5);
  });
});

describe('SUM function directly', () => {
  it('incrementalUpdate updates the total correctly', () => {
    expect((SUM.incrementalUpdate as any)(10, [{ oldVal: 2, newVal: 5 }])).toBe(13);
  });

  it('incrementalUpdate returns error if previous result was error', () => {
    const err = createFormulaError(FormulaErrorCode.DivisionByZero);
    expect((SUM.incrementalUpdate as any)(err, [{ oldVal: 2, newVal: 5 }])).toBe(err);
  });

  it('incrementalUpdate propagates error if new value is error', () => {
    const err = createFormulaError(FormulaErrorCode.Value);
    expect((SUM.incrementalUpdate as any)(10, [{ oldVal: 2, newVal: err }])).toBe(err);
  });

  it('evaluates array values correctly', () => {
    const context = createContext({}, [1, 1]);
    const result = SUM.evaluate([{ kind: 'value', value: [1, 2, 3] as any }], context as any);
    expect(result).toBe(6);
  });

  it('evaluates array values and propagates error correctly', () => {
    const context = createContext({}, [1, 1]);
    const err = createFormulaError(FormulaErrorCode.DivisionByZero);
    const result = SUM.evaluate([{ kind: 'value', value: [1, err, 3] as any }], context as any);
    expect(result).toBe(err);
  });

  it('propagates error from non-array argument correctly', () => {
    const context = createContext({}, [1, 1]);
    const err = createFormulaError(FormulaErrorCode.DivisionByZero);
    const result = SUM.evaluate([{ kind: 'value', value: err as any }], context as any);
    expect(result).toBe(err);
  });

  it('returns VALUE error for explicitly non-coercible text', () => {
    const context = createContext({}, [1, 1]);
    const result = SUM.evaluate(
      [{ kind: 'value', value: { kind: 'text', value: 'hello', numericCoercion: 'deny' } as any }],
      context as any,
    );
    expect((result as any).code).toBe('#VALUE!');
  });

  it('handles optional methods and errors correctly', () => {
    // Missing aggregationCache and getSheetShape
    const noShapeContext: any = {
      isCellInBounds: () => true,
      getCellValue: (r: number, c: number) => {
        if (r === 0 && c === 0) return createFormulaError(FormulaErrorCode.Value);
        return 1;
      },
      iterateRange: function* (sr: number, sc: number, er: number, ec: number) {
        yield 1;
        yield 2;
      },
    };

    // Line 47 & 59: no aggregationCache
    // test range
    expect(SUM.evaluate([{ kind: 'range', start: [0, 0], end: [1, 1] } as any], noShapeContext)).toBe(3);

    // Line 78-81: ColumnRange with no getSheetShape
    expect((SUM.evaluate([{ kind: 'columnRange', startCol: 0, endCol: 1 } as any], noShapeContext) as any).code).toBe(
      '#REF!',
    );

    // Line 84-87: RowRange with no getSheetShape
    expect((SUM.evaluate([{ kind: 'rowRange', startRow: 0, endRow: 1 } as any], noShapeContext) as any).code).toBe(
      '#REF!',
    );

    // Line 93: NodeKind.Cell returning error
    expect((SUM.evaluate([{ kind: 'cell', row: 0, col: 0 } as any], noShapeContext) as any).code).toBe('#VALUE!');

    // Line 81: ColumnRange returning error from sumRange
    const errorContext: any = {
      isCellInBounds: () => true,
      getSheetShape: () => [2, 2],
      iterateRange: function* (sr: number, sc: number, er: number, ec: number) {
        yield createFormulaError(FormulaErrorCode.Name);
      },
    };
    expect((SUM.evaluate([{ kind: 'columnRange', startCol: 0, endCol: 1 } as any], errorContext) as any).code).toBe(
      FormulaErrorCode.Name,
    );

    // Line 87: RowRange returning error from sumRange
    expect((SUM.evaluate([{ kind: 'rowRange', startRow: 0, endRow: 1 } as any], errorContext) as any).code).toBe(
      FormulaErrorCode.Name,
    );
  });
});
