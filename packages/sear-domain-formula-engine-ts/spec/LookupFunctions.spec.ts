/** @jest-environment node */

import { AggregationCache } from '../src/AggregationCache';
import { FormulaEvaluator } from '../src/FormulaEvaluator';
import { FormulaParser } from '../src/FormulaParser';
import { FunctionRegistry } from '../src/functions';
import { CjkFormulaTextLocale } from '../src/functions/text';
import {
  FormulaErrorCode,
  FormulaImageServiceDefinition,
  FormulaPivotDataServiceDefinition,
  FormulaRtdServiceDefinition,
  FormulaServiceCacheStatus,
  type EvalContext,
  type FormulaValue,
} from '@searsuite/sear-domain-formula-engine';

function createContext(overrides: Partial<EvalContext> = {}): EvalContext {
  return {
    isCellInBounds: (row, col) => row >= 0 && row < 100 && col >= 0 && col < 100,
    getCellValue: (row, col) => row * 10 + col,
    iterateRange: (startRow, startCol, endRow, endCol) => {
      const values: FormulaValue[] = [];
      for (let row = startRow; row <= endRow; row++)
        for (let col = startCol; col <= endCol; col++) values.push(row * 10 + col);
      return values;
    },
    ...overrides,
  };
}

function evaluate(formula: string, context = createContext()): FormulaValue {
  return new FormulaEvaluator(new FunctionRegistry(), new AggregationCache()).evaluate(
    new FormulaParser().parse(formula),
    context,
  );
}

describe('lookup and reference formulas', () => {
  it('propagates ARRAY_CONSTRAIN row and column argument errors', () => {
    const error = { kind: 'error', code: FormulaErrorCode.DivisionByZero };
    expect(evaluate('=ARRAY_CONSTRAIN({1,2},1/0,1)')).toEqual(error);
    expect(evaluate('=ARRAY_CONSTRAIN({1,2},1,1/0)')).toEqual(error);
    expect(evaluate('=ARRAY_CONSTRAIN({1,2},1,1)')).toEqual([[1]]);
    expect(evaluate('=ARRAY_CONSTRAIN({1,2},0,1)')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
  });

  it('uses EXPAND error fill only for padded cells', () => {
    const error = { kind: 'error', code: FormulaErrorCode.NotAvailable };
    expect(evaluate('=EXPAND({1},2,2,NA())')).toEqual([[1, error], [error, error]]);
    expect(evaluate('=INDEX(EXPAND({1},2,2,NA()),1,1)')).toBe(1);
    expect(evaluate('=INDEX(EXPAND({1},2,2,NA()),2,2)')).toEqual(error);
    expect(evaluate('=INDEX(EXPAND({1},2,2,0),1,1)')).toBe(1);
  });


  it('looks up each array query independently and preserves its shape and errors', () => {
    const notAvailable = { kind: 'error' as const, code: FormulaErrorCode.NotAvailable };
    const formulas = [
      '=XLOOKUP({1;3},{1;2;3},{1;NA();2})',
      '=VLOOKUP({1;3},{1,1;2,NA();3,2},2,FALSE)',
    ];
    for (const formula of formulas) expect(evaluate(formula)).toEqual([[1], [2]]);
    for (const formula of [
      '=XMATCH({1;3},{1;2;3},0)',
      '=MATCH({1;3},{1;2;3},0)',
    ]) expect(evaluate(formula)).toEqual([[1], [3]]);
    expect(evaluate('=XMATCH({1,9},{1;2;3},0)')).toEqual([[1, notAvailable]]);
    expect(evaluate('=XLOOKUP({1;NA();3},{1;2;3},{1;5;2})')).toEqual([[1], [notAvailable], [2]]);
  });

  it('keeps distinct numeric-looking text keys in exact lookups', () => {
    for (const [formula, expected] of [
      ['=MATCH("01",{"1";"01"},0)', 2],
      ['=XMATCH("01",{"1";"01"},0)', 2],
      ['=XLOOKUP("01",{"1";"01"},{10;20},"missing",0)', 20],
      ['=VLOOKUP("01",{"1",10;"01",20},2,FALSE)', 20],
      ['=HLOOKUP("01",{"1","01";10,20},2,FALSE)', 20],
      ['=MATCH("01",{"1";"001"},0)', { kind: 'error', code: FormulaErrorCode.NotAvailable }],
      ['=XMATCH("ABC",{"abc";"def"},0)', 1],
    ] as const) expect(evaluate(formula)).toEqual(expected);
  });

  it('preserves union reference areas in SUM, INDEX, and ISREF', () => {
    const context = createContext({
      isCellInBounds: (row, col) => row >= 0 && row < 200 && col >= 0 && col < 20,
      getCellValue: (row, col) => col === 3 && row === 161 ? 64 : col === 3 && row === 163 ? 4 : 0,
      iterateRange: (startRow, startCol) => [startCol === 3 && startRow === 161 ? 64 : startCol === 3 && startRow === 163 ? 4 : 0],
    });
    expect(evaluate('=AREAS((D162,D164))', context)).toBe(2);
    expect(evaluate('=SUM((D162,D164))', context)).toBe(68);
    expect(evaluate('=INDEX((D162,D164),1,1,2)', context)).toBe(4);
    expect(evaluate('=ISREF((D162,D164))', context)).toBe(true);
    expect(evaluate('=ISREF((1,D164))', context)).toBe(false);
    expect(evaluate('=INDEX((D162,D164),1,1,3)', context)).toEqual({
      kind: 'error', code: FormulaErrorCode.Reference,
    });
  });

  it('applies UNIQUE options and preserves text versus number identity', () => {
    expect(evaluate('=UNIQUE({1;1;2},TRUE)')).toEqual([[1], [1], [2]]);
    expect(evaluate('=UNIQUE({1;1;2},FALSE,TRUE)')).toEqual([[2]]);
    expect(evaluate('=UNIQUE({1;1;2},"a,b")')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(
      evaluate(
        '=UNIQUE(A1:A3)',
        createContext({
          getCellValue: (row) => (row === 0 ? '1' : row === 1 ? 1 : 2),
        }),
      ),
    ).toEqual([['1'], [1], [2]]);
  });

  it('keeps distinct numeric-looking text in UNIQUE without changing case-insensitive matching', () => {
    expect(evaluate('=ROWS(UNIQUE({"01";"1"}))')).toBe(2);
    expect(evaluate('=UNIQUE({"01";"1"})')).toEqual([['01'], ['1']]);
    expect(evaluate('=ROWS(UNIQUE({"A";"a"}))')).toBe(1);
    expect(evaluate('=ROWS(UNIQUE({"1";1}))')).toBe(2);
  });

  it('sorts numeric-looking text lexically in SORT and SORTBY', () => {
    expect(evaluate('=SORT({"2";"10"},1,1)')).toEqual([['10'], ['2']]);
    expect(evaluate('=SORTBY({"a";"b"},{"2";"10"},1)')).toEqual([['b'], ['a']]);
    expect(evaluate('=SORT({2;10},1,1)')).toEqual([[2], [10]]);
  });

  it('returns #CALC! for empty UNIQUE, TAKE, and DROP results', () => {
    const empty = { kind: 'error', code: FormulaErrorCode.Calculation };
    expect(evaluate('=UNIQUE({1;1},FALSE,TRUE)')).toEqual(empty);
    expect(evaluate('=UNIQUE({1,1},TRUE,TRUE)')).toEqual(empty);
    expect(evaluate('=TAKE({1;2},0)')).toEqual(empty);
    expect(evaluate('=TAKE({1,2},1,0)')).toEqual(empty);
    expect(evaluate('=DROP({1;2},2)')).toEqual(empty);
    expect(evaluate('=DROP({1,2},0,2)')).toEqual(empty);
    expect(evaluate('=IFERROR(TAKE({1;2},0),"empty")')).toBe('empty');
    expect(evaluate('=ERROR.TYPE(DROP({1;2},2))')).toBe(14);
    expect(evaluate('=UNIQUE({1;1},FALSE,FALSE)')).toEqual([[1]]);
    expect(evaluate('=TAKE({1;2},1)')).toEqual([[1]]);
    expect(evaluate('=DROP({1;2},1)')).toEqual([[2]]);
    expect(evaluate('=TAKE({1;2},"invalid")')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
  });

  it('keeps independent values around an error in UNIQUE', () => {
    const context = createContext({
      getCellValue: (row) => row === 0 ? 1 : row === 1
        ? { kind: 'error', code: FormulaErrorCode.DivisionByZero }
        : 2,
    });
    expect(evaluate('=UNIQUE(A1:A3)', context)).toEqual([
      [1], [{ kind: 'error', code: FormulaErrorCode.DivisionByZero }], [2],
    ]);
    expect(evaluate('=INDEX(UNIQUE(A1:A3),1,1)', context)).toBe(1);
    expect(evaluate('=INDEX(UNIQUE(A1:A3),2,1)', context)).toEqual({
      kind: 'error', code: FormulaErrorCode.DivisionByZero,
    });
    expect(evaluate('=INDEX(UNIQUE(A1:A3),3,1)', context)).toBe(2);
  });

  it('keeps an INDEX range error in its original array position', () => {
    const unavailable = { kind: 'error' as const, code: FormulaErrorCode.NotAvailable };
    const context = createContext({ getCellValue: (row) => row === 0 ? 1 : row === 1 ? unavailable : 2 });
    expect(evaluate('=INDEX(A1:A3,0,1)', context)).toEqual([[1], [unavailable], [2]]);
    expect(evaluate('=INDEX(A1:A3,1,1)', context)).toBe(1);
  });

  it('rejects scalar aggregation arguments in GROUPBY and PIVOTBY', () => {
    expect(evaluate('=GROUPBY({"A";"B";"A"},{1;2;3},7)')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=GROUPBY({"A";"B";"A"},{1;2;3},"SUM")')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=PIVOTBY({"A";"A"},{"X";"Y"},{1;2},7)')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    const errorCell = createContext({ getCellValue: () => ({ kind: 'error', code: FormulaErrorCode.NotAvailable }) });
    expect(evaluate('=GROUPBY({"A";"B";"A"},{1;2;3},A1)', errorCell)).toEqual({
      kind: 'error',
      code: FormulaErrorCode.Value,
    });
    expect(evaluate('=PIVOTBY({"A";"A"},{"X";"Y"},{1;2},A1)', errorCell)).toEqual({
      kind: 'error',
      code: FormulaErrorCode.Value,
    });
    expect(evaluate('=GROUPBY({"A";"B";"A"},{1;2;3})')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=PIVOTBY({"A"},{"X"},{1})')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=GROUPBY({"A";"B"},{1;2},)')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
  });

  it('applies GROUPBY and PIVOTBY aggregation functions and rejects mismatched input lengths', () => {
    expect(evaluate('=GROUPBY({"A";"A"},{2;4},SUM)')).toEqual([['A', 6]]);
    expect(evaluate('=PIVOTBY({"A";"A"},{"X";"X"},{2;4},SUM)')).toEqual([['', 'X'], ['A', 6]]);
    expect(evaluate('=GROUPBY({"A";"A"},{2;4},LAMBDA(x,AVERAGE(x)))')).toEqual([['A', 3]]);
    expect(evaluate('=PIVOTBY({"A";"A"},{"X";"X"},{2;4},LAMBDA(x,AVERAGE(x)))')).toEqual([['', 'X'], ['A', 3]]);
    expect(evaluate('=ROWS(GROUPBY({"A";"B";"C"},{1;2},SUM))')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=PIVOTBY({"A";"B";"C"},{"X";"Y"},{1;2},SUM)')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
  });

  it('defaults SORTBY direction and validates negative order and key shape', () => {
    expect(evaluate('=SORTBY({2;1},1)')).toEqual([[2], [1]]);
    expect(evaluate('=SORTBY({2;1},{2;1},-1.0001)')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=SORTBY(A1:A3,{2;1},1)')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=SORTBY({2;1},{2;1},1.5)')).toEqual([[1], [2]]);
    expect(evaluate('=SORTBY({2;1},{2;1},1)')).toEqual([[1], [2]]);
    expect(
      evaluate(
        '=SORTBY(A1,{2;1},1)',
        createContext({
          getCellValue: () => ({ kind: 'error', code: FormulaErrorCode.NullIntersection }),
        }),
      ),
    ).toEqual({ kind: 'error', code: FormulaErrorCode.NullIntersection });
    expect(
      evaluate(
        '=SORTBY(A1:A3,{2;1},1)',
        createContext({
          getCellValue: () => ({ kind: 'error', code: FormulaErrorCode.NotAvailable }),
        }),
      ),
    ).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
  });

  it('rejects multi-cell TRIMRANGE references without changing array literals', () => {
    expect(evaluate('=TRIMRANGE()')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=TRIMRANGE({"",1;"",2})')).toEqual([
      ['', 1],
      ['', 2],
    ]);
    expect(evaluate('=TRIMRANGE({"",1;"",2},0)')).toEqual([
      ['', 1],
      ['', 2],
    ]);
    expect(evaluate('=TRIMRANGE({"",1;"",2},1)')).toEqual([
      ['', 1],
      ['', 2],
    ]);
    expect(evaluate('=TRIMRANGE(A1:B2)')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(
      evaluate(
        '=TRIMRANGE(A1)',
        createContext({
          getCellValue: () => 0,
          iterateRangeCells: function* () {
            yield { row: 0, col: 0, value: 0, source: 'empty' as const };
          },
        }),
      ),
    ).toEqual({ kind: 'error', code: FormulaErrorCode.Reference });
  });

  it('rejects multi-cell TRIMRANGE references in every trim mode', () => {
    const context = createContext({
      getCellValue: (row, col) => row === 2 && col === 2 ? 7 : null,
      iterateRangeCells: function* (startRow, startCol, endRow, endCol) {
        for (let row = startRow; row <= endRow; row++) for (let col = startCol; col <= endCol; col++) {
          const value = row === 2 && col === 2 ? 7 : null;
          yield { row, col, value, source: value === null ? 'empty' as const : 'value' as const };
        }
      },
    });
    for (const mode of ['0,0', '1,1', '2,2', '3,3', '0,3', '3,0']) {
      expect(evaluate(`=TRIMRANGE(B2:D4,${mode})`, context)).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    }
    expect(evaluate('=TRIMRANGE(B2:D4,4,0)', context)).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=TRIMRANGE(B2:D4,0,0,0)', context)).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
  });

  it('keeps the WPS multi-cell reference error after source changes', () => {
    const context = createContext({
      getCellValue: (row, col) => row === 35 && col === 1 ? 1 : row === 36 && col === 2 ? 2 : null,
      iterateRangeCells: function* (startRow, startCol, endRow, endCol) {
        for (let row = startRow; row <= endRow; row++) for (let col = startCol; col <= endCol; col++) {
          const value = row === 35 && col === 1 ? 1 : row === 36 && col === 2 ? 2 : null;
          yield { row, col, value, source: value === null ? 'empty' as const : 'value' as const };
        }
      },
    });
    expect(evaluate('=TRIMRANGE(B35:C38)', context)).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=ROWS(TRIMRANGE(B35:C38))', context)).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=COLUMNS(TRIMRANGE(B35:C38))', context)).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    const single = createContext({
      ...context,
      getCellValue: (row, col) => row === 35 && col === 1 ? 1 : null,
      iterateRangeCells: function* (startRow, startCol, endRow, endCol) {
        for (let row = startRow; row <= endRow; row++) for (let col = startCol; col <= endCol; col++) {
          const value = row === 35 && col === 1 ? 1 : null;
          yield { row, col, value, source: value === null ? 'empty' as const : 'value' as const };
        }
      },
    });
    expect(evaluate('=TRIMRANGE(B35:C38)', single)).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=TRIMRANGE(B36)', single)).toEqual([[1]]);
  });

  it('truncates DROP counts and ignores errors in deleted rows', () => {
    expect(evaluate('=DROP({1,2;3,4},-1.005)')).toEqual([[1, 2]]);
    expect(evaluate('=DROP({1,2;3,4},-0.2502)')).toEqual([
      [1, 2],
      [3, 4],
    ]);
    const error = { kind: 'error' as const, code: FormulaErrorCode.Number };
    const context = createContext({ getCellValue: (row, col) => (row === 0 && col === 0 ? error : row * 2 + col) });
    expect(evaluate('=DROP(A1:B2,1)', context)).toEqual([[2, 3]]);
    expect(evaluate('=DROP(A1,1)', context)).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=DROP(5,1)')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=DROP({1,2;3,4},3)')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=DROP({1,2;3,4},-3)')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=DROP({1,2;3,4},2.0002)')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=DROP({1,2;3,4},-2.675)')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=DROP(A1:C1,1)', context)).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=DROP({1,2;3,4},2)')).toEqual({ kind: 'error', code: FormulaErrorCode.Calculation });
  });

  it('wraps vectors with truncated positive counts and requested padding', () => {
    expect(evaluate('=WRAPCOLS({1,2,3},2.8752,0)')).toEqual([
      [1, 3],
      [2, 0],
    ]);
    expect(evaluate('=WRAPROWS({1,2,3},2.8752,0)')).toEqual([
      [1, 2],
      [3, 0],
    ]);
    expect(evaluate('=WRAPCOLS(7,2,0)')).toEqual([[7]]);
    expect(evaluate('=WRAPROWS(7,2,0)')).toEqual([[7]]);
    expect(evaluate('=WRAPCOLS({1,2,3},0)')).toEqual({ kind: 'error', code: FormulaErrorCode.Number });
    expect(evaluate('=WRAPROWS({1,2,3},0)')).toEqual({ kind: 'error', code: FormulaErrorCode.Number });
    expect(evaluate('=ROWS(WRAPCOLS({1,2,3},"2024-02-29",0))')).toBe(3);
    expect(evaluate('=COLUMNS(WRAPROWS({1,2,3},"2024-02-29",0))')).toBe(3);
    expect(evaluate('=WRAPCOLS({1,2;3,4},2,0)')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
  });

  it('rejects an empty referenced vector cell', () => {
    const context = createContext({
      getCellValue: () => 0,
      iterateRangeCells: function* () {
        yield { row: 0, col: 0, value: 0, source: 'empty' as const };
      },
    });
    expect(evaluate('=WRAPCOLS(A1,2,0)', context)).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=WRAPROWS(A1,2,0)', context)).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=WRAPCOLS(IF(TRUE,A1,0),2,0)', context)).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=WRAPROWS(IF(TRUE,A1,0),2,0)', context)).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
  });

  it('filters by a row or column include with matching dimensions', () => {
    expect(evaluate('=FILTER({1;2},TRUE)')).toEqual([[1], [2]]);
    expect(evaluate('=FILTER({1;2},-45000)')).toEqual([[1], [2]]);
    expect(evaluate('=FILTER({1;2},{TRUE;FALSE})')).toEqual([[1]]);
    expect(evaluate('=FILTER({1,2;3,4},{TRUE,FALSE})')).toEqual([[1], [3]]);
    expect(evaluate('=FILTER({1;2},{TRUE,FALSE})')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=FILTER(1/0,{TRUE;FALSE})')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=FILTER({1;2},1/0)')).toEqual({ kind: 'error', code: FormulaErrorCode.DivisionByZero });
    expect(evaluate('=FILTER({1;2},FALSE)')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=FILTER({1;2},"1")')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=FILTER({1;2},{"FALSE";"TRUE"})')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=FILTER({1;2},{1;0})')).toEqual([[1]]);
    expect(evaluate('=FILTER({1;2},{FALSE;FALSE},{7;8})')).toEqual([[7], [8]]);
    expect(evaluate('=FILTER({1;2},{FALSE;FALSE},99)')).toBe(99);
    expect(evaluate('=FILTER({1;2},{TRUE;FALSE},{7;8})')).toEqual([[1]]);
  });

  it('BUG-987 checks FILTER include dimensions before cell errors', () => {
    const error = { kind: 'error' as const, code: FormulaErrorCode.NotAvailable };
    const context = createContext({
      getCellValue: (row) => row === 0 ? error : 1,
      iterateRange: (startRow, _startCol, endRow) =>
        Array.from({ length: endRow - startRow + 1 }, (_, index) => startRow + index === 0 ? error : 1),
    });
    expect(evaluate('=FILTER({1;2},A1:A8)', context))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=FILTER({1;2},A1:A2)', context)).toEqual(error);
  });

  it('uses a fallback for a filtered single cell and ignores errors in excluded rows', () => {
    expect(evaluate('=FILTER({1},FALSE,"none")')).toBe('none');
    expect(evaluate('=FILTER({1;2},{FALSE;FALSE},"none")')).toBe('none');
    const error = { kind: 'error' as const, code: FormulaErrorCode.DivisionByZero };
    const context = createContext({ getCellValue: (row) => row === 0 ? 1 : error });
    expect(evaluate('=FILTER(A1:A2,{TRUE;FALSE})', context)).toEqual([[1]]);
    expect(evaluate('=FILTER(A1:A2,{FALSE;FALSE},"none")', context)).toBe('none');
    expect(evaluate('=FILTER(A1:A2,{TRUE;TRUE})', context)).toEqual(error);
  });

  it('truncates CHOOSECOLS and CHOOSEROWS indices before selecting', () => {
    expect(evaluate('=CHOOSECOLS({1,2;3,4},-2.675)')).toEqual([[1], [3]]);
    expect(evaluate('=CHOOSEROWS({1,2;3,4},-2.675)')).toEqual([[1, 2]]);
    expect(evaluate('=CHOOSECOLS({1,2},0.5)')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
  });

  it('expands CHOOSECOLS and CHOOSEROWS index arrays in order', () => {
    expect(evaluate('=CHOOSECOLS({1,2;3,4},{2,1})')).toEqual([[2, 1], [4, 3]]);
    expect(evaluate('=CHOOSEROWS({1,2;3,4},{2,1})')).toEqual([[3, 4], [1, 2]]);
    expect(evaluate('=SUM(CHOOSECOLS({1,2;3,4},{2,1}))')).toBe(10);
    expect(evaluate('=SUM(CHOOSEROWS({1,2;3,4},{2,1}))')).toBe(10);
    expect(evaluate('=CHOOSECOLS({1,2;3,4},{-1;1},2)')).toEqual([[2, 1, 2], [4, 3, 4]]);
    expect(evaluate('=CHOOSEROWS({1,2;3,4},{-1;1},2)')).toEqual([[3, 4], [1, 2], [3, 4]]);
    expect(evaluate('=CHOOSECOLS({1,2},{1,3})')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
  });

  it('projects stored empty text as blank in array results', () => {
    const context = createContext({
      getCellValue: (row) => (row === 0 ? { kind: 'text', value: '', numericCoercion: 'deny' } : row),
    });
    expect(evaluate('=CHOOSECOLS(A1:A3,1)', context)).toEqual([[null], [1], [2]]);
    expect(evaluate('=TOCOL(A1:A3)', context)).toEqual([[null], [1], [2]]);
    expect(evaluate('=WRAPROWS(A1:A3,2,0)', context)).toEqual([
      [null, 1],
      [2, 0],
    ]);
    expect(evaluate('=UNIQUE(A1:A3)', context)).toEqual([[''], [1], [2]]);
  });

  it('preserves empty text elements in INDEX and SORT array literals', () => {
    expect(evaluate('={1;"";2}')).toEqual([[1], [''], [2]]);
    expect(evaluate('=INDEX({1;"";2},2,1)')).toBe('');
    expect(evaluate('=SORT({1;"";2},1,1)')).toEqual([[1], [2], ['']]);
    expect(evaluate('=INDEX({1;2},3,1)')).toEqual({ kind: 'error', code: FormulaErrorCode.Reference });
  });

  it('validates CHOOSEROWS indices before reading selected cell errors', () => {
    const error = { kind: 'error' as const, code: FormulaErrorCode.Number };
    const context = createContext({ getCellValue: (row, col) => (row === 0 && col === 0 ? error : row * 2 + col) });
    expect(evaluate('=CHOOSEROWS(A1,2)', context)).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=CHOOSEROWS(A1:B2,2)', context)).toEqual([[2, 3]]);
  });

  it('validates XLOOKUP array dimensions before propagating cell errors', () => {
    const error = { kind: 'error' as const, code: FormulaErrorCode.DivisionByZero };
    const context = createContext({ getCellValue: () => error });
    expect(evaluate('=XLOOKUP(2,A1,{10,20})', context)).toEqual({ kind: 'error', code: FormulaErrorCode.NotAvailable });
    expect(evaluate('=XLOOKUP(2,{1,2},A1)', context)).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
  });

  it('clamps TAKE counts after truncation and rejects explicit zero', () => {
    expect(evaluate('=TAKE({1;2},-45000)')).toEqual([[1], [2]]);
    expect(evaluate('=TAKE({1;2},-1.005)')).toEqual([[2]]);
    expect(evaluate('=TAKE({1;2},2.8752)')).toEqual([[1], [2]]);
    expect(evaluate('=TAKE({1;2},1,0)')).toEqual({ kind: 'error', code: FormulaErrorCode.Calculation });
    expect(evaluate('=TAKE({1;2},0)')).toEqual({ kind: 'error', code: FormulaErrorCode.Calculation });
  });

  it('BUG-1031 distinguishes explicit zero from counts that coerce or truncate to zero', () => {
    const valueError = { kind: 'error', code: FormulaErrorCode.Value };
    const emptyError = { kind: 'error', code: FormulaErrorCode.Calculation };
    expect(evaluate('=TAKE({1;2},0)')).toEqual(emptyError);
    expect(evaluate('=TAKE({1;2},1,0)')).toEqual(emptyError);
    for (const formula of [
      '=TAKE({1;2},FALSE)',
      '=TAKE({1;2},0.5)',
      '=TAKE({1;2},-0.5)',
      '=TAKE({1;2},1,0.5)',
      '=TAKE({1;2},IF(TRUE,A1,0))',
    ]) expect(evaluate(formula)).toEqual(valueError);
    expect(evaluate('=TAKE({1;2},1)')).toEqual([[1]]);
  });

  it('validates SORTBY key shape and sort direction', () => {
    expect(evaluate('=SORTBY({2;1},{2;1},1.005)')).toEqual([[1], [2]]);
    expect(evaluate('=SORTBY({2;1},{2;1},"1.5")')).toEqual([[1], [2]]);
    expect(evaluate('=SORTBY({2;1},{2;1},-0.5)')).toEqual([[2], [1]]);
    expect(evaluate('=SORTBY({2;1},{2;1},-1.005)')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=SORTBY({2;1},FALSE,1)')).toEqual([[2], [1]]);
    expect(evaluate('=SORTBY({2;1},{2;1;3},1)')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=SORTBY(1,{2;1},1)')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
  });

  it('keeps INDEX row shape and broadcasts one-key SORTBY without reordering', () => {
    expect(evaluate('=ROWS(INDEX({1,10;2,20},2,0))')).toBe(1);
    expect(evaluate('=COLUMNS(INDEX({1,10;2,20},2,0))')).toBe(2);
    expect(evaluate('=INDEX({1,10;2,20},2,0)')).toEqual([[2, 20]]);
    expect(evaluate('=INDEX(SORTBY({2;1},{1},1),1,1)')).toBe(2);
    expect(evaluate('=INDEX(SORTBY({2;1},{2;1},1),1,1)')).toBe(1);
  });

  it('sorts columns with a single-row SORTBY key', () => {
    expect(evaluate('=SORTBY({3,1},{3,1})')).toEqual([[1, 3]]);
    expect(evaluate('=SORTBY({3,1;4,2},{3,1})')).toEqual([[1, 3], [2, 4]]);
    expect(evaluate('=SORTBY({3,1;4,2},{3,1},-1)')).toEqual([[3, 1], [4, 2]]);
  });

  it('validates XLOOKUP dimensions and preserves exact value types', () => {
    expect(evaluate('=XLOOKUP(2,{1,2},-60)')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=XLOOKUP(TRUE,{1,2},{10,20})')).toEqual({ kind: 'error', code: FormulaErrorCode.NotAvailable });
    expect(evaluate('=XLOOKUP(2,{1,2},{10,20;30,40})')).toEqual([[20], [40]]);
    expect(evaluate('=XLOOKUP(2,{1;2},{10,11;20,21})')).toEqual([[20, 21]]);
  });

  it('searches XLOOKUP in the selected direction with wildcard and nearest-value modes', () => {
    expect(evaluate('=XLOOKUP(2,{1;2;2},{10;20;30},"",0,-1)')).toBe(30);
    expect(evaluate('=XLOOKUP("a*",{"abc";"def"},{10;20},"",2)')).toBe(10);
    expect(evaluate('=XLOOKUP("d*",{"abc";"def"},{10;20},"",2)')).toBe(20);
    expect(evaluate('=XLOOKUP(5,{2;4;1},{20;40;10},"",-1)')).toBe(40);
    expect(evaluate('=XLOOKUP(5,{8;6;7},{80;60;70},"",1)')).toBe(60);
    expect(evaluate('=XLOOKUP(2,{1;2},{10;20},"missing",0,99)')).toEqual({
      kind: 'error', code: FormulaErrorCode.Value,
    });
    expect(evaluate('=XLOOKUP(2,{1;2},{10;20},"missing",0,1)')).toBe(20);
  });

  it('validates XMATCH modes and lookup vector shape', () => {
    expect(evaluate('=XMATCH(2,{FALSE,2;1,3},0)')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=XMATCH(2,{1,2},-60)')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=XMATCH(2,{1,2},0,0)')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=XMATCH(2,{1,2},0,-1.2503)')).toEqual({ kind: 'error', code: FormulaErrorCode.NotAvailable });
    expect(evaluate('=XMATCH(2,{1,2},0,A1)', createContext({ getCellValue: () => -0.5004 }))).toBe(2);
    expect(evaluate('=XMATCH(2,{1,2},"1.5")')).toBe(2);
    expect(evaluate('=XMATCH(2,{1,2},-1.0001)')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=XMATCH(2,1/0,0)')).toEqual({ kind: 'error', code: FormulaErrorCode.NotAvailable });
  });

  it('BUG-1032 rounds XMATCH modes down before searching', () => {
    for (const mode of ['1e-12', '0.5', '1.005', '1.6256', '2.675']) {
      expect(evaluate(`=XMATCH(2,{1,2},${mode})`)).toBe(2);
    }
    expect(evaluate('=XMATCH(2,{1,2},0,-0.5004)')).toBe(2);
    expect(evaluate('=XMATCH(2,{1,2},0,2.625)')).toBe(2);
    expect(evaluate('=XMATCH(2,{1,2},0,-1.2503)')).toEqual({ kind: 'error', code: FormulaErrorCode.NotAvailable });
    expect(evaluate('=XMATCH(2,{1,2},0,0.5)')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=XMATCH(2,{1,2},-1.0001)')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
  });

  it('BUG-1033 rejects two-dimensional references and arrays in WPS', () => {
    const context = createContext({
      getCellValue: (row, col) => [
        [false, 2],
        [1, 3],
      ][row]?.[col] ?? null,
    });
    expect(evaluate('=XMATCH(2,A1:B2,0)', context)).toEqual({
      kind: 'error', code: FormulaErrorCode.Value,
    });
    expect(evaluate('=XMATCH(3,A1:B2,0)', context)).toEqual({
      kind: 'error', code: FormulaErrorCode.Value,
    });
    expect(evaluate('=XMATCH(2,{FALSE,2;1,3},0)', context)).toEqual({
      kind: 'error', code: FormulaErrorCode.Value,
    });
  });

  it('searches XMATCH by direction, wildcard, and nearest value', () => {
    expect(evaluate('=XMATCH(2,{1;2;2},0,-1)')).toBe(3);
    expect(evaluate('=XMATCH(2,{1;2;2},0,1)')).toBe(2);
    expect(evaluate('=XMATCH("a*",{"abc";"def"},2)')).toBe(1);
    expect(evaluate('=XMATCH("d*",{"abc";"def"},2)')).toBe(2);
    expect(evaluate('=XMATCH(3,{1;2;4},-1)')).toBe(2);
    expect(evaluate('=XMATCH(3,{1;2;4},1)')).toBe(3);
    expect(evaluate('=XMATCH(5,{2;4;1},-1)')).toBe(2);
    expect(evaluate('=XMATCH(5,{8;6;7},1)')).toBe(2);
  });

  it('finds the nearest descending MATCH value and exact text wildcards', () => {
    expect(evaluate('=MATCH(3,{5;4;2;1},-1)')).toBe(2);
    expect(evaluate('=MATCH(1.5,{5;4;2;1},-1)')).toBe(3);
    expect(evaluate('=MATCH("a*",{"abc";"def"},0)')).toBe(1);
    expect(evaluate('=MATCH("d*",{"abc";"def"},0)')).toBe(2);
  });

  it('matches text wildcards in exact VLOOKUP and HLOOKUP', () => {
    expect(evaluate('=VLOOKUP("a*",{"abc",10;"def",20},2,FALSE)')).toBe(10);
    expect(evaluate('=HLOOKUP("a*",{"abc","def";10,20},2,FALSE)')).toBe(10);
    expect(evaluate('=VLOOKUP("d*",{"abc",10;"def",20},2,FALSE)')).toBe(20);
    expect(evaluate('=HLOOKUP("d*",{"abc","def";10,20},2,FALSE)')).toBe(20);
  });

  it('truncates a fractional VLOOKUP return-column index', () => {
    expect(evaluate('=VLOOKUP(1,{1,10;2,20},1.9,FALSE)')).toBe(1);
    expect(evaluate('=VLOOKUP(1,{1,10;2,20},2.9,FALSE)')).toBe(10);
    expect(evaluate('=VLOOKUP(1,{1,10;2,20},0.9,FALSE)')).toEqual({
      kind: 'error', code: FormulaErrorCode.Value,
    });
  });

  it('reports a missing pivot service as a reference error', () => {
    expect(evaluate('=GETPIVOTDATA("Sales","A1")')).toEqual({ kind: 'error', code: FormulaErrorCode.Reference });
  });

  it('uses the hyperlink label for scalar targets and propagates target errors', () => {
    expect(evaluate('=HYPERLINK(-1,"Open")')).toBe('Open');
    expect(evaluate('=HYPERLINK(TRUE,"Open")')).toBe('Open');
    expect(evaluate('=HYPERLINK("https://example.com",FALSE)')).toBe(false);
    expect(evaluate('=HYPERLINK("https://example.com",-61)')).toBe(-61);
    expect(evaluate('=HYPERLINK(1/0,"Open")')).toEqual({ kind: 'error', code: FormulaErrorCode.DivisionByZero });
  });

  it('truncates EXPAND dimensions and rejects out-of-bounds columns', () => {
    expect(evaluate('=EXPAND({1},2,"1.5",0)')).toEqual([[1], [0]]);
    expect(evaluate('=EXPAND({1},2,45000,0)')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
  });

  it('uses the text locale for approximate HLOOKUP ordering', () => {
    const cells: FormulaValue[][] = [
      ['车轴', '轴承', '螺钉'],
      [4, 4, 9],
      [5, 7, 10],
      [6, 8, 11],
    ];
    const context = createContext({
      textLocale: CjkFormulaTextLocale,
      getCellValue: (row, col) => cells[row]?.[col] ?? 0,
    });
    expect(evaluate('=HLOOKUP("螺栓",A1:C4,4)', context)).toBe(6);
    expect(evaluate('=HLOOKUP("B",A1:C4,3,TRUE)', context)).toEqual({
      kind: 'error',
      code: FormulaErrorCode.NotAvailable,
    });
    expect(evaluate('=HLOOKUP("e",{"é","e";1,2},2,FALSE)', context)).toBe(2);
  });

  it('rejects multidimensional LOOKUP results and scalar MATCH lookup arrays', () => {
    expect(evaluate('=LOOKUP(2,{1,2,3},A1:B2)')).toEqual({ kind: 'error', code: FormulaErrorCode.NotAvailable });
    expect(evaluate('=MATCH({1,2,3},0)')).toEqual({ kind: 'error', code: FormulaErrorCode.NotAvailable });
    expect(evaluate('=HLOOKUP({1,2;10,20},2,FALSE)')).toEqual({ kind: 'error', code: FormulaErrorCode.NotAvailable });
  });

  it('propagates errors from array function options', () => {
    const error = { kind: 'error' as const, code: FormulaErrorCode.Name };
    const context = createContext({ getCellValue: () => error });
    for (const formula of [
      '=EXPAND({1},2,A1,0)',
      '=SORTBY({2;1},{2;1},A1)',
      '=CHOOSECOLS({1,2;3,4},1,A1)',
      '=CHOOSEROWS({1,2;3,4},2,A1)',
      '=DROP({1,2;3,4},1,A1)',
      '=TAKE({1,2;3,4},1,A1)',
      '=TOCOL({1,2;3,4},A1)',
      '=TOROW({1,2;3,4},A1)',
      '=UNIQUE({1;1;2},A1)',
      '=TRIMRANGE({1;2},A1)',
    ])
      expect(evaluate(formula, context)).toEqual(error);
  });

  it('validates TOCOL and TOROW ignore modes after numeric truncation', () => {
    for (const name of ['TOCOL', 'TOROW']) {
      expect(evaluate(`=${name}({1,2;3,4},-1.2503)`)).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
      expect(evaluate(`=${name}({1,2;3,4},4.1255)`)).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
      const expected = name === 'TOCOL' ? [[1], [2], [3], [4]] : [[1, 2, 3, 4]];
      expect(evaluate(`=${name}({1,2;3,4},3.3756)`)).toEqual(expected);
    }
  });

  it('scans TOCOL and TOROW by column and ignores source errors when requested', () => {
    const error = { kind: 'error' as const, code: FormulaErrorCode.DivisionByZero };
    const context = createContext({
      getCellValue: (row, col) => row === 0 && col === 1 ? error : row * 2 + col + 1,
    });
    expect(evaluate('=TOCOL({1,2;3,4},0,TRUE)')).toEqual([[1], [3], [2], [4]]);
    expect(evaluate('=TOROW({1,2;3,4},0,TRUE)')).toEqual([[1, 3, 2, 4]]);
    expect(evaluate('=TOROW({1,2;3,4},0,FALSE)')).toEqual([[1, 2, 3, 4]]);
    expect(evaluate('=TOCOL(A1:B2,2)', context)).toEqual([[1], [3], [4]]);
    expect(evaluate('=TOROW(A1:B2,2)', context)).toEqual([[1, 3, 4]]);
    expect(evaluate('=TOCOL(A1:B2,2,TRUE)', context)).toEqual([[1], [3], [4]]);
    expect(evaluate('=TOROW({1,2},0,"invalid")')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=TOCOL({1,2},0,TRUE,TRUE)')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
  });

  it('keeps errors in selected array positions while skipping unselected cells', () => {
    const error = { kind: 'error' as const, code: FormulaErrorCode.DivisionByZero };
    const notAvailable = { kind: 'error' as const, code: FormulaErrorCode.NotAvailable };
    const context = createContext({
      getCellValue: (row, col) => row === 0 && col === 1 ? error : row * 2 + col + 1,
    });
    expect(evaluate('=TAKE(A1:B2,2,1)', context)).toEqual([[1], [3]]);
    expect(evaluate('=CHOOSECOLS(A1:B2,1)', context)).toEqual([[1], [3]]);
    expect(evaluate('=HSTACK(A1:B2,{4;5})', context)).toEqual([[1, error, 4], [3, 4, 5]]);
    expect(evaluate('=VSTACK(A1:B2,{4,5})', context)).toEqual([[1, error], [3, 4], [4, 5]]);
    expect(evaluate('=HSTACK({1;2},{3})')).toEqual([[1, 3], [2, notAvailable]]);
    expect(evaluate('=VSTACK({1,2},{3})')).toEqual([[1, 2], [3, notAvailable]]);
    expect(evaluate('=ISNA(INDEX(HSTACK({1;2},{3}),2,2))')).toBe(true);
    expect(evaluate('=ISNA(INDEX(VSTACK({1,2},{3}),2,2))')).toBe(true);
    expect(evaluate('=HSTACK("",{3;4})')).toEqual([[null, 3], [notAvailable, 4]]);
    expect(evaluate('=VSTACK("",{3,4})')).toEqual([[null, notAvailable], [3, 4]]);
    const emptyText = createContext({ getCellValue: () => '' });
    expect(evaluate('=HSTACK(IF(TRUE,A1,0),{3;4})', emptyText)).toEqual([[null, 3], [notAvailable, 4]]);
    expect(evaluate('=VSTACK(IF(TRUE,A1,0),{3,4})', emptyText)).toEqual([[null, notAvailable], [3, 4]]);
  });

  it('pads wrapping and expansion with real NA errors', () => {
    const notAvailable = { kind: 'error' as const, code: FormulaErrorCode.NotAvailable };
    expect(evaluate('=WRAPROWS({1,2,3},5)')).toEqual([[1, 2, 3]]);
    expect(evaluate('=WRAPCOLS({1;2;3},5)')).toEqual([[1], [2], [3]]);
    expect(evaluate('=ISNA(INDEX(WRAPROWS({1,2,3},5),1,5))')).toBe(false);
    expect(evaluate('=EXPAND({1},1,2)')).toEqual([[1, notAvailable]]);
    expect(evaluate('=ISNA(INDEX(EXPAND({1},1,2),1,2))')).toBe(true);
    expect(evaluate('=EXPAND({1},1,2,7)')).toEqual([[1, 7]]);
    expect(evaluate('=WRAPROWS({1},1000001)')).toEqual({ kind: 'error', code: FormulaErrorCode.Number });
  });

  it('BUG-1040 treats empty text as a blank source element in EXPAND', () => {
    expect(evaluate('=EXPAND("",2,2,0)')).toEqual([[null, 0], [0, 0]]);
    expect(evaluate('=EXPAND(IF(TRUE,A1,0),2,2,0)', createContext({ getCellValue: () => '' })))
      .toEqual([[null, 0], [0, 0]]);
    expect(evaluate('=EXPAND("x",2,2,0)')).toEqual([['x', 0], [0, 0]]);
  });

  it('truncates SORT column indices and keeps number rows before boolean rows', () => {
    expect(evaluate('=SORT({2;1},1.8751)')).toEqual([[1], [2]]);
    expect(evaluate('=SORT({2;1},0)')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=SORT({2;1},45000)')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=SORT({3,1;4,2},1,1,TRUE)')).toEqual([[1, 3], [2, 4]]);
    expect(evaluate('=SORT({3,1;4,2},2,-1,TRUE)')).toEqual([[3, 1], [4, 2]]);
    const cells: Record<string, number | boolean> = { '0,0': false, '0,1': 2, '1,0': 1, '1,1': 3 };
    expect(
      evaluate(
        '=SORT(A1:B2)',
        createContext({
          getCellValue: (row, col) => cells[`${row},${col}`],
        }),
      ),
    ).toEqual([
      [1, 3],
      [false, 2],
    ]);
  });

  it('keeps source errors in their sorted rows', () => {
    const cellError = { kind: 'error' as const, code: FormulaErrorCode.Number };
    const cells = new Map<string, FormulaValue>([
      ['0,0', cellError], ['0,1', 2], ['1,0', 1], ['1,1', 3],
    ]);
    expect(evaluate('=SORT(A1:B2)', createContext({
      getCellValue: (row, col) => cells.get(`${row},${col}`) ?? null,
    }))).toEqual([[1, 3], [cellError, 2]]);
  });

  it('distinguishes text and boolean LOOKUP vectors from numeric scalars', () => {
    expect(evaluate('=LOOKUP(2,FALSE,{10,20,30})')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=LOOKUP(2,{1,2,3},"1.5")')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=LOOKUP(2,{1,2,3},1)')).toEqual({ kind: 'error', code: FormulaErrorCode.NotAvailable });
  });

  it('BUG-999 uses the first result for a one-cell LOOKUP vector', () => {
    expect(evaluate('=LOOKUP(2,0.5,{10,20,30})')).toBe(10);
    expect(evaluate('=LOOKUP(2,A1,{10,20,30})', createContext({
      getCellValue: (row, col) => row === 0 && col === 0 ? 0.5 : null,
    }))).toBe(10);
    expect(evaluate('=LOOKUP(0,0.5,{10,20,30})'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.NotAvailable });
    expect(evaluate('=LOOKUP(3,{1,2,3},{10,20})'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.NotAvailable });
  });

  it('LOOKUP reads unequal result vectors at the matched position', () => {
    const context = createContext({
      getCellValue: (row, col) => col === 0 ? [0.1251, 1, 2, 3, 0, 5, 6, 7][row] ?? null : null,
    });
    expect(evaluate('=LOOKUP(2,A1:A8,{10,20,30})', context)).toBe(30);
    expect(evaluate('=LOOKUP(2,{1,2,3},A1:A8)', context)).toBe(1);
    expect(evaluate('=LOOKUP(2,{1,2},{10,20,30})')).toBe(20);
    expect(evaluate('=LOOKUP(3,{1,2,3},{10,20})')).toEqual({
      kind: 'error', code: FormulaErrorCode.NotAvailable,
    });
  });

  it('LOOKUP returns zero for an unselected single-cell result reference', () => {
    for (const value of [-60, 'text', { kind: 'error' as const, code: FormulaErrorCode.Reference }]) {
      const context = createContext({ getCellValue: () => value });
      expect(evaluate('=LOOKUP(2,{1,2,3},A1)', context)).toBe(0);
      expect(evaluate('=LOOKUP(2,{1,2,3},IF(TRUE,A1,0))', context)).toBe(0);
      expect(evaluate('=LOOKUP(1,{1,2,3},A1)', context)).toEqual(value);
    }
    expect(evaluate('=LOOKUP(2,{1,2,3},1)')).toEqual({
      kind: 'error', code: FormulaErrorCode.NotAvailable,
    });
  });

  it.each([
    ['=ADDRESS(2,3)', '$C$2'],
    ['=AREAS((A1:B2,C3,D4:E5))', 3],
    ['=AREAS(B2:D4 B2)', 1],
    ['=CHOOSE(2,"A","B")', 'B'],
    ['=COLUMN(C1)', 3],
    ['=COLUMN(XFD1)', 16384],
    ['=COLUMNS(A1:C2)', 3],
    ['=COLUMNS({1,2,3;4,5,6})', 3],
    ['=ROW(A2)', 2],
    ['=ROW(A1048576)', 1048576],
    ['=ROWS(A1:A2)', 2],
    ['=ROWS({1,2,3;4,5,6})', 2],
    ['=HLOOKUP(2,{1,2;10,20},2,FALSE)', 20],
    ['=INDEX({1,2;3,4},2,1)', 3],
    ['=LOOKUP(2,{1,2,3},{10,20,30})', 20],
    ['=LOOKUP(2,{1,2,3},{0,0,0})', 0],
    ['=LOOKUP(4.19,{"Frequency",4.14,4.19,5.17},{"Color","Red","Orange","Yellow"})', 'Orange'],
    ['=MATCH(2,{1,2,3},0)', 2],
    ['=XLOOKUP(2,{1,2},{10,20})', 20],
    ['=XMATCH(2,{1,2},0)', 2],
  ])('%s returns the common result', (formula, expected) => expect(evaluate(formula)).toEqual(expected));

  it('spills row and column indices across multi-cell references', () => {
    expect(evaluate('=ROW(A1:A3)')).toEqual([[1], [2], [3]]);
    expect(evaluate('=COLUMN(A1:C1)')).toEqual([[1, 2, 3]]);
    expect(evaluate('=ROW(B5:D6)')).toEqual([[5], [6]]);
    expect(evaluate('=COLUMN(B5:D6)')).toEqual([[2, 3, 4]]);
    expect(evaluate('=ROW(A1)')).toBe(1);
    expect(evaluate('=COLUMN(A1)')).toBe(1);
  });

  it('resolves overlapping and disjoint reference intersections', () => {
    expect(evaluate('=SUM(A1:B2 B2:C3)')).toBe(11);
    expect(evaluate('=AREAS(A1:B2 D4)')).toEqual({ kind: 'error', code: FormulaErrorCode.NullIntersection });
  });

  it('preserves selected IF references for reference-reading functions', () => {
    const context = createContext({
      getCellValue: () => ({ kind: 'error', code: '#DIV/0!' }),
      formulaSource: { getFormulaSource: () => '=1/0' },
    });
    expect(evaluate('=ROW(IF(TRUE,A1,0))', context)).toBe(1);
    expect(evaluate('=COLUMN(IF(TRUE,A1,0))', context)).toBe(1);
    expect(evaluate('=ROWS(IF(TRUE,A1,0))', context)).toBe(1);
    expect(evaluate('=COLUMNS(IF(TRUE,A1,0))', context)).toBe(1);
    expect(evaluate('=AREAS(IF(TRUE,A1,0))', context)).toBe(1);
    expect(evaluate('=FORMULATEXT(IF(TRUE,A1,0))', context)).toBe('=1/0');
  });

  it('reads the top-left formula of a multi-cell FORMULATEXT reference', () => {
    const context = createContext({
      formulaSource: { getFormulaSource: (row, col) => row === 1 && col === 1 ? '=NA()' : undefined },
    });
    expect(evaluate('=FORMULATEXT(B2)', context)).toBe('=NA()');
    expect(evaluate('=FORMULATEXT(B2:C3)', context)).toBe('=NA()');
    expect(evaluate('=FORMULATEXT(A1:B2)', context)).toEqual({
      kind: 'error', code: FormulaErrorCode.NotAvailable,
    });
  });

  it('accepts date text as an OFFSET row count', () => {
    const context = createContext();
    expect(evaluate('=OFFSET(A1,"2024-02-29",1)', context)).toBe(0);
  });

  it('uses the LOOKUP vector orientation and ignores unselected error cells', () => {
    expect(evaluate('=LOOKUP(2,{1,2;10,20})')).toBe(2);
    expect(evaluate('=LOOKUP(2,{1,10;2,20})')).toBe(20);
    expect(evaluate('=LOOKUP(2,{FALSE,2;1,3},{10,20,30})')).toBe(20);
    const errorCell = createContext({ getCellValue: () => ({ kind: 'error', code: '#REF!' }) });
    expect(evaluate('=LOOKUP(2,A1,{10,20,30})', errorCell)).toEqual({ kind: 'error', code: '#N/A' });
    expect(evaluate('=LOOKUP(2,{1,2,3},A1)', errorCell)).toBe(0);
    expect(evaluate('=LOOKUP(2,{1,2,3},-60)')).toEqual({ kind: 'error', code: '#N/A' });
    expect(evaluate('=LOOKUP(2,"2024-02-29",{10,20,30})')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=LOOKUP({1,2,3},{10,20,30})')).toEqual({ kind: 'error', code: '#N/A' });
  });

  it('preserves VLOOKUP approximate matches in an unsorted prefix', () => {
    expect(evaluate('=VLOOKUP(2,{9,-4;-3,3;4,10;11,-2;-1,5;6,12;-6,0;1,7},2,TRUE)')).toEqual({
      kind: 'error',
      code: FormulaErrorCode.NotAvailable,
    });
    expect(evaluate('=VLOOKUP(2,{5,11;12,-1;0,6;7,-6;-5,1;2,8;9,-4;-3,3},2,"FALSE")')).toBe(8);
    expect(
      evaluate(
        '=VLOOKUP(2,{2,8;3,9},A1,FALSE)',
        createContext({
          getCellValue: () => ({ kind: 'error', code: FormulaErrorCode.Number }),
        }),
      ),
    ).toEqual({ kind: 'error', code: FormulaErrorCode.Reference });
  });

  it('uses binary search over the full range for numeric VLOOKUP approximate matches', () => {
    const keys = [6, -6, 1, 8, -4, 3, 10, -2];
    const results = [12, 0, 7, -5, 2, 9, -3, 4];
    const context = createContext({
      getCellValue: (row, col) => (col === 0 ? keys[row] ?? 0 : col === 2 ? results[row] ?? 0 : 0),
      metadata: {
        readCell: ({ row, col }) => ({
          reference: { row, col },
          source: row < keys.length ? 'value' : 'empty',
          value: col === 0 ? keys[row] ?? 0 : 0,
        }),
      },
    });
    expect(evaluate('=VLOOKUP(2,A1:C100,3,-10)', context)).toBe(7);
    expect(evaluate('=VLOOKUP(2,A1:C100,3,FALSE)', context)).toEqual({
      kind: 'error',
      code: FormulaErrorCode.NotAvailable,
    });
  });

  it('returns the last duplicate key in numeric range lookups', () => {
    const cells = [[1, 10], [2, 20], [2, 30], [3, 40]];
    const context = createContext({
      getCellValue: (row, col) => cells[row]?.[col] ?? 0,
      metadata: {
        readCell: ({ row, col }) => ({
          reference: { row, col }, source: 'value', value: cells[row]?.[col] ?? 0,
        }),
      },
    });
    expect(evaluate('=VLOOKUP(2,A1:B4,2,TRUE)', context)).toBe(30);
    expect(evaluate('=LOOKUP(2,A1:A4,B1:B4)', context)).toBe(30);
    expect(evaluate('=VLOOKUP(2,{1,10;2,20;2,30;3,40},2,TRUE)')).toBe(30);
  });

  it('truncates CHOOSE indexes and preserves source errors', () => {
    expect(evaluate('=CHOOSE(1.8751,"A","B")')).toBe('A');
    expect(evaluate('=CHOOSE(2.625,"A","B")')).toBe('B');
    const context = createContext({ getCellValue: () => ({ kind: 'error', code: FormulaErrorCode.NotAvailable }) });
    expect(evaluate('=CHOOSE(A1,"A","B")', context)).toEqual({
      kind: 'error',
      code: FormulaErrorCode.NotAvailable,
    });
  });

  it('selects each CHOOSE index in an array without changing scalar behavior', () => {
    expect(evaluate('=CHOOSE({1,2},10,20)')).toEqual([[10, 20]]);
    expect(evaluate('=CHOOSE({2;1},10,20)')).toEqual([[20], [10]]);
    expect(evaluate('=SUM(CHOOSE({1,2},10,20))')).toBe(30);
    expect(evaluate('=COLUMNS(CHOOSE({1,2},10,20))')).toBe(2);
    expect(evaluate('=CHOOSE(2,10,20)')).toBe(20);
    expect(evaluate('=CHOOSE({1,3},10,20)')).toEqual([[10, { kind: 'error', code: FormulaErrorCode.Value }]]);
  });

  it('resolves selected LOOKUP result references and searches numeric ranges by position', () => {
    expect(evaluate('=LOOKUP(2,{1,2,3},IF(TRUE,A1,0))')).toBe(0);
    expect(evaluate('=LOOKUP(3,{1,2,3},{10,20})')).toEqual({ kind: 'error', code: '#N/A' });
    expect(evaluate('=LOOKUP(3,{1,2,3},{10,20,30})')).toBe(30);
    expect(evaluate('=LOOKUP(2,{1,2,3},-60)')).toEqual({
      kind: 'error',
      code: FormulaErrorCode.NotAvailable,
    });
    const values = [5.6253, 1, 2];
    const context = createContext({ getCellValue: (row) => values[row] ?? 0 });
    expect(evaluate('=LOOKUP(2,A1:A3,{10,20,30})', context)).toBe(30);
  });

  it('distinguishes empty-cell VLOOKUP keys from numeric zero', () => {
    const context = createContext({
      getCellValue: () => 0,
      iterateRangeCells: () => [{ row: 0, col: 0, value: 0, source: 'empty' }],
    });
    expect(evaluate('=VLOOKUP(A1,{0,10;1,20},2,FALSE)', context)).toEqual({
      kind: 'error',
      code: FormulaErrorCode.NotAvailable,
    });
    expect(evaluate('=VLOOKUP(IF(TRUE,A1,0),{0,10;1,20},2,FALSE)', context)).toEqual({
      kind: 'error',
      code: FormulaErrorCode.NotAvailable,
    });
    expect(evaluate('=VLOOKUP(0,{0,10;1,20},2,FALSE)', context)).toBe(10);
  });

  it('keeps OFFSET references and truncates fractional shifts and dimensions', () => {
    expect(evaluate('=OFFSET(IF(TRUE,A1,0),1,1)')).toBe(11);
    expect(evaluate('=OFFSET(A1,-0.5,1)')).toBe(1);
    expect(evaluate('=OFFSET(A1,0.3753,1)')).toBe(1);
    expect(evaluate('=OFFSET(A1,1,1,-1)')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=OFFSET(A1,1,1,0)')).toEqual({ kind: 'error', code: '#REF!' });
    expect(evaluate('=OFFSET(A1,1,1,0.5)')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=OFFSET(A1,1,1,-0.5004)')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=ROWS(OFFSET(A1,1,1,4.8754))')).toBe(4);
    expect(evaluate('=OFFSET(A1,1,1,-1.2503)')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=OFFSET(A1,1,1,1.005)')).toBe(11);
    expect(
      evaluate(
        '=OFFSET(A1,1,1,IF(TRUE,A1,0))',
        createContext({
          getCellValue: (row, col) => (row === 0 && col === 0 ? -5.5002 : row * 10 + col),
        }),
      ),
    ).toEqual({ kind: 'error', code: '#REF!' });
    expect(evaluate('=ROWS(OFFSET(A1,0,0,2.5,1))')).toBe(2);
    expect(evaluate('=ROWS(OFFSET(A1,0,0,SUM(1.5,1),1))')).toBe(2);
    expect(evaluate('=OFFSET(A1,1/0,1)')).toEqual({ kind: 'error', code: '#DIV/0!' });
  });

  it('returns a reference error when OFFSET height extends beyond the sheet', () => {
    const context = createContext({
      getCellValue: (row, col) => row === 0 && col === 0 ? -1_000_000_000_000 : row * 10 + col,
    });
    expect(evaluate('=OFFSET(A1,1,1,IF(TRUE,A1,0))', context)).toEqual({
      kind: 'error', code: FormulaErrorCode.Reference,
    });
    expect(evaluate('=OFFSET(A1,1,1,-2)', context)).toEqual({
      kind: 'error', code: FormulaErrorCode.Value,
    });
  });

  it('accepts a sub-unit negative OFFSET height supplied by a cell reference', () => {
    const context = createContext({
      getCellValue: (row, col) => row === 0 && col === 0 ? -0.5004 : row * 10 + col,
    });
    expect(evaluate('=OFFSET(A1,1,1,$A$1)', context)).toBe(11);
    expect(evaluate('=ROWS(OFFSET(A1,1,1,$A$1))', context)).toBe(1);
    expect(evaluate('=OFFSET(A1,1,1,-0.5004)', context)).toEqual({
      kind: 'error', code: FormulaErrorCode.Value,
    });
  });

  it('supports dynamic-array transforms and preserves rectangular shape', () => {
    expect(evaluate('=TRANSPOSE({1,2;3,4})')).toEqual([
      [1, 3],
      [2, 4],
    ]);
    expect(evaluate('=HSTACK({1;2},{3;4})')).toEqual([
      [1, 3],
      [2, 4],
    ]);
    expect(evaluate('=VSTACK({1,2},{3,4})')).toEqual([
      [1, 2],
      [3, 4],
    ]);
    expect(evaluate('=FILTER({1;2;3},{TRUE;FALSE;TRUE})')).toEqual([[1], [3]]);
    expect(evaluate('=UNIQUE({1;1;2})')).toEqual([[1], [2]]);
    expect(evaluate('=SORT({2;1})')).toEqual([[1], [2]]);
  });

  it('keeps a range error in its position when transposing', () => {
    const notAvailable = { kind: 'error' as const, code: FormulaErrorCode.NotAvailable };
    expect(evaluate('=TRANSPOSE(NA())')).toEqual(notAvailable);
    const context = createContext({
      isCellInBounds: (row, col) => row >= 0 && row < 200 && col >= 0 && col < 20,
      getCellValue: (row, col) => col === 1
        ? row === 104 ? 1 : row === 105 ? notAvailable : row === 106 ? 2 : null
        : null,
    });
    expect(evaluate('=TRANSPOSE(B105:B107)', context)).toEqual([[1, notAvailable, 2]]);
  });

  it('registers dynamic dependencies for INDIRECT and resolves text references', () => {
    const dependencies: unknown[] = [];
    const result = evaluate(
      '=INDIRECT("B2")',
      createContext({
        referenceResolver: {
          resolve: () => ({ source: { kind: 'currentSheet' }, startRow: 1, startCol: 1, endRow: 1, endCol: 1 }),
        },
        readReference: () => 42,
        registerDynamicDependency: (reference) => dependencies.push(reference),
      }),
    );
    expect(result).toEqual(42);
    expect(dependencies).toHaveLength(1);
    expect(
      evaluate(
        '=INDIRECT(A2)',
        createContext({
          getCellValue: () => ({ kind: 'text', value: 'B2', numericCoercion: 'allow' }),
          referenceResolver: {
            resolve: () => ({ source: { kind: 'currentSheet' }, startRow: 1, startCol: 1, endRow: 1, endCol: 1 }),
          },
          readReference: () => 42,
        }),
      ),
    ).toBe(42);
  });

  it('reads calculated formula values through a text reference', () => {
    const context = createContext({
      isCellInBounds: (row, col) => row >= 0 && row < 200 && col >= 0 && col < 20,
      getCellValue: (row, col) => row === 176 && col === 10 ? 7 : 0,
      referenceResolver: {
        resolve: () => ({ source: { kind: 'currentSheet' }, startRow: 176, startCol: 10, endRow: 176, endCol: 10 }),
      },
    });
    expect(evaluate('=INDIRECT("K177")', context)).toBe(7);
  });

  it('returns stable spreadsheet errors for invalid dimensions and missing matches', () => {
    expect(evaluate('=HLOOKUP(TRUE,{1,2;10,20},2,FALSE)')).toEqual({
      kind: 'error',
      code: FormulaErrorCode.NotAvailable,
    });
    expect(
      evaluate(
        '=ADDRESS(2,A1)',
        createContext({ getCellValue: () => ({ kind: 'error', code: FormulaErrorCode.DivisionByZero }) }),
      ),
    ).toEqual({
      kind: 'error',
      code: FormulaErrorCode.DivisionByZero,
    });
    expect(evaluate('=EXPAND({1},2,1000000000000,0)')).toEqual({ kind: 'error', code: FormulaErrorCode.Number });
    expect(evaluate('=CHOOSECOLS({1,2},0)')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=TAKE({1;2},3)')).toEqual([[1], [2]]);
    expect(evaluate('=MATCH(9,{1,2},0)')).toEqual({ kind: 'error', code: FormulaErrorCode.NotAvailable });
    expect(evaluate('=MATCH(40,{25,38,40,41},-1)')).toEqual({ kind: 'error', code: FormulaErrorCode.NotAvailable });
    expect(evaluate('=XLOOKUP(9,{1,2},{10,20})')).toEqual({ kind: 'error', code: FormulaErrorCode.NotAvailable });
  });

  it('ADDRESS truncates numeric positions and accepts date text as a serial position', () => {
    expect(evaluate('=ADDRESS("1.5",2.675)')).toBe('$B$1');
    expect(evaluate('=ADDRESS("2024-02-29",3)')).toBe('$C$45351');
    expect(evaluate('=ADDRESS(2,3,4.8754)')).toBe('C2');
    expect(evaluate('=ADDRESS(1048576,16384)')).toBe('$XFD$1048576');
    expect(evaluate('=ADDRESS(1048577,3)')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=ADDRESS(2,16385)')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=ADDRESS(1,1,,,"SHEET2")')).toBe('SHEET2!$A$1');
    expect(evaluate('=ADDRESS(2,3,1,FALSE,"[Book1]Sheet1")')).toBe('[Book1]Sheet1!R2C3');
    expect(evaluate('=ADDRESS(2,3,1,FALSE,A40)', createContext({
      getCellValue: () => ({ kind: 'text', value: '[Book1]Sheet1', numericCoercion: 'deny' }),
    }))).toBe('[Book1]Sheet1!R2C3');
    expect(evaluate('=ADDRESS(2,3,1,TRUE,"[Book1.xlsx]Sheet1")')).toBe('[Book1.xlsx]Sheet1!$C$2');
    expect(evaluate('=ADDRESS(2,3,1,FALSE,"[Book 1]Sheet 1")')).toBe("'[Book 1]Sheet 1'!R2C3");
    expect(evaluate('=ADDRESS(1,1,,,"Sales Data")')).toBe("'Sales Data'!$A$1");
    expect(evaluate(`=ADDRESS(1,1,,,"O'Brien")`)).toBe("'O''Brien'!$A$1");
  });

  it('XLOOKUP treats an omitted lookup value as a blank cell', () => {
    const context = createContext({
      getCellValue: (row, col) => row === 0 && col === 9 ? null
        : row === 1 && col === 9 ? 1
        : row === 0 && col === 10 ? 'found' : 'other',
    });
    expect(evaluate('=XLOOKUP(,J1:J2,K1:K2)', context)).toBe('found');
    expect(evaluate('=XLOOKUP(J1,J1:J2,K1:K2)', context)).toBe('found');
    expect(evaluate('=XLOOKUP(0,J1:J2,K1:K2)', context)).toEqual({ kind: 'error', code: '#N/A' });
    expect(evaluate('=XLOOKUP(,{1;2},{10;20})')).toEqual({ kind: 'error', code: '#N/A' });
    const hostContext = createContext({
      getCellValue: (row, col) => col === 9 ? row === 2 ? 1 : 0
        : ['zero', 'blank', 'one'][row] ?? null,
      metadata: {
        readCell: ({ row, col, sheetName }) => ({
          reference: { row, col, ...(sheetName === undefined ? {} : { sheetName }) },
          source: row === 1 && col === 9 ? 'empty' : 'value',
          value: col === 9 ? row === 2 ? 1 : 0 : ['zero', 'blank', 'one'][row] ?? null,
        }),
      },
    });
    expect(evaluate('=XLOOKUP(,J1:J3,K1:K3)', hostContext)).toBe('blank');
  });

  it('HLOOKUP checks for a match before validating the return row', () => {
    expect(evaluate('=HLOOKUP(2,FALSE,2,FALSE)')).toEqual({ kind: 'error', code: '#N/A' });
    expect(evaluate('=HLOOKUP(2,{1,2;10,20},-60,FALSE)')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=HLOOKUP(2,{1,2;10,20},3,FALSE)')).toEqual({ kind: 'error', code: '#REF!' });
    expect(evaluate('=HLOOKUP(2,{1,2;10,20},1.5,FALSE)')).toBe(2);
    expect(evaluate('=HLOOKUP(2,{1,2;10,20},2,"FALSE")')).toBe(20);
    expect(evaluate('=HLOOKUP(2,{1,2;10,20},"TRUE",FALSE)')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(
      evaluate(
        '=HLOOKUP(2,{1,2;10,20},A1,FALSE)',
        createContext({ getCellValue: () => ({ kind: 'error', code: '#NAME?' }) }),
      ),
    ).toEqual({ kind: 'error', code: '#REF!' });
    expect(
      evaluate(
        '=HLOOKUP(2,A1,2,FALSE)',
        createContext({
          getCellValue: () => ({ kind: 'error', code: '#DIV/0!' }),
        }),
      ),
    ).toEqual({ kind: 'error', code: '#N/A' });
    expect(
      evaluate(
        '=HLOOKUP(2,{1,2;10,20},2,A1)',
        createContext({
          getCellValue: () => ({ kind: 'text', value: 'FALSE', numericCoercion: 'allow' }),
        }),
      ),
    ).toBe(20);
  });

  it('INDEX preserves parameter errors, truncates offsets, and validates the area', () => {
    const errorCell = createContext({ getCellValue: () => ({ kind: 'error', code: '#DIV/0!' }) });
    expect(evaluate('=INDEX({1,2;3,4},A1,1)', errorCell)).toEqual({ kind: 'error', code: '#DIV/0!' });
    expect(evaluate('=INDEX({1,2;3,4},2,A1)', errorCell)).toEqual({ kind: 'error', code: '#DIV/0!' });
    expect(evaluate('=INDEX({1,2;3,4},2,1,A1)', errorCell)).toEqual({ kind: 'error', code: '#DIV/0!' });
    expect(evaluate('=INDEX({1,2;3,4},2,1.5)')).toBe(3);
    expect(evaluate('=INDEX({1,2;3,4},2,2.675)')).toBe(4);
    expect(evaluate('=INDEX({1,2;3,4},-0.5,1)')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=INDEX({1,2;3,4},-1e-12,1)')).toEqual([[1], [3]]);
    expect(evaluate('=INDEX({1,2;3,4},2,1,0)')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=INDEX({1,2;3,4},2,1,2)')).toEqual({ kind: 'error', code: '#REF!' });
    expect(evaluate('=INDEX({1,2;3,4},"2024-02-29",1)')).toEqual({ kind: 'error', code: '#REF!' });
    expect(evaluate('=INDEX(A1,2,1)', errorCell)).toEqual({ kind: 'error', code: '#REF!' });
    expect(evaluate('=INDEX(-1000000000000,2,1)')).toEqual({ kind: 'error', code: '#REF!' });
    expect(evaluate('=INDEX(-2.675,2,1)')).toEqual({ kind: 'error', code: '#REF!' });
    for (const code of ['#NULL!', '#N/A'] as const) {
      const source = createContext({ getCellValue: () => ({ kind: 'error', code }) });
      expect(evaluate('=INDEX(IF(TRUE,A1,0),2,1)', source)).toEqual({ kind: 'error', code: '#REF!' });
    }
    expect(evaluate('=INDEX(IF(TRUE,A1,0),2,1)', errorCell)).toEqual({ kind: 'error', code: '#DIV/0!' });
    expect(
      evaluate(
        '=INDEX(A1:A2,2,1)',
        createContext({
          getCellValue: (row) => (row === 0 ? { kind: 'error', code: '#N/A' } : 7),
        }),
      ),
    ).toBe(7);
  });

  it('MATCH uses the product match-mode and lookup-type rules', () => {
    expect(evaluate('=MATCH({1,2,3},0)')).toEqual({ kind: 'error', code: '#N/A' });
    expect(evaluate('=MATCH({1;3},{1;2;3},0)')).toEqual([[1], [3]]);
    expect(evaluate('=MATCH(TRUE,{1,2,3},0)')).toEqual({ kind: 'error', code: '#N/A' });
    expect(evaluate('=MATCH(2,{1,2,3},0.5)')).toBe(2);
    expect(evaluate('=MATCH(2,{1,2,3},-60)')).toEqual({ kind: 'error', code: '#N/A' });
    expect(evaluate('=MATCH(2,{1,2,3},"abc")')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=MATCH(2,{1,2,3},A1)', createContext({ getCellValue: () => 'abc' }))).toEqual({
      kind: 'error',
      code: '#REF!',
    });
    for (const code of [FormulaErrorCode.Name, FormulaErrorCode.Number]) {
      const context = createContext({ getCellValue: () => ({ kind: 'error', code }) });
      expect(evaluate('=MATCH(2,{1,2,3},A1)', context)).toEqual({ kind: 'error', code: '#REF!' });
      expect(evaluate('=MATCH(2,{1,2,3},IF(TRUE,A1,0))', context)).toEqual({ kind: 'error', code: '#REF!' });
    }
    expect(evaluate('=MATCH(2,{1,2,3},IF(TRUE,A1,0))', createContext({ getCellValue: () => 'abc' }))).toEqual({
      kind: 'error', code: '#REF!',
    });
    expect(evaluate('=MATCH("B",{"A";"B"},1/0)')).toEqual({
      kind: 'error', code: FormulaErrorCode.DivisionByZero,
    });
    expect(
      evaluate(
        '=XMATCH(2,{1,2},A1)',
        createContext({
          getCellValue: () => ({ kind: 'error', code: '#NAME?' }),
        }),
      ),
    ).toEqual({ kind: 'error', code: '#NAME?' });
    expect(
      evaluate(
        '=XMATCH(2,{1,2},0,A1)',
        createContext({
          getCellValue: () => ({ kind: 'error', code: FormulaErrorCode.Name }),
        }),
      ),
    ).toEqual({ kind: 'error', code: FormulaErrorCode.Name });
    expect(evaluate('=MATCH(2,{1,2;3,4},0)')).toEqual({ kind: 'error', code: '#N/A' });
    expect(
      evaluate(
        '=MATCH(2,A1,0)',
        createContext({
          getCellValue: () => ({ kind: 'error', code: '#DIV/0!' }),
        }),
      ),
    ).toEqual({ kind: 'error', code: '#N/A' });
  });

  it('reads ready host caches and leaves pending work outside evaluation', () => {
    const services: Record<string, unknown> = {
      [FormulaImageServiceDefinition.id]: {
        read: () => ({ status: FormulaServiceCacheStatus.Ready, value: { assetId: 'img', source: 'cached://img' } }),
      },
      [FormulaPivotDataServiceDefinition.id]: { getData: () => 12 },
      [FormulaRtdServiceDefinition.id]: { read: () => ({ status: FormulaServiceCacheStatus.Pending }) },
    };
    const externalServices = {
      get<T>(definition: { id: string }): T | undefined {
        return services[definition.id] as T | undefined;
      },
    };
    expect(evaluate('=IMAGE("https://example.com/a.png")', createContext({ externalServices }))).toBe('cached://img');
    expect(evaluate('=GETPIVOTDATA("Sales","A1")', createContext({ externalServices }))).toBe(12);
    expect(evaluate('=RTD("p","s","t")', createContext({ externalServices }))).toEqual({
      kind: 'error',
      code: FormulaErrorCode.NotAvailable,
    });
  });
});
